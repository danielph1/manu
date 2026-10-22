import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes } from '@/lib/integracoes/auth';
import { query } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest) {
  try {
    const actor=await gestorIntegracoes(req);
    if(!actor) return NextResponse.json({error:'sem permissão'}, {status:403});
    const {rows}=await query<{id:number;nome:string}>(
      `SELECT id,nome FROM public.empresas WHERE ativo=TRUE AND ($1::boolean OR id=$2) ORDER BY nome`,
      [actor.tipo==='superadmin',actor.empresa_id],
    );
    return NextResponse.json(rows);
  } catch { return NextResponse.json({error:'erro ao consultar empresas'},{status:500}); }
}
