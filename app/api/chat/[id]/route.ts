import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { leadAcessivel } from '@/lib/lead-access';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const b = await req.json();
  const msg = await queryOne(`SELECT remetente_id, lead_id, mensagem FROM public.chat_geral_mensagens WHERE id = $1`, [id]);
  if (!msg) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  if (!msg.lead_id || !await leadAcessivel(u, Number(msg.lead_id))) return NextResponse.json({ error: 'sem acesso ao lead' }, { status: 403 });
  // Notas internas são registros de atendimento e não podem ser editadas como mensagem externa.
  if (/^\[interno\]/i.test(String(msg.mensagem||''))) return NextResponse.json({error:'Notas internas ficam no histórico; utilize uma nova nota para complementar.'},{status:409});
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
  const msg = await queryOne(`SELECT remetente_id, lead_id, mensagem FROM public.chat_geral_mensagens WHERE id = $1`, [id]);
  if (!msg) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  if (!msg.lead_id || !await leadAcessivel(u, Number(msg.lead_id))) return NextResponse.json({ error: 'sem acesso ao lead' }, { status: 403 });
  if (/^\[interno\]/i.test(String(msg.mensagem||''))) return NextResponse.json({error:'Nota interna é um registro de auditoria e não pode ser excluída pelo chat.'},{status:409});
  const pode = Number(msg.remetente_id) === Number(u.id) || ['admin', 'gerente', 'marketing', 'superadmin'].includes(String(u.tipo || '').toLowerCase());
  if (!pode) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  await query(`DELETE FROM public.chat_geral_mensagens WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
