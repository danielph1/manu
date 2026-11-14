import {NextRequest,NextResponse} from 'next/server';
import {query,queryOne} from '@/lib/db';
import {financeAuth,materializar,reconcilePaid,dateOnly,money,positive,lojaDaEmpresa} from '@/lib/financas/finance';
export const runtime='nodejs'; export const dynamic='force-dynamic';
const noStore={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){
 const auth=await financeAuth(req,req.nextUrl.searchParams.get('empresa_id'));
 if(auth instanceof NextResponse)return auth;
 const {empresaId}=auth;
 let desde:string|null=null,ate:string|null=null;
 try {if(req.nextUrl.searchParams.get('desde'))desde=dateOnly(req.nextUrl.searchParams.get('desde'));
      if(req.nextUrl.searchParams.get('ate'))ate=dateOnly(req.nextUrl.searchParams.get('ate'));
      if(desde&&ate&&desde>ate)throw Error('A data inicial deve preceder a final');}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Datas inválidas'},{status:400});}
 try{
  await materializar(empresaId);
  const scope=[empresaId,desde,ate];
  const vendaSQL=`WITH faturas AS (
   SELECT DISTINCT ON(l.id) l.id AS lead_id,l.nome_lead AS cliente,
    f.id AS faturamento_id,f.loja,f.placa,f.created_at,COALESCE(l.data_venda,f.created_at) AS data_venda,
    GREATEST(COALESCE(f.entrada_total,0)-COALESCE(f.entrada_boleto,0),0)::numeric AS entrada_documentada,
    GREATEST(COALESCE(f.entrada_boleto,0),0)::numeric AS boleto_documentado,
    COALESCE(NULLIF(fc.valor_liberado,0),NULLIF(fc.valor_financiado,0))::numeric AS financiado_ficha,
    f.fin_parcelas,f.fin_valor_parcela
   FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
   JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
   WHERE f.empresa_id=$1 AND (l.venda_concluida=TRUE OR l.data_venda IS NOT NULL)
    AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído')
    AND ($2::date IS NULL OR COALESCE(l.data_venda,f.created_at)::date >= $2::date)
    AND ($3::date IS NULL OR COALESCE(l.data_venda,f.created_at)::date <= $3::date)
   ORDER BY l.id,f.id DESC)
   SELECT f.*,COALESCE(ae.valor_informado,f.entrada_documentada) AS entrada,
    COALESCE(ab.valor_informado,f.boleto_documentado) AS boleto,
    COALESCE(af.valor_informado,f.financiado_ficha) AS financiamento,
    COALESCE(ae.desconto,0) AS desconto_entrada,COALESCE(ab.desconto,0) AS desconto_boleto,
    COALESCE(af.desconto,0) AS desconto_financiamento,
    COALESCE(ae.valor_informado,f.entrada_documentada)+COALESCE(ab.valor_informado,f.boleto_documentado)+
      COALESCE(af.valor_informado,f.financiado_ficha,0) AS bruto_documentado
   FROM faturas f
   LEFT JOIN public.manu_fin_venda_ajustes ae ON ae.empresa_id=$1 AND ae.lead_id=f.lead_id AND ae.componente='entrada'
   LEFT JOIN public.manu_fin_venda_ajustes ab ON ab.empresa_id=$1 AND ab.lead_id=f.lead_id AND ab.componente='boleto'
   LEFT JOIN public.manu_fin_venda_ajustes af ON af.empresa_id=$1 AND af.lead_id=f.lead_id AND af.componente='financiamento'
   ORDER BY f.data_venda DESC LIMIT 250`;
  const [caixa,agenda,parcelas,boletos,vendas,semVinculo,novosPagamentos,pagamentosParcela,legados,movimentos]=await Promise.all([
   reconcilePaid(empresaId,desde,ate),
   query(`SELECT a.*,l.nome_lead AS cliente FROM public.manu_fin_agendamentos a
      LEFT JOIN public.leads l ON l.id=a.lead_id AND l.empresa_id=a.empresa_id
      WHERE a.empresa_id=$1 AND a.ativo ORDER BY a.origem DESC,a.inicio DESC LIMIT 300`,[empresaId]),
   query(`SELECT p.*,a.descricao,a.tipo,a.forma,a.categoria,a.origem,a.loja,
      COALESCE(l.nome_lead,'') AS cliente,
      COALESCE((SELECT SUM(pg.valor) FROM public.manu_fin_pagamentos_parcela pg
        WHERE pg.empresa_id=p.empresa_id AND pg.parcela_id=p.id AND pg.estornado_em IS NULL),0)::numeric AS recebido,
      (SELECT COUNT(*)::int FROM public.manu_fin_pagamentos_parcela pg
        WHERE pg.empresa_id=p.empresa_id AND pg.parcela_id=p.id AND pg.estornado_em IS NULL) AS baixas
      FROM public.manu_fin_parcelas p JOIN public.manu_fin_agendamentos a ON a.id=p.agendamento_id AND a.empresa_id=p.empresa_id
      LEFT JOIN public.leads l ON l.id=a.lead_id AND l.empresa_id=a.empresa_id
      WHERE p.empresa_id=$1 AND (a.ativo OR p.status='pago' OR p.status='parcial')
       AND ($2::date IS NULL OR p.vencimento >= $2::date)
       AND ($3::date IS NULL OR p.vencimento <= $3::date)
       AND p.vencimento <= (timezone('America/Sao_Paulo',now())::date + interval '12 months')::date
      ORDER BY p.vencimento,p.id LIMIT 900`,scope),
   query(`WITH boletos AS (
      SELECT l.id,l.nome_lead AS nome,f.id AS faturamento_id,f.entrada_boleto AS boleto_documentado
      FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
      JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
      WHERE f.empresa_id=$1 AND COALESCE(f.entrada_boleto,0)>0
      UNION ALL SELECT l.id,l.nome_lead,NULL::bigint,fc.boleto_total
      FROM public.fichas_credito fc JOIN public.leads l ON l.id=fc.lead_id
      WHERE l.empresa_id=$1 AND (COALESCE(fc.gerou_boleto,FALSE)=TRUE OR COALESCE(fc.boleto_total,0)>0)
    ) SELECT DISTINCT ON(id) * FROM boletos ORDER BY id,faturamento_id DESC NULLS LAST LIMIT 200`,[empresaId]),
   query(vendaSQL,scope),
   query(`WITH todas AS (
     SELECT f.id,f.nome,f.placa,f.created_at,f.entrada_total,f.entrada_boleto,f.fin_parcelas,f.fin_valor_parcela,
      f.status,COALESCE(f.lead_id,fc.lead_id) AS lead_id,l.id AS lead_valido,
      (l.venda_concluida=TRUE OR l.data_venda IS NOT NULL) AS vendida
     FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
     LEFT JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
     WHERE f.empresa_id=$1 AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído')
      AND ($2::date IS NULL OR f.created_at::date >= $2::date)
      AND ($3::date IS NULL OR f.created_at::date <= $3::date)),
    escolhidas AS (SELECT DISTINCT ON (lead_valido) id FROM todas WHERE vendida IS TRUE
     ORDER BY lead_valido,id DESC)
    SELECT t.id,t.nome,t.placa,t.created_at,t.entrada_total,t.entrada_boleto,t.fin_parcelas,t.fin_valor_parcela,
      t.status,t.lead_id,CASE WHEN t.lead_valido IS NULL THEN 'sem_lead'
       WHEN t.vendida IS NOT TRUE THEN 'lead_sem_venda' ELSE 'duplicado' END AS motivo
    FROM todas t WHERE NOT EXISTS(SELECT 1 FROM escolhidas e WHERE e.id=t.id)
    ORDER BY t.id DESC LIMIT 200`,scope),
   query(`SELECT pg.id,pg.empresa_id,pg.lead_id,pg.faturamento_id,pg.componente,pg.valor,pg.pago_em,pg.observacao,pg.estornado_em
      FROM public.manu_fin_pagamentos_venda pg WHERE pg.empresa_id=$1
      ORDER BY pg.pago_em DESC,pg.id DESC LIMIT 2000`,[empresaId]),
   query(`SELECT pg.id,pg.parcela_id,pg.valor,pg.pago_em,pg.observacao,pg.estornado_em
      FROM public.manu_fin_pagamentos_parcela pg JOIN public.manu_fin_parcelas p ON p.id=pg.parcela_id AND p.empresa_id=pg.empresa_id
      WHERE pg.empresa_id=$1 AND ($2::date IS NULL OR p.vencimento >= $2::date)
       AND ($3::date IS NULL OR p.vencimento <= $3::date)
      ORDER BY pg.pago_em DESC,pg.id DESC LIMIT 2000`,scope),
   query(`SELECT id,origem_tipo,origem_id,valor,data_movimento FROM public.manu_movimentos_caixa
       WHERE empresa_id=$1 AND status='confirmado' AND origem_tipo IN ('faturamento_entrada','faturamento_financiamento') LIMIT 500`,[empresaId]),
   query(`SELECT id,loja,tipo,status,categoria,descricao,valor,data_movimento,origem_tipo,origem_id FROM public.manu_movimentos_caixa
      WHERE empresa_id=$1 AND ($2::date IS NULL OR data_movimento >= $2::date)
      AND ($3::date IS NULL OR data_movimento <= $3::date)
      ORDER BY data_movimento DESC,id DESC LIMIT 300`,scope)
  ]);
  const ds=vendas.rows as Array<any>;
  return NextResponse.json({caixa,desde,ate,
    vendas:ds.map(f=>({...f,entrada:Number(f.entrada),boleto:Number(f.boleto),
       financiamento:f.financiamento==null?null:Number(f.financiamento),
       bruto_documentado:Number(f.bruto_documentado)})),
    bruto_documentado:ds.reduce((s,f)=>s+Number(f.bruto_documentado),0),
    financiamento_ausente:ds.filter(f=>f.financiamento==null).length,
    documentos_nao_conciliados:semVinculo.rows,
    pagamentos_venda:novosPagamentos.rows,pagamentos_parcela:pagamentosParcela.rows,
    movimentos_recebidos:legados.rows,
    agenda:agenda.rows,parcelas:parcelas.rows,clientes_boleto:boletos.rows,movimentos:movimentos.rows,
    nota:'Bruto = soma dos valores documentados identificados (pode faltar financiamento). Recebido = apenas baixas reais por data. Documentos sem venda CRM ficam em separado.'},
    {headers:noStore});
 }catch(e){console.error('[financas GET]',e instanceof Error?e.message:'erro');
   return NextResponse.json({error:'Finanças indisponíveis: confira a migration de recebimentos parciais e a estrutura da base.'},{status:503});}
}

// Mantido o cadastro original de contas (POST), para nao mudar contratos existentes.
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

