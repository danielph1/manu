import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { query } from '@/lib/db';
import { resolverEscopoMetricas } from '@/lib/metricas/escopo';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
  const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  let sc:ReturnType<typeof resolverEscopoMetricas>;
  try{sc=resolverEscopoMetricas(u,req.nextUrl.searchParams.get('empresa_id'),null);}catch{
    return NextResponse.json({error:'Empresa inválida ou acesso negado'},{status:403});}
  try {
    const {rows}=await query<{codigo:string;nome:string}>(
      `SELECT codigo,nome FROM public.lojas WHERE empresa_id=$1 AND ($2::text IS NULL OR UPPER(codigo)=$2)
       ORDER BY codigo`,[sc.empresaId,sc.loja]);
    return NextResponse.json(rows,{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Não foi possível consultar lojas'},{status:503});}
}
