import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireUser, can } from '@/lib/session';

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'nao autenticado' }, { status: 401 });
  if (!can.editarDocumental(u)) return NextResponse.json({ error: 'sem permissao' }, { status: 403 });

  const { ficha_id, processo_id, field, value } = await req.json();
  const allowed = ['gravame','reconheceu_firma','documento_pronto'];
  if (!allowed.includes(field)) return NextResponse.json({ error: 'campo invalido' }, { status: 400 });

  if (processo_id) {
    const { error } = await supabaseAdmin.from('processos_transferencia').update({
      [field]: value, atualizado_por_id: u.id,
    }).eq('id', processo_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.from('processos_transferencia').insert({
      ficha_id, [field]: value, atualizado_por_id: u.id, status: 'em_andamento',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
