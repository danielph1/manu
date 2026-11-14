import {NextRequest,NextResponse} from 'next/server';
import {getPool,queryOne} from '@/lib/db';
import {financeAuth,money,dateOnly,positive} from '@/lib/financas/finance';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const b=await req.json().catch(()=>null);
 const auth=await financeAuth(req,b?.empresa_id);if(auth instanceof NextResponse)return auth;
 const id=positive(b?.faturamento_id),componente=String(b?.componente||'');
 if(!id||!['entrada','financiamento'].includes(componente))return NextResponse.json({error:'Documento/componente inválido'},{status:400});
 try{
  const venda=await queryOne<any>(`SELECT f.id,f.empresa_id,f.loja,f.entrada_total,f.placa,
       l.id AS lead_id,l.venda_concluida,l.data_venda,
       COALESCE(NULLIF(fc.valor_liberado,0),NULLIF(fc.valor_financiado,0),0) AS financiado
   FROM public.faturamentos f LEFT JOIN public.fichas_credito fc ON fc.id=f.ficha_id
   JOIN public.leads l ON l.id=COALESCE(f.lead_id,fc.lead_id) AND l.empresa_id=f.empresa_id
   WHERE f.id=$1 AND f.empresa_id=$2 AND LOWER(COALESCE(f.status,'')) NOT IN ('cancelado','excluido','excluído')
     AND (l.venda_concluida=TRUE OR l.data_venda IS NOT NULL)`,[id,auth.empresaId]);
  if(!venda)return NextResponse.json({error:'Faturamento não vinculado a uma venda da empresa'},{status:404});
  const documento=componente==='entrada'?Number(venda.entrada_total||0):Number(venda.financiado||0);
  const valor=money(b?.valor ?? documento);
  const dia=dateOnly(b?.data_movimento);
  const origemTipo=componente==='entrada'?'faturamento_entrada':'faturamento_financiamento';
  // Chave por lead, nao por documento: mesmo cliente/venda nao recebe duas baixas repetidas.
  const origemId=`lead:${venda.lead_id}`;
  const client=await getPool().connect();
  try{
   await client.query('BEGIN');
   // Uma confirmacao pode corrigir a propria baixa anterior sem duplicacao.
   const r=await client.query(`INSERT INTO public.manu_movimentos_caixa
      (empresa_id,loja,tipo,status,categoria,descricao,valor,data_movimento,origem_tipo,origem_id,criado_por)
      VALUES ($1,$2,'entrada','confirmado',$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (empresa_id,origem_tipo,origem_id) WHERE origem_tipo IN ('financas_parcela','faturamento_entrada','faturamento_financiamento')
      DO UPDATE SET status='confirmado',valor=EXCLUDED.valor,data_movimento=EXCLUDED.data_movimento,
        descricao=EXCLUDED.descricao,loja=EXCLUDED.loja RETURNING id`,
      [auth.empresaId,venda.loja,componente==='entrada'?'Entrada da venda':'Financiamento recebido',
        `Faturamento #${id} · ${String(venda.placa||'')}`,valor,dia,origemTipo,origemId,auth.actor.id]);
   await client.query('COMMIT');return NextResponse.json({ok:true,id:r.rows[0]?.id});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro ao confirmar o pagamento'},{status:400});}
}
