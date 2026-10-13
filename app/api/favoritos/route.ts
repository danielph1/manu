import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { rows } = await query(
    'SELECT lead_id FROM public.favoritos WHERE usuario_id = $1 ORDER BY created_at DESC',
    [u.id],
  );
  return NextResponse.json(rows.map((r: any) => Number(r.lead_id)));
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { lead_id } = await req.json();
  const id = Number(lead_id);
  if (!id) return NextResponse.json({ error: 'lead_id obrigatório' }, { status: 400 });
  const existe = await query(
    'SELECT 1 FROM public.favoritos WHERE usuario_id = $1 AND lead_id = $2',
    [u.id, id],
  );
  if (existe.rows.length) {
    await query('DELETE FROM public.favoritos WHERE usuario_id = $1 AND lead_id = $2', [u.id, id]);
    return NextResponse.json({ favorito: false });
  }
  await query('INSERT INTO public.favoritos (usuario_id, lead_id) VALUES ($1, $2)', [u.id, id]);
  return NextResponse.json({ favorito: true });
}
