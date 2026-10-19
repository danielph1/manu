import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

/** Confirma a senha do usuário logado (ações críticas). */
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const { senha } = await req.json();
    if (!senha) return NextResponse.json({ error: 'senha obrigatória' }, { status: 400 });
    const row = await queryOne<{ senha_hash: string | null }>(
      `SELECT senha_hash FROM public.usuarios WHERE id = $1`,
      [u.id],
    );
    if (!row || !verifyPassword(String(senha), row.senha_hash)) {
      return NextResponse.json({ error: 'senha incorreta', ok: false }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
