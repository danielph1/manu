import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';

/**
 * Busca semântica de veículos (estoque).
 * Fase 1: ILIKE / texto.
 * Fase 2: embeddings + pgvector (schema_embeddings.sql).
 */
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], mode: 'empty' });
  }

  const params: unknown[] = [`%${q}%`];
  let emp = '';
  if (!isSuperAdmin(u) && u.empresa_id) {
    params.push(u.empresa_id);
    emp = ` AND (empresa_id = $${params.length} OR empresa_id IS NULL)`;
  }

  try {
    const { rows } = await query(
      `SELECT id, marca, modelo, placa,
              COALESCE(ano::text, '') AS ano, cor, 'estoque' AS origem
       FROM public.estoque_carros
       WHERE (
         marca ILIKE $1 OR modelo ILIKE $1 OR placa ILIKE $1
         OR COALESCE(cor,'') ILIKE $1 OR COALESCE(carroceria,'') ILIKE $1
         OR concat_ws(' ', marca, modelo) ILIKE $1
       ) ${emp}
       ORDER BY id DESC
       LIMIT 30`,
      params,
    );
    return NextResponse.json({
      results: rows,
      mode: 'text',
      note: 'Fase 1: busca textual. pgvector preparado no schema_embeddings.sql',
    });
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e?.message, mode: 'error' });
  }
}
