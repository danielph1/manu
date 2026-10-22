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

/** Lista anúncios capturados (filtro por status) */
export async function GET(req: NextRequest) {
  const u = await onlySuper(req);
  if (!u) return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  const status = req.nextUrl.searchParams.get('status') || 'novo';
  const { rows } = await query(
    `SELECT * FROM public.marketplace_anuncios
      WHERE ($1 = 'todos' OR status = $1)
      ORDER BY criado_em DESC LIMIT 300`,
    [status],
  );
  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Worker Python (scraper) posta anúncios aqui.
 * Header: x-manu-scraper-secret = process.env.MARKETPLACE_SCRAPER_SECRET
 * Body: { busca_id, items: [{ titulo, preco, localizacao, url, imagem_url, fb_id? }] }
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-manu-scraper-secret') || '';
  const expected = process.env.MARKETPLACE_SCRAPER_SECRET || '';
  // Também aceita superadmin logado (teste manual)
  const u = await requireUser(req).catch(() => null);
  const isSuper = u && String(u.tipo).toLowerCase() === 'superadmin';
  if (!isSuper && (!expected || secret !== expected)) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.items)) return NextResponse.json({ error: 'items[] obrigatório' }, { status: 400 });
  const buscaId = b.busca_id != null ? Number(b.busca_id) : null;
  let empresaId: number | null = null;
  let queryOrigem = String(b.query || '');
  if (buscaId) {
    const busca = await queryOne<{ empresa_id: number | null; query: string; status: string }>(
      `SELECT empresa_id, query, status FROM public.marketplace_buscas WHERE id=$1`,
      [buscaId],
    );
    if (!busca) return NextResponse.json({ error: 'busca não encontrada' }, { status: 404 });
    empresaId = busca.empresa_id;
    queryOrigem = busca.query;
    await query(`UPDATE public.marketplace_buscas SET status='rodando' WHERE id=$1`, [buscaId]);
  }
  let inseridos = 0;
  let duplicados = 0;
  for (const it of b.items.slice(0, 200)) {
    const url = String(it.url || it.link || '').trim();
    if (!url) continue;
    const fullUrl = url.startsWith('http') ? url : `https://www.facebook.com${url}`;
    try {
      const row = await queryOne(
        `INSERT INTO public.marketplace_anuncios
          (busca_id, empresa_id, titulo, preco, localizacao, url, imagem_url, fb_id, query_origem, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         ON CONFLICT (url) DO NOTHING
         RETURNING id`,
        [
          buscaId,
          empresaId,
          String(it.titulo || it.title || '').slice(0, 300),
          String(it.preco || it.price || '').slice(0, 80),
          String(it.localizacao || it.location || '').slice(0, 200),
          fullUrl.slice(0, 800),
          String(it.imagem_url || it.image || '').slice(0, 800) || null,
          it.fb_id ? String(it.fb_id).slice(0, 80) : null,
          queryOrigem.slice(0, 200),
          JSON.stringify(it),
        ],
      );
      if (row) inseridos++;
      else duplicados++;
    } catch {
      duplicados++;
    }
  }
  if (buscaId) {
    await query(
      `UPDATE public.marketplace_buscas
          SET status='concluida', concluido_em=now(), total_encontrado=COALESCE(total_encontrado,0)+$2
        WHERE id=$1`,
      [buscaId, inseridos],
    );
  }
  return NextResponse.json({ ok: true, inseridos, duplicados });
}
