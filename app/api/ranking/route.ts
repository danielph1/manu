import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';import {requireUser} from '@/lib/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
function rank(n:number){return n>=20?'platina':n>=10?'ouro':n>=5?'prata':'bronze';}
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const isSuper=u.tipo==='superadmin',empresaParam=Number(req.nextUrl.searchParams.get('empresa_id'));
 if(!isSuper&&!u.empresa_id)return NextResponse.json({error:'Empresa sem vínculo'},{status:403});
 if(!isSuper&&empresaParam>0&&empresaParam!==Number(u.empresa_id))return NextResponse.json({error:'Empresa não autorizada'},{status:403});
 const empresa=isSuper?(Number.isSafeInteger(empresaParam)&&empresaParam>0?empresaParam:0):Number(u.empresa_id);
 const params:unknown[]=[];let extra='';if(empresa){params.push(empresa);extra+=` AND v.empresa_id=$${params.length}`;}
 const loja=u.tipo==='gerente'?String(u.loja||''):'';if(u.tipo==='gerente'&&!loja)return NextResponse.json({error:'Gerente sem loja'},{status:403});
 if(loja){params.push(loja);extra+=` AND UPPER(COALESCE(v.loja,''))=UPPER($${params.length})`;}
 try{
  const {rows}=await query<any>(`SELECT v.id,v.nome,v.loja,
   COUNT(l.id) FILTER(WHERE l.venda_concluida IS TRUE OR l.data_venda IS NOT NULL)::int AS vendas
   FROM public.vendedores v LEFT JOIN public.leads l ON l.vendedor_id=v.id
     AND (l.empresa_id=v.empresa_id OR l.empresa_id IS NULL)
   WHERE v.empresa_id IS NOT NULL AND LOWER(COALESCE(v.nome,''))<>'matheus' ${extra}
   GROUP BY v.id,v.nome,v.loja ORDER BY vendas DESC,v.nome`,params);
  return NextResponse.json(rows.map((r:any)=>({...r,rank:rank(Number(r.vendas||0))})),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('[ranking]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha no ranking'},{status:503});}
}
