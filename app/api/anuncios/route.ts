import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OK = ['admin', 'marketing', 'superadmin', 'gerente'];

/** Lista estoque com flag anunciado + filtros */
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!OK.includes(String(u.tipo || '').toLowerCase()) && !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const busca = (sp.get('busca') || '').trim();
  const status = (sp.get('status') || 'todos').toLowerCase(); // todos|anunciado|nao_anunciado
  const ordem = (sp.get('ordem') || 'recentes').toLowerCase();

  const params: unknown[] = [];
  let where = '1=1';

  if (!isSuperAdmin(u) && u.empresa_id) {
    params.push(u.empresa_id);
    where += ` AND (empresa_id = $${params.length} OR empresa_id IS NULL)`;
  }

  if (status === 'anunciado') where += ` AND COALESCE(anunciado,false) = true`;
  if (status === 'nao_anunciado') where += ` AND COALESCE(anunciado,false) = false`;

  if (busca) {
    params.push(`%${busca}%`);
    const p = `$${params.length}`;
    where += ` AND (
      marca ILIKE ${p} OR modelo ILIKE ${p} OR placa ILIKE ${p}
      OR COALESCE(carro,'') ILIKE ${p} OR COALESCE(cor,'') ILIKE ${p}
      OR COALESCE(ano,'') ILIKE ${p} OR COALESCE(ano_modelo,'') ILIKE ${p}
    )`;
  }

  let order = 'id DESC';
  if (ordem === 'preco_asc') order = 'COALESCE(preco,0)::numeric ASC NULLS LAST';
  if (ordem === 'preco_desc') order = 'COALESCE(preco,0)::numeric DESC NULLS LAST';
  if (ordem === 'marca') order = 'marca ASC NULLS LAST, modelo ASC';

  try {
    await query(`ALTER TABLE public.estoque_carros ADD COLUMN IF NOT EXISTS anunciado boolean DEFAULT false`);
  } catch { /* ok */ }

  try {
    const { rows } = await query(
      `SELECT id, marca, modelo, carro, placa, ano, cor, preco, km, patio, carroceria,
              COALESCE(anunciado,false) AS anunciado,
              anunciado_em, anuncios_meta, empresa_id
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
