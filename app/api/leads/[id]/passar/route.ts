import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Transfere lead para outro vendedor (aleatório ou body.vendedor_id).
 * Sempre grava no chat: "Transferido de X para Y · data/hora"
 */

async function nomeVendedor(id: number | null | undefined): Promise<string> {
  if (!id) return 'sem vendedor';
  const v = await queryOne(`SELECT nome FROM public.vendedores WHERE id = $1`, [id]);
  return v?.nome || `#${id}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const lead = await queryOne(
    `SELECT id, vendedor_id FROM public.leads WHERE id = $1`,
    [id],
  );
  if (!lead) return NextResponse.json({ error: 'lead não encontrado' }, { status: 404 });

  const deId = lead.vendedor_id ? Number(lead.vendedor_id) : null;
  let paraId = body.vendedor_id ? Number(body.vendedor_id) : 0;

  if (!paraId) {
    const outro = await queryOne(
      `SELECT id FROM public.vendedores
       WHERE id <> COALESCE($1, 0)
         AND LOWER(COALESCE(nome,'')) <> 'matheus'
       ORDER BY random() LIMIT 1`,
      [deId || 0],
    );
    paraId = outro?.id || 0;
  }
  if (!paraId) return NextResponse.json({ error: 'sem outro vendedor' }, { status: 400 });
  if (deId && paraId === deId) {
    return NextResponse.json({ error: 'já está com este vendedor' }, { status: 400 });
  }

  const deNome = await nomeVendedor(deId);
  const paraNome = await nomeVendedor(paraId);
  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  await query(
    `UPDATE public.leads
     SET vendedor_id = $1,
         atribuido_em = now(),
         rotacionar = TRUE
     WHERE id = $2`,
    [paraId, id],
  );

  try {
    await query(
      `INSERT INTO public.lead_transferencias (lead_id, de_vendedor_id, para_vendedor_id, transferido_por, motivo)
       VALUES ($1,$2,$3,$4,$5)`,
      [Number(id), deId, paraId, u.id, body.motivo || 'manual'],
    );
  } catch { /* tabela opcional */ }

  const texto = `Transferido de ${deNome} para ${paraNome} · ${hora}`;
  try {
    await query(
      `INSERT INTO public.chat_geral_mensagens (remetente_id, mensagem, lead_id)
       VALUES ($1, $2, $3)`,
      [u.id, texto, Number(id)],
    );
  } catch (e) {
    console.error('chat transfer', e);
  }

  try {
    const vu = await queryOne(`SELECT id FROM public.usuarios WHERE vendedor_id = $1 LIMIT 1`, [paraId]);
    if (vu?.id) {
      await query(
        `INSERT INTO public.notificacoes (usuario_id, tipo, titulo, mensagem)
         VALUES ($1,'lead',$2,$3)`,
        [vu.id, 'Lead transferido', texto],
      );
    }
  } catch { /* ok */ }

  return NextResponse.json({ ok: true, vendedor_id: paraId, de: deNome, para: paraNome, mensagem: texto });
}
