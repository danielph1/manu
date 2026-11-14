import {NextRequest,NextResponse} from 'next/server';
import {query,queryOne} from '@/lib/db';
import {financeAuth,materializar,reconcilePaid,money,dateOnly,positive,lojaDaEmpresa} from '@/lib/financas/finance';
export const runtime='nodejs';export const dynamic='force-dynamic';
const noStore={'Cache-Control':'private, no-store'};

export async function GET(req:NextRequest){
 const auth=await financeAuth(req,req.nextUrl.searchParams.get('empresa_id'));
 if(auth instanceof NextResponse)return auth;
 const {empresaId}=auth;
 try{
  await materializar(empresaId);
  const [caixa,agenda,parcelas,boletos,vendas,recebidas,movimentos]=await Promise.all([
   reconcilePaid(empresaId),
   query(`SELECT a.*,l.nome_lead AS cliente FROM public.manu_fin_agendamentos a
      LEFT JOIN public.leads l ON l.id=a.lead_id AND l.empresa_id=a.empresa_id
      WHERE a.empresa_id=$1 AND a.ativo ORDER BY a.origem DESC,a.inicio DESC LIMIT 300`,[empresaId]),
   query(`SELECT p.*,a.descricao,a.tipo,a.forma,a.categoria,a.origem,a.loja,
      COALESCE(l.nome_lead,'') AS cliente
      FROM public.manu_fin_parcelas p JOIN public.manu_fin_agendamentos a
      ON a.id=p.agendamento_id AND a.empresa_id=p.empresa_id
      LEFT JOIN public.leads l ON l.id=a.lead_id AND l.empresa_id=a.empresa_id
      WHERE p.empresa_id=$1 AND (a.ativo OR p.status='pago')
       AND p.vencimento <= (timezone('America/Sao_Paulo',now())::date + interval '12 months')::date
      ORDER BY CASE WHEN p.status='pendente' THEN 0 ELSE 1 END,p.vencimento ASC,p.id LIMIT 600`,[empresaId]),
   query(`WITH boletos AS (
      SELECT l.id,l.nome_lead AS nome,f.id AS faturamento_id,
        f.entrada_boleto AS boleto_documentado
      FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
      JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
      WHERE l.empresa_id=$1 AND COALESCE(f.entrada_boleto,0)>0
      UNION ALL
      SELECT l.id,l.nome_lead,NULL::bigint AS faturamento_id,fc.boleto_total AS boleto_documentado
      FROM public.fichas_credito fc JOIN public.leads l ON l.id=fc.lead_id
      WHERE l.empresa_id=$1 AND (COALESCE(fc.gerou_boleto,FALSE)=TRUE OR COALESCE(fc.boleto_total,0)>0)
    ) SELECT DISTINCT ON(id) * FROM boletos ORDER BY id,faturamento_id DESC NULLS LAST LIMIT 100`,[empresaId]),
   // Uma unica nota por venda identificavel: faturas duplicadas nao inflam o bruto.
   query(`WITH faturas AS (
      SELECT DISTINCT ON(l.id) l.id AS lead_id,l.nome_lead AS cliente,
        f.id AS faturamento_id,f.loja,f.placa,f.created_at,
        GREATEST(COALESCE(f.entrada_total,0),0)::numeric AS entrada,
        GREATEST(COALESCE(NULLIF(fc.valor_liberado,0),NULLIF(fc.valor_financiado,0),0),0)::numeric AS financiamento
      FROM public.faturamentos f
      LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
      JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
      WHERE l.empresa_id=$1 AND (l.venda_concluida=TRUE OR l.data_venda IS NOT NULL)
        AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído')
      ORDER BY l.id,f.id DESC)
      SELECT *, (entrada+financiamento) AS bruto_documentado FROM faturas ORDER BY created_at DESC LIMIT 250`,[empresaId]),
   query(`SELECT id,origem_tipo,origem_id,valor,data_movimento
     FROM public.manu_movimentos_caixa WHERE empresa_id=$1 AND status='confirmado'
       AND origem_tipo IN ('faturamento_entrada','faturamento_financiamento') LIMIT 500`,[empresaId]),
   query(`SELECT id,loja,tipo,status,categoria,descricao,valor,data_movimento,origem_tipo,origem_id
      FROM public.manu_movimentos_caixa WHERE empresa_id=$1 ORDER BY data_movimento DESC,id DESC LIMIT 200`,[empresaId])
  ]);
  const ds=vendas.rows as Array<any>;
  return NextResponse.json({caixa,
    vendas:ds.map(f=>({...f,entrada:Number(f.entrada),financiamento:Number(f.financiamento),bruto_documentado:Number(f.bruto_documentado)})),
    bruto_documentado:ds.reduce((s,f)=>s+Number(f.bruto_documentado),0),
    movimentos_recebidos:recebidas.rows,
    agenda:agenda.rows,parcelas:parcelas.rows,clientes_boleto:boletos.rows,
    movimentos:movimentos.rows,
    nota:'Bruto documentado nao e dinheiro recebido. Confirme cada componente da venda para contabilizar no caixa.'},
    {headers:noStore});
 }catch(e){console.error('[financas GET]',e instanceof Error?e.message:'erro');
   return NextResponse.json({error:'Finanças indisponíveis: confira migrations, permissões e estrutura de faturamentos.'},{status:503});}
}

