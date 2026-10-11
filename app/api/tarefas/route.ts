import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { notificar } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const params: unknown[] = [];
    let filtro = 'TRUE';
    if (!['admin', 'gerente', 'marketing'].includes(u.tipo)) {
      params.push(u.id);
      filtro = `t.destinatario_id = $1`;
    }
    const { rows } = await query(
      `SELECT t.*, d.nome AS destinatario_nome, c.nome AS criador_nome
       FROM public.tarefas t
       LEFT JOIN public.usuarios d ON d.id = t.destinatario_id
       LEFT JOIN public.usuarios c ON c.id = t.criado_por_id
       WHERE ${filtro}
       ORDER BY CASE WHEN t.resposta IS NULL THEN 0 ELSE 1 END, t.created_at DESC
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
  if (!['admin', 'gerente', 'marketing'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const b = await req.json();
    if (!b.titulo) return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
    const titulo = String(b.titulo).trim();
    const desc = b.descricao || null;

    if (b.destinatario_tipo) {
      const tipo = String(b.destinatario_tipo).toLowerCase();
      const { rows: dests } = await query(
        `SELECT id FROM public.usuarios
         WHERE COALESCE(ativo, TRUE) = TRUE
           AND (
             LOWER(tipo) = $1
             OR ($1 = 'vendedores' AND tipo = 'vendedor')
             OR ($1 = 'guaribas' AND tipo = 'guariba')
             OR ($1 = 'mecanicos' AND tipo = 'mecanico')
             OR ($1 = 'documentistas' AND tipo IN ('documentista','documento'))
           )`,
        [tipo],
      );
      if (!dests.length) return NextResponse.json({ error: 'ninguém nesse grupo' }, { status: 400 });
      const criadas = [];
      for (const d of dests) {
        const row = await queryOne(
          `INSERT INTO public.tarefas (titulo, descricao, destinatario_id, criado_por_id)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [titulo, desc, d.id, u.id],
        );
        criadas.push(row);
      }
      await notificar({ titulo: 'Nova tarefa', mensagem: titulo, tipo: 'tarefa', usuario_ids: dests.map((d: any) => d.id) });
      return NextResponse.json({ ok: true, n: criadas.length });
    }

    if (!b.destinatario_id) {
      return NextResponse.json({ error: 'escolha pessoa ou grupo' }, { status: 400 });
    }
    const row = await queryOne(
      `INSERT INTO public.tarefas (titulo, descricao, destinatario_id, criado_por_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [titulo, desc, Number(b.destinatario_id), u.id],
    );
    await notificar({ titulo: 'Nova tarefa', mensagem: titulo, tipo: 'tarefa', usuario_ids: [Number(b.destinatario_id)] });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: 'id' }, { status: 400 });
    const row = await queryOne(
      `UPDATE public.tarefas
       SET resposta = COALESCE($2, resposta),
           observacao = COALESCE($3, observacao),
           respondida_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE respondida_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [b.id, b.resposta ?? null, b.observacao ?? null],
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
