import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const b = await req.json();
  if (!b.mensagem_id || !b.emoji) return NextResponse.json({ error: 'dados' }, { status: 400 });
  try {
    const ja = await queryOne(
      `SELECT id FROM public.chat_geral_reacoes WHERE mensagem_id = $1 AND usuario_id = $2 AND emoji = $3`,
      [b.mensagem_id, u.id, b.emoji],
    );
    if (ja) {
      await query(`DELETE FROM public.chat_geral_reacoes WHERE id = $1`, [ja.id]);
    } else {
      await query(
        `INSERT INTO public.chat_geral_reacoes (mensagem_id, usuario_id, emoji) VALUES ($1,$2,$3)`,
        [b.mensagem_id, u.id, b.emoji],
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