export async function POST(req:NextRequest){
 const b=await req.json().catch(()=>null);
 const auth=await financeAuth(req,b?.empresa_id);if(auth instanceof NextResponse)return auth;
 const {empresaId,actor}=auth;
 try{
  const tipo=String(b?.tipo||'');if(!['entrada','saida'].includes(tipo))return NextResponse.json({error:'Tipo inválido'},{status:400});
  const desc=String(b?.descricao||'').trim().slice(0,500);
  const categoria=String(b?.categoria||'').trim().slice(0,80);
  const loja=String(b?.loja||actor.loja||'').toUpperCase().trim();
  const forma=String(b?.forma||'outro');
  const freq=String(b?.frequencia||'unica');
  const repeticoes=b?.repeticoes===''||b?.repeticoes==null?null:positive(b.repeticoes);
  const lead=positive(b?.lead_id)||null;
  if(!desc||!categoria||!loja||!(await lojaDaEmpresa(empresaId,loja))||
      !['boleto','pix','dinheiro','cartao','transferencia','outro'].includes(forma)||
      !['mensal','unica'].includes(freq)||
      (repeticoes!==null&&(repeticoes>240||repeticoes<1||freq==='unica'&&repeticoes!==1)))
    return NextResponse.json({error:'Descrição, categoria, loja, frequência ou pagamento inválido'},{status:400});
  if(tipo==='entrada'&&forma==='boleto'&&!lead)return NextResponse.json({error:'Recebimento por boleto exige cliente selecionado'},{status:422});
  if(lead){
   const item=await queryOne(`SELECT l.id FROM public.leads l WHERE l.id=$1 AND l.empresa_id=$2`,[lead,empresaId]);
   if(!item)return NextResponse.json({error:'Cliente não pertence a empresa'},{status:403});
   if(tipo==='entrada'&&forma==='boleto'){
    const boleto=await queryOne(`SELECT id FROM (
      SELECT f.id FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
      WHERE f.empresa_id=$1 AND COALESCE(f.lead_id,fc.lead_id)=$2 AND COALESCE(f.entrada_boleto,0)>0
      UNION ALL SELECT fc.id FROM public.fichas_credito fc
        JOIN public.leads l ON l.id=fc.lead_id
      WHERE l.empresa_id=$1 AND l.id=$2 AND
        (COALESCE(fc.gerou_boleto,FALSE) OR COALESCE(fc.boleto_total,0)>0)
    ) x LIMIT 1`,[empresaId,lead]);
    if(!boleto)return NextResponse.json({error:'O cliente não possui boleto documentado em faturamento'},{status:422});
   }
  }
  const valor=money(b?.valor);const inicio=dateOnly(b?.inicio);
  const row=await queryOne<{id:number}>(`INSERT INTO public.manu_fin_agendamentos
    (empresa_id,loja,tipo,categoria,descricao,forma,lead_id,valor,inicio,frequencia,repeticoes,criado_por)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [empresaId,loja,tipo,categoria,desc,forma,lead,valor,inicio,freq,repeticoes,actor.id]);
  await materializar(empresaId);
  return NextResponse.json({ok:true,id:row?.id},{status:201,headers:noStore});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Não foi possível agendar'},{status:400});}
}
