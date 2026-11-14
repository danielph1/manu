import {NextRequest,NextResponse} from 'next/server';
import {getPool} from '@/lib/db';
import {financeAuth,dateOnly,money,positive} from '@/lib/financas/finance';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'private, no-store'};
const COMPONENTES=['entrada','boleto','financiamento'] as const;

/** Agendamento é previsão: não cria baixa nem receita no razão de caixa. */
export async function POST(req:NextRequest){
 const b=await req.json().catch(()=>null),auth=await financeAuth(req,b?.empresa_id);
 if(auth instanceof NextResponse)return auth;
 const faturamentoId=positive(b?.faturamento_id),componente=String(b?.componente||'');
 if(!faturamentoId||!COMPONENTES.includes(componente as typeof COMPONENTES[number]))
  return NextResponse.json({error:'Venda ou componente inválido'},{status:400});
 const db=await getPool().connect();
 try {
  const valor=money(b?.valor),vencimento=dateOnly(b?.vencimento);
  const observacao=String(b?.observacao||'').trim().slice(0,500);
  await db.query('BEGIN');
  const resultado=await db.query<any>(`SELECT f.id,f.empresa_id,f.entrada_total,f.entrada_boleto,
    l.id AS lead_id,
    COALESCE(CASE WHEN fc.lead_id=l.id THEN NULLIF(fc.valor_liberado,0) END,
      CASE WHEN fc.lead_id=l.id THEN NULLIF(fc.valor_financiado,0) END,
      fallback.financiado) AS financiado
    FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
    JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(ff.valor_liberado,0),NULLIF(ff.valor_financiado,0)) AS financiado
      FROM public.fichas_credito ff WHERE ff.lead_id=l.id
      AND COALESCE(NULLIF(ff.valor_liberado,0),NULLIF(ff.valor_financiado,0)) IS NOT NULL
      ORDER BY (ff.id=f.ficha_id) DESC,ff.id DESC LIMIT 1
    ) fallback ON TRUE
    WHERE f.id=$1 AND f.empresa_id=$2 AND (l.venda_concluida=TRUE OR l.data_venda IS NOT NULL)
      AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído') FOR UPDATE OF l`,
    [faturamentoId,auth.empresaId]);
  const venda=resultado.rows[0];
  if(!venda)throw Error('Venda não encontrada na empresa ou sem confirmação no CRM');
  const origem=componente==='entrada'?
    Math.max(0,Number(venda.entrada_total||0)-Number(venda.entrada_boleto||0)):
    componente==='boleto'?Math.max(0,Number(venda.entrada_boleto||0)):
    venda.financiado==null?null:Number(venda.financiado);
  const ajuste=(await db.query<{valor_informado:number|null;desconto:number}>(`
    SELECT valor_informado,desconto FROM public.manu_fin_venda_ajustes
    WHERE empresa_id=$1 AND lead_id=$2 AND componente=$3`,[auth.empresaId,venda.lead_id,componente])).rows[0];
  const total=ajuste?.valor_informado==null?origem:Number(ajuste.valor_informado);
  if(total==null||total<=0)throw Error('O valor deste componente não está documentado');
  const recebidoNovo=await db.query<{total:number}>(`SELECT COALESCE(SUM(valor),0)::numeric AS total
    FROM public.manu_fin_pagamentos_venda WHERE empresa_id=$1 AND lead_id=$2
      AND componente=$3 AND estornado_em IS NULL`,[auth.empresaId,venda.lead_id,componente]);
  const recebidoLegado=await db.query<{total:number}>(`SELECT COALESCE(SUM(valor),0)::numeric AS total
    FROM public.manu_movimentos_caixa WHERE empresa_id=$1 AND origem_tipo=$2
      AND origem_id=$3 AND status='confirmado'`,
    [auth.empresaId,`faturamento_${componente}`,`lead:${venda.lead_id}`]);
  const planejado=await db.query<{total:number}>(`SELECT COALESCE(SUM(GREATEST(p.valor-
    COALESCE((SELECT SUM(pg.valor) FROM public.manu_fin_pagamentos_venda pg
      WHERE pg.promessa_id=p.id AND pg.empresa_id=p.empresa_id AND pg.estornado_em IS NULL),0),0)),0)::numeric AS total
    FROM public.manu_fin_venda_promessas p WHERE p.empresa_id=$1 AND p.lead_id=$2
      AND p.componente=$3 AND p.ativo`,[auth.empresaId,venda.lead_id,componente]);
  const saldo=Math.max(0,total-Number(ajuste?.desconto||0)-Number(recebidoNovo.rows[0]?.total||0)-Number(recebidoLegado.rows[0]?.total||0));
  const disponivel=Math.max(0,saldo-Number(planejado.rows[0]?.total||0));
  if(Number(valor)>disponivel+0.009)throw Error(`Valor para agendar excede o saldo livre: R$ ${disponivel.toFixed(2)}`);
  const r=await db.query<{id:number}>(`INSERT INTO public.manu_fin_venda_promessas
    (empresa_id,lead_id,faturamento_id,componente,valor,vencimento,observacao,criado_por)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [auth.empresaId,venda.lead_id,faturamentoId,componente,valor,vencimento,observacao,auth.actor.id]);
  await db.query('COMMIT');
  return NextResponse.json({ok:true,id:r.rows[0].id},{status:201,headers:noStore});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});
  return NextResponse.json({error:e instanceof Error?e.message:'Não foi possível agendar o saldo'},{status:400});}
 finally{db.release();}
}

/** Mudança de data e cancelamento preservam recebimentos e histórico. */
export async function PATCH(req:NextRequest){
 const b=await req.json().catch(()=>null),auth=await financeAuth(req,b?.empresa_id);
 if(auth instanceof NextResponse)return auth;
 const id=positive(b?.promessa_id),acao=String(b?.acao||'');
 if(!id||!['vencimento','cancelar'].includes(acao))
  return NextResponse.json({error:'Agendamento ou ação inválida'},{status:400});
 const db=await getPool().connect();
 try {
  await db.query('BEGIN');
  const r=await db.query<any>(`SELECT id,ativo FROM public.manu_fin_venda_promessas
    WHERE id=$1 AND empresa_id=$2 FOR UPDATE`,[id,auth.empresaId]);
  if(!r.rows[0])throw Error('Agendamento não encontrado nesta empresa');
  if(!r.rows[0].ativo)throw Error('Agendamento já cancelado');
  if(acao==='vencimento'){
   const data=dateOnly(b?.vencimento);
   await db.query(`UPDATE public.manu_fin_venda_promessas SET vencimento=$1,atualizado_em=now()
      WHERE id=$2 AND empresa_id=$3`,[data,id,auth.empresaId]);
  }else{
   await db.query(`UPDATE public.manu_fin_venda_promessas SET ativo=FALSE,
      atualizado_em=now() WHERE id=$1 AND empresa_id=$2`,[id,auth.empresaId]);
  }
  await db.query('COMMIT');return NextResponse.json({ok:true},{headers:noStore});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});
  return NextResponse.json({error:e instanceof Error?e.message:'Erro no agendamento'},{status:400});}
 finally{db.release();}
}
