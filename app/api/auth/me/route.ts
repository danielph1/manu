import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const row = await queryOne(
      `SELECT id, login, nome, tipo, vendedor_id, loja, COALESCE(ativo,TRUE) AS ativo, COALESCE(foto_url,'') AS foto_url
       FROM public.usuarios WHERE id = $1`,
      [u.id],
    );
    return NextResponse.json(row || u);
  } catch {
    return NextResponse.json(u);
  }
}
