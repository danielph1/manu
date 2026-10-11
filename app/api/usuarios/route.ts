import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { rows } = await query(
    `SELECT id, nome, login, tipo, loja
     FROM public.usuarios
     WHERE COALESCE(ativo, TRUE) = TRUE
     ORDER BY nome`,
  );
  return NextResponse.json(rows);
}
