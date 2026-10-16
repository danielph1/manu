import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente'].includes(u.tipo)) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  await query('DELETE FROM public.faturamentos WHERE id = $1', [b.id]);
  return NextResponse.json({ ok: true });
}
