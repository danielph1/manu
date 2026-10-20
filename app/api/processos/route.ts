import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/session';
import { isSuperAdmin, isGerenteLoja } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const scopeParams: unknown[] = [];
    let scopeSql = '';
    if (!isSuperAdmin(u) && u.empresa_id) {
      scopeParams.push(u.empresa_id);
      scopeSql += ` AND (f.vendedor_id IS NULL OR f.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = $${scopeParams.length}))`;
    }
    if (isGerenteLoja(u) && u.loja) {
      scopeParams.push(String(u.loja).toUpperCase());
      scopeSql += ` AND f.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${scopeParams.length}))`;
    }
    const { rows } = await query(
      `SELECT
         p.id,
         p.ficha_id,
         p.status,
         p.observacao,
         COALESCE(p.gravame, FALSE) AS gravame,
         COALESCE(p.reconheceu_firma, FALSE) AS reconheceu_firma,
         COALESCE(p.documento_pronto, FALSE) AS documento_pronto,
         p.updated_at,
         f.lead_id,
         f.vendedor_id,
         COALESCE(l.nome_lead, l.nome_completo, '—') AS nome_lead,
         COALESCE(l.placa_carro, '') AS placa,
         COALESCE(l.marca_carro, '') AS marca,
         COALESCE(l.modelo, l.produto_interesse, '') AS modelo,
         v.nome AS vendedor_nome
       FROM public.processos_transferencia p
       LEFT JOIN public.fichas_credito f ON f.id = p.ficha_id
       LEFT JOIN public.leads l ON l.id = f.lead_id
       LEFT JOIN public.vendedores v ON v.id = COALESCE(f.vendedor_id, l.vendedor_id)
       WHERE 1=1 ${scopeSql}
       ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
       LIMIT 150`,
      scopeParams,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    try {
      const { rows } = await query(
        `SELECT p.*, f.lead_id, l.nome_lead
         FROM public.processos_transferencia p
         LEFT JOIN public.fichas_credito f ON f.id = p.ficha_id
         LEFT JOIN public.leads l ON l.id = f.lead_id
         ORDER BY p.id DESC LIMIT 150`,
      );
      return NextResponse.json(rows);
    } catch (e2: any) {
      return NextResponse.json({ error: e2?.message || e?.message }, { status: 500 });
    }
  }
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!can.editarDocumental(u) && !['superadmin', 'admin'].includes(String(u.tipo))) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }
  try {
    const b = await req.json();
    const id = Number(b.id);
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    const fields: string[] = [];
    const vals: unknown[] = [];
    for (const k of ['status', 'observacao', 'gravame', 'reconheceu_firma', 'documento_pronto']) {
      if (k in b) {
        vals.push(b[k]);
        fields.push(`${k} = $${vals.length}`);
      }
    }
    if (!fields.length) return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
    fields.push('updated_at = now()');
    vals.push(id);
    const row = await queryOne(
      `UPDATE public.processos_transferencia SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals,
    );
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
