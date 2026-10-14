import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const lead = await queryOne(`SELECT vendedor_id FROM public.leads WHERE id = $1`, [id]);
  const outro = await queryOne(
    `SELECT id FROM public.vendedores
     WHERE id <> COALESCE($1, 0) AND LOWER(COALESCE(nome,'')) <> 'matheus'
     ORDER BY random() LIMIT 1`,
    [lead?.vendedor_id || 0],
  );
  if (!outro) return NextResponse.json({ error: 'sem outro vendedor' }, { status: 400 });
  await query(`UPDATE public.leads SET vendedor_id = $1 WHERE id = $2`, [outro.id, id]);
  return NextResponse.json({ ok: true, vendedor_id: outro.id });
}
