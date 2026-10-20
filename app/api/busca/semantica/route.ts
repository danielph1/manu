import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { variantesBusca } from '@/lib/fuzzy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], mode: 'empty' });
  }

  const vars = variantesBusca(q);
  const params: unknown[] = [];
  const parts: string[] = [];
  for (const v of [q, ...vars]) {
    params.push(`%${v}%`);
    const p = `$${params.length}`;
    parts.push(
      `(marca ILIKE ${p} OR modelo ILIKE ${p} OR placa ILIKE ${p} OR COALESCE(cor,'') ILIKE ${p} OR COALESCE(carroceria,'') ILIKE ${p})`,
    );
  }
  let emp = '';
  if (!isSuperAdmin(u) && u.empresa_id) {
    params.push(u.empresa_id);
    emp = ` AND (empresa_id = $${params.length} OR empresa_id IS NULL)`;
  }

  try {
    params.push(q.toLowerCase());
    const pt = `$${params.length}`;
    const { rows } = await query(
      `SELECT id, marca, modelo, placa, COALESCE(ano::text,'') AS ano, cor, 'estoque' AS origem,
              GREATEST(
                similarity(lower(COALESCE(modelo,'')), ${pt}),
                similarity(lower(COALESCE(marca,'')), ${pt})
              ) AS score
       FROM public.estoque_carros
       WHERE (${parts.join(' OR ')}
             OR similarity(lower(COALESCE(modelo,'')), ${pt}) > 0.25
             OR similarity(lower(COALESCE(marca,'')), ${pt}) > 0.25
       ) ${emp}
       ORDER BY score DESC NULLS LAST, id DESC
       LIMIT 30`,
      params,
    );
    return NextResponse.json({ results: rows, mode: 'trgm+text' });
  } catch {
    /* sem pg_trgm */
  }

  const params2: unknown[] = [];
  const parts2: string[] = [];
  for (const v of [q, ...vars]) {
    params2.push(`%${v}%`);
    const px = `$${params2.length}`;
    parts2.push(`(marca ILIKE ${px} OR modelo ILIKE ${px} OR placa ILIKE ${px})`);
  }
  let emp2 = '';
  if (!isSuperAdmin(u) && u.empresa_id) {
    params2.push(u.empresa_id);
    emp2 = ` AND (empresa_id = $${params2.length} OR empresa_id IS NULL)`;
  }
  try {
    const { rows } = await query(
      `SELECT id, marca, modelo, placa, COALESCE(ano::text,'') AS ano, cor, 'estoque' AS origem
       FROM public.estoque_carros
       WHERE (${parts2.join(' OR ')}) ${emp2}
       ORDER BY id DESC LIMIT 30`,
      params2,
    );
    return NextResponse.json({ results: rows, mode: 'text-variants' });
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e?.message, mode: 'error' });
  }
}
