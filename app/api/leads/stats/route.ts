import {NextRequest,NextResponse} from 'next/server';
import {queryOne} from '@/lib/db';import {requireUser} from '@/lib/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
function start(p:string){const d=new Date(),year=d.getUTCFullYear(),month=d.getUTCMonth();
 if(p==='todas'||p==='todo'||p==='all')return null;
 if(p==='hoje')return new Date(Date.UTC(year,month,d.getUTCDate())).toISOString().slice(0,10);
 if(p==='semana')return new Date(Date.now()-7*864e5).toISOString().slice(0,10);
 if(p==='mes_passado')return new Date(Date.UTC(year,month-1,1)).toISOString().slice(0,10);
 return new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
}
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const q=req.nextUrl.searchParams,superadmin=u.tipo==='superadmin';
 const requested=Number(q.get('empresa_id'));
 const empresaId=superadmin?(Number.isSafeInteger(requested)&&requested>0?requested:0):Number(u.empresa_id||0);
 if(!empresaId)return NextResponse.json({error:'Selecione a empresa para consultar indicadores'},{status:400});
 if(!superadmin&&Number.isSafeInteger(requested)&&requested>0&&requested!==empresaId)return NextResponse.json({error:'Empresa não autorizada'},{status:403});
 const args:unknown[]=[empresaId];let where=`l.empresa_id=$1 AND v.empresa_id=$1`;
 if(u.tipo==='vendedor'){
  if(!u.vendedor_id)return NextResponse.json({error:'Vendedor não vinculado'},{status:403});
  args.push(u.vendedor_id);where+=` AND l.vendedor_id=$${args.length}`;
 }
 const loja=u.tipo==='gerente'?String(u.loja||''):String(q.get('loja')||'').trim();
 if(u.tipo==='gerente'&&!loja)return NextResponse.json({error:'Gerente sem loja atribuída'},{status:403});
 if(loja&&['gerente','admin','superadmin'].includes(u.tipo)){
  args.push(loja);where+=` AND UPPER(COALESCE(v.loja,''))=UPPER($${args.length})`;
 }
 const vendedor=Number(q.get('vendedor_id'));
 if(vendedor>0&&Number.isSafeInteger(vendedor)&&['gerente','admin','marketing','superadmin'].includes(u.tipo)){
  args.push(vendedor);where+=` AND l.vendedor_id=$${args.length}`;
 }
 const periodo=String(q.get('periodo')||'mes');const ini=start(periodo);
 if(ini){args.push(ini);where+=` AND l.data_lead::date>=$${args.length}::date`;}
 if(periodo==='mes_passado'){
  const d=new Date();args.push(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).toISOString().slice(0,10));
  where+=` AND l.data_lead::date<$${args.length}::date`;
 }
 // Excluir a fila Follow Up também dos totais do painel inicial.
 where+=` AND (COALESCE(l.followup_status,'na_fila')='na_fila' AND NOT EXISTS(
  SELECT 1 FROM public.fichas_credito f WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
  AND LOWER(COALESCE(f.status_geral,'')) ~ '^(negad|recus|reprov)'))`;
 try{
  const r=await queryOne<any>(`SELECT COUNT(l.id)::int AS total_leads,
   COUNT(l.id) FILTER(WHERE l.respondeu IS TRUE)::int AS total_responderam,
   COUNT(l.id) FILTER(WHERE l.gerou_ficha IS TRUE)::int AS total_fichas,
   COUNT(l.id) FILTER(WHERE l.aprovado IS TRUE)::int AS total_aprovados,
   COUNT(l.id) FILTER(WHERE l.venda_concluida IS TRUE OR l.data_venda IS NOT NULL)::int AS total_vendidos
   FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id WHERE ${where}`,args);
  const result={total_leads:r?.total_leads??0,total_responderam:r?.total_responderam??0,total_fichas:r?.total_fichas??0,
   total_aprovados:r?.total_aprovados??0,total_vendidos:r?.total_vendidos??0};
  return NextResponse.json({...result,total:result.total_leads,responderam:result.total_responderam,fichas:result.total_fichas,
   aprovados:result.total_aprovados,vendidos:result.total_vendidos},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('[stats]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha ao calcular métricas. Confira a migration do Follow Up.'},{status:503});}
}
