import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';import {requireUser} from '@/lib/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!u.empresa_id&&u.tipo!=='superadmin')return NextResponse.json({error:'Empresa não vinculada'},{status:403});
 const desired=Number(req.nextUrl.searchParams.get('empresa_id'));
 if(u.tipo!=='superadmin'&&Number.isFinite(desired)&&desired>0&&desired!==Number(u.empresa_id))
  return NextResponse.json({error:'Empresa fora do escopo'},{status:403});
 const empresaId=u.tipo==='superadmin'?(Number.isSafeInteger(desired)&&desired>0?desired:null):Number(u.empresa_id);
 const params:unknown[]=[];let where=`WHERE LOWER(COALESCE(v.nome,''))<>'matheus'`;
 if(empresaId){params.push(empresaId);where+=` AND v.empresa_id=$${params.length}`;}
 const loja=u.tipo==='gerente'?(u.loja||''):String(req.nextUrl.searchParams.get('loja')||'').trim();
 if(loja&&['gerente','admin','superadmin'].includes(u.tipo)){params.push(loja);where+=` AND UPPER(COALESCE(v.loja,''))=UPPER($${params.length})`;}
 if(u.tipo==='vendedor'){
  if(!u.vendedor_id)return NextResponse.json([]);
  params.push(u.vendedor_id);where+=` AND v.id=$${params.length}`;
 }
 try{
  const {rows}=await query<any>(`SELECT v.id,v.nome,v.loja,
    COALESCE((SELECT u.foto_url FROM public.usuarios u WHERE u.vendedor_id=v.id AND u.empresa_id=v.empresa_id ORDER BY u.id LIMIT 1),'') AS foto_url,
    COUNT(l.id)::int AS leads,COUNT(l.id) FILTER(WHERE l.respondeu IS TRUE)::int AS responderam,
    COUNT(l.id) FILTER(WHERE l.gerou_ficha IS TRUE)::int AS fichas,
    COUNT(l.id) FILTER(WHERE l.aprovado IS TRUE)::int AS aprovados,
    COUNT(l.id) FILTER(WHERE l.venda_concluida IS TRUE)::int AS vendas,
    COUNT(l.id) FILTER(WHERE l.atribuido_em::date=CURRENT_DATE)::int AS plus_hoje
    FROM public.vendedores v
    LEFT JOIN public.leads l ON l.vendedor_id=v.id AND l.empresa_id=v.empresa_id
      AND l.data_lead >= date_trunc('month',CURRENT_DATE)::date
    ${where}
    GROUP BY v.id,v.nome,v.loja ORDER BY v.nome`,params);
  return NextResponse.json(rows.map((r:any)=>({ ...r,
    pontos:Number(r.leads)+Number(r.responderam)*0.5+Number(r.fichas)*0.5+Number(r.aprovados)+Number(r.vendas)*2,
    minus_hoje:0,plus_mes:Number(r.leads),minus_mes:0
  })),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('[equipe]',e instanceof Error?e.message:'erro');
  return NextResponse.json({error:'Não foi possível consultar a equipe com o escopo solicitado'},{status:503});}
}
