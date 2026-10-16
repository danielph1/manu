import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const { rows } = await query(
      `SELECT m.*, d.nome AS destinatario_nome, c.nome AS criador_nome
       FROM public.metas m
       LEFT JOIN public.usuarios d ON d.id = m.destinatario_id
       LEFT JOIN public.usuarios c ON c.id = m.criado_por_id
       WHERE COALESCE(m.ativo, TRUE) = TRUE
         AND (
           $1 IN ('admin','gerente','marketing')
           OR m.destinatario_id = $2
           OR m.destinatario_id IS NULL
           OR LOWER(COALESCE(m.destinatario_tipo,'')) = LOWER($1)
           OR UPPER(COALESCE(m.destinatario_loja,'')) = UPPER($3)
         )
       ORDER BY m.created_at DESC
       LIMIT 200`,
      [u.tipo, u.id, u.loja || ''],
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  const b = await req.json();
  if (!b.titulo) return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
  try {
    const row = await queryOne(
      `INSERT INTO public.metas
         (titulo, descricao, valor_objetivo, unidade, periodo_inicio, periodo_fim, destinatario_id, destinatario_tipo, destinatario_loja, criado_por_id, ativo)
       VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),COALESCE($6::date, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date),$7,$8,$9,$10,TRUE)
       RETURNING *`,
      [
        String(b.titulo).trim(),
        b.descricao || null,
        b.valor_objetivo != null && b.valor_objetivo !== '' ? Number(b.valor_objetivo) : null,
        b.unidade || 'un',
        b.periodo_inicio || null,
        b.periodo_fim || null,
        b.destinatario_id ? Number(b.destinatario_id) : null,
        b.destinatario_tipo || null,
        b.destinatario_loja || null,
        u.id,
      ],
    );
    if (b.destinatario_id) {
      await notificar({ titulo: 'Nova meta', mensagem: String(b.titulo), tipo: 'meta', usuario_ids: [Number(b.destinatario_id)] });
    } else if (b.destinatario_tipo) {
      await notificar({ titulo: 'Nova meta', mensagem: String(b.titulo), tipo: 'meta', tipos: [String(b.destinatario_tipo)] });
    } else {
      await notificar({ titulo: 'Nova meta', mensagem: String(b.titulo), tipo: 'meta', tipos: ['admin', 'gerente'] });
    }
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: 'id' }, { status: 400 });
  try {
    const row = await queryOne(
      `UPDATE public.metas
       SET concluida = COALESCE($2, concluida),
           ativo = COALESCE($3, ativo),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [b.id, b.concluida ?? null, b.ativo ?? null],
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente'].includes(u.tipo)) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const b = await req.json();
  await query('DELETE FROM public.metas WHERE id = $1', [b.id]);
  return NextResponse.json({ ok: true });
}
