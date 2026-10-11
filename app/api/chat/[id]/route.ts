import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const b = await req.json();
  const msg = await queryOne(`SELECT remetente_id FROM public.chat_geral_mensagens WHERE id = $1`, [id]);
  if (!msg) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  if (Number(msg.remetente_id) !== Number(u.id)) {
    return NextResponse.json({ error: 'só quem enviou edita' }, { status: 403 });
  }
  await query(`UPDATE public.chat_geral_mensagens SET mensagem = $1 WHERE id = $2`, [String(b.mensagem || '').trim(), id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const msg = await queryOne(`SELECT remetente_id FROM public.chat_geral_mensagens WHERE id = $1`, [id]);
  if (!msg) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  const pode = Number(msg.remetente_id) === Number(u.id) || ['admin', 'gerente'].includes(String(u.tipo || '').toLowerCase());
  if (!pode) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  await query(`DELETE FROM public.chat_geral_mensagens WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
