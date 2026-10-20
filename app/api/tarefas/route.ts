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
    const where: string[] = ['TRUE'];

    if (!isSuperAdmin(u) && u.empresa_id) {
      params.push(u.empresa_id);
      const p = `$${params.length}`;
      where.push(`(d.empresa_id = ${p} OR c.empresa_id = ${p})`);
    }

    if (isGerenteLoja(u) && u.loja) {
      params.push(String(u.loja).toUpperCase());
      const p = `$${params.length}`;
      where.push(
        `t.destinatario_id IN (
          SELECT us.id FROM public.usuarios us
          LEFT JOIN public.vendedores vv ON vv.id = us.vendedor_id
          WHERE UPPER(COALESCE(vv.loja,'')) = UPPER(${p})
             OR us.id = ${u.id}
        ) OR t.criado_por_id = ${u.id}`,
      );
    }

    if (!['admin', 'gerente', 'marketing', 'superadmin'].includes(String(u.tipo))) {
      params.push(u.id);
      where.push(`t.destinatario_id = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT t.*, d.nome AS destinatario_nome, c.nome AS criador_nome
       FROM public.tarefas t
       LEFT JOIN public.usuarios d ON d.id = t.destinatario_id
       LEFT JOIN public.usuarios c ON c.id = t.criado_por_id
       WHERE ${where.join(' AND ')}
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
  if (!['admin', 'gerente', 'marketing', 'superadmin'].includes(u.tipo)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const b = await req.json();
    if (!b.titulo) return NextResponse.json({ error: 'título obrigatório' }, { status: 400 });
    const titulo = String(b.titulo).trim();
    const desc = b.descricao || null;

    if (b.destinatario_tipo) {
      const tipo = String(b.destinatario_tipo).toLowerCase();
      const params: unknown[] = [tipo];
      let extra = '';
      if (!isSuperAdmin(u) && u.empresa_id) {
        params.push(u.empresa_id);
        extra += ` AND empresa_id = $${params.length}`;
      }
      if (isGerenteLoja(u) && u.loja) {
        params.push(String(u.loja).toUpperCase());
        extra += ` AND id IN (
          SELECT us.id FROM public.usuarios us
          LEFT JOIN public.vendedores vv ON vv.id = us.vendedor_id
          WHERE UPPER(COALESCE(vv.loja,'')) = UPPER($${params.length})
        )`;
      }
      const { rows: dests } = await query(
        `SELECT id FROM public.usuarios
         WHERE COALESCE(ativo, TRUE) = TRUE
           AND (
             LOWER(tipo) = $1
             OR ($1 = 'vendedores' AND tipo = 'vendedor')
             OR ($1 = 'guaribas' AND tipo = 'guariba')
             OR ($1 = 'mecanicos' AND tipo = 'mecanico')
             OR ($1 = 'documentistas' AND tipo IN ('documentista','documento'))
           )
           ${extra}`,
        params,
      );
      if (!dests.length) return NextResponse.json({ error: 'ninguém nesse grupo (na sua empresa/loja)' }, { status: 400 });
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
