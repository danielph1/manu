import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin, isGerenteLoja } from '@/lib/tenant';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const params: unknown[] = [];
    const where: string[] = ['COALESCE(m.ativo, TRUE) = TRUE'];

    if (!isSuperAdmin(u) && u.empresa_id) {
      params.push(u.empresa_id);
      const p = `$${params.length}`;
      where.push(`(c.empresa_id = ${p} OR d.empresa_id = ${p} OR (c.id IS NULL AND d.id IS NULL))`);
    }

    if (isGerenteLoja(u) && u.loja) {
      params.push(String(u.loja).toUpperCase());
      const p = `$${params.length}`;
      where.push(
        `(UPPER(COALESCE(m.destinatario_loja,'')) = UPPER(${p})
          OR m.destinatario_id IN (
            SELECT us.id FROM public.usuarios us
            LEFT JOIN public.vendedores vv ON vv.id = us.vendedor_id
            WHERE UPPER(COALESCE(vv.loja,'')) = UPPER(${p})
          )
          OR (m.destinatario_id IS NULL AND (m.destinatario_loja IS NULL OR UPPER(COALESCE(m.destinatario_loja,'')) = UPPER(${p}))))`,
      );
    }

    if (!['admin', 'gerente', 'marketing', 'superadmin'].includes(String(u.tipo))) {
      params.push(u.id);
      params.push(u.tipo);
      where.push(
        `(m.destinatario_id = $${params.length - 1} OR LOWER(COALESCE(m.destinatario_tipo,'')) = LOWER($${params.length}))`,
      );
    }

    const { rows } = await query(
      `SELECT m.*, d.nome AS destinatario_nome, c.nome AS criador_nome
       FROM public.metas m
       LEFT JOIN public.usuarios d ON d.id = m.destinatario_id
       LEFT JOIN public.usuarios c ON c.id = m.criado_por_id
       WHERE ${where.join(' AND ')}
       ORDER BY m.created_at DESC
       LIMIT 200`,
      params,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!['admin', 'gerente', 'superadmin'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  const b = await req.json();
  if (!b.titulo) return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
  let destLoja = b.destinatario_loja || null;
  if (isGerenteLoja(u) && u.loja) destLoja = u.loja;
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
        destLoja,
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
  if (!['admin', 'gerente', 'superadmin'].includes(u.tipo)) {
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
  if (!['admin', 'gerente', 'superadmin'].includes(u.tipo)) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const b = await req.json();
  await query('DELETE FROM public.metas WHERE id = $1', [b.id]);
  return NextResponse.json({ ok: true });
}
