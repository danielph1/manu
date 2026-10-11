import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const { rows } = await query(
      `SELECT id, tipo, titulo, mensagem, created_at, COALESCE(lida, FALSE) AS lida
       FROM public.notificacoes
       WHERE usuario_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [u.id],
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    await query(
      `UPDATE public.notificacoes SET lida = TRUE WHERE usuario_id = $1 AND COALESCE(lida, FALSE) = FALSE`,
      [u.id],
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
