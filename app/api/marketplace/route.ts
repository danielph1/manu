import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function onlySuper(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') return null;
  return u;
}

/** Lista buscas recentes */
export async function GET(req: NextRequest) {
  const u = await onlySuper(req);
  if (!u) return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  const { rows } = await query(
    `SELECT * FROM public.marketplace_buscas ORDER BY criado_em DESC LIMIT 50`,
  );
  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
}

/** Cria uma busca (fila). O worker Python consome e posta os anúncios. */
export async function POST(req: NextRequest) {
  const u = await onlySuper(req);
  if (!u) return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const queryTxt = String(b.query || 'aceito troca carro').trim().slice(0, 200);
  const cidade = String(b.cidade || 'rio').trim().slice(0, 40).toLowerCase();
  const pais = String(b.pais || 'BR').trim().slice(0, 8).toUpperCase();
  const maxPreco = b.max_preco != null ? Number(b.max_preco) : null;
  const empresaId = b.empresa_id != null ? Number(b.empresa_id) : u.empresa_id || null;
  if (!queryTxt) return NextResponse.json({ error: 'query obrigatória' }, { status: 400 });
  const row = await queryOne(
    `INSERT INTO public.marketplace_buscas (empresa_id, query, cidade, pais, max_preco, status, criado_por)
     VALUES ($1,$2,$3,$4,$5,'pendente',$6) RETURNING *`,
    [empresaId, queryTxt, cidade, pais, Number.isFinite(maxPreco as number) ? maxPreco : null, u.id],
  );
  return NextResponse.json(row, { status: 201 });
}
