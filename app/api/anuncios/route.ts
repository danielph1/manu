import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OK = ['admin', 'marketing', 'superadmin', 'gerente'];

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!OK.includes(String(u.tipo || '').toLowerCase()) && !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const busca = (sp.get('busca') || '').trim();
  const status = (sp.get('status') || 'todos').toLowerCase();
  const ordem = (sp.get('ordem') || 'recentes').toLowerCase();
  const carroceria = (sp.get('carroceria') || '').trim();

  const params: unknown[] = [];
  let where = `COALESCE(status_estoque,'ativo') <> 'inativo'`;

  if (!isSuperAdmin(u) && u.empresa_id) {
    params.push(u.empresa_id);
    where += ` AND (empresa_id = $${params.length} OR empresa_id IS NULL)`;
  }

  if (status === 'anunciado') where += ` AND COALESCE(anunciado,false) = true`;
  if (status === 'nao_anunciado') where += ` AND COALESCE(anunciado,false) = false`;

  if (carroceria && carroceria !== 'todas') {
    params.push(carroceria);
    where += ` AND LOWER(COALESCE(carroceria,'')) = LOWER($${params.length})`;
  }

  if (busca) {
    params.push(`%${busca}%`);
    const p = `$${params.length}`;
    where += ` AND (
      marca ILIKE ${p} OR modelo ILIKE ${p} OR placa ILIKE ${p}
      OR COALESCE(carro,'') ILIKE ${p} OR COALESCE(cor,'') ILIKE ${p}
      OR COALESCE(ano::text,'') ILIKE ${p}
      OR COALESCE(carroceria,'') ILIKE ${p}
    )`;
  }

  let order = 'id DESC';
  if (ordem === 'preco_asc') order = 'COALESCE(preco,0)::numeric ASC NULLS LAST';
  if (ordem === 'preco_desc') order = 'COALESCE(preco,0)::numeric DESC NULLS LAST';
  if (ordem === 'marca') order = 'marca ASC NULLS LAST, modelo ASC';

  // garantir colunas leves
  for (const ddl of [
    `ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anunciado boolean DEFAULT false`,
    `ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anunciado_em timestamptz`,
    `ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anuncios_meta jsonb DEFAULT '{}'::jsonb`,
    `ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS status_estoque text DEFAULT 'ativo'`,
    `ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS carroceria text`,
  ]) {
    try {
      await query(ddl);
    } catch { /* ok */ }
  }

  try {
    const { rows } = await query(
      `SELECT id, marca, modelo, carro, placa, ano, cor, preco, km, patio, carroceria,
              COALESCE(anunciado,false) AS anunciado,
              anunciado_em, anuncios_meta, empresa_id,
              COALESCE(status_estoque,'ativo') AS status_estoque
        , (SELECT f.url FROM public.estoque_fotos f WHERE f.carro_id = estoque_carros.id ORDER BY f.ordem, f.id LIMIT 1) AS capa_url
       FROM public.estoque_carros
       WHERE ${where}
       ORDER BY ${order}
       LIMIT 300`,
      params,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

/** Atualiza dados do carro (espelha estoque) */
export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!OK.includes(String(u.tipo || '').toLowerCase()) && !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'id' }, { status: 400 });

  const fields: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, string> = {
    marca: 'marca',
    modelo: 'modelo',
    carro: 'carro',
    placa: 'placa',
    ano: 'ano',
    cor: 'cor',
    preco: 'preco',
    km: 'km',
    patio: 'patio',
    carroceria: 'carroceria',
  };
  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) {
      params.push(body[k]);
      fields.push(`${col}=$${params.length}`);
    }
  }
  if (!fields.length) return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

  params.push(id);
  try {
    await query(
      `UPDATE public.estoque_carros SET ${fields.join(', ')}, updated_at = COALESCE(updated_at, now()) WHERE id=$${params.length}`,
      params,
    );
  } catch {
    await query(
      `UPDATE public.estoque_carros SET ${fields.join(', ')} WHERE id=$${params.length}`,
      params,
    );
  }
  const row = await query(
    `SELECT id, marca, modelo, carro, placa, ano, cor, preco, km, patio, carroceria,
            COALESCE(anunciado,false) AS anunciado, anuncios_meta
     FROM public.estoque_carros WHERE id=$1`,
    [id],
  );
  return NextResponse.json(row.rows?.[0] || { ok: true });
}
