import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/session';import {query} from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!['superadmin','admin','gerente','marketing'].includes(u.tipo))return NextResponse.json({error:'Sem permissão'},{status:403});
 const empresaId=u.tipo==='superadmin'?Number(req.nextUrl.searchParams.get('empresa_id')):Number(u.empresa_id);
 if(!Number.isSafeInteger(empresaId)||empresaId<=0)return NextResponse.json([]);
 try{const{rows}=await query(`SELECT id,codigo,nome FROM public.lojas WHERE empresa_id=$1 AND ativo=TRUE ORDER BY codigo`,[empresaId]);
  return NextResponse.json(rows);}catch{return NextResponse.json({error:'Não foi possível buscar lojas'},{status:500});}
}
