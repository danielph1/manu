import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { gestorIntegracoes } from '@/lib/integracoes/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};

export async function GET(req:NextRequest, ctx:Ctx) {
  try {
    const actor=await gestorIntegracoes(req);
    if(!actor) return NextResponse.json({error:'sem permissão'},{status:403});
    const {id}=await ctx.params;
    if(!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({error:'id inválido'},{status:400});
    const {rows}=await query(
      `SELECT e.id,e.recebido_em,e.status,e.nome,e.telefone,e.email,e.interesse,e.triagem_id,e.erro
         FROM public.manu_integracao_eventos e
         JOIN public.manu_integracoes i ON i.id=e.integracao_id
        WHERE i.id=$1 AND ($2::boolean OR i.empresa_id=$3)
        ORDER BY e.recebido_em DESC LIMIT 30`,
      [id,actor.tipo==='superadmin',actor.empresa_id],
    );
    return NextResponse.json(rows,{headers:{'Cache-Control':'no-store'}});
  } catch (err) {
    console.error('eventos',err instanceof Error?err.message:'erro');
    return NextResponse.json({error:'não foi possível ler os eventos'},{status:500});
  }
}
