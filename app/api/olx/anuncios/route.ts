import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Worker Deno/Puppeteer (ou Browserless) posta aqui.
 * Header: x-manu-scraper-secret
 * Body: { empresa_id?, items: [{ name, address, year, km, price, url, picture_url, phone?, seller? }] }
 *
 * ATENÇÃO: o scraper público da listagem OLX NÃO traz telefone.
 * Telefone só se o worker abrir o anúncio e clicar "mostrar telefone" (login/captcha).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-manu-scraper-secret') || '';
  const expected = process.env.MARKETPLACE_SCRAPER_SECRET || process.env.OLX_SCRAPER_SECRET || '';
  const u = await requireUser(req).catch(() => null);
  const isSuper = u && String(u.tipo).toLowerCase() === 'superadmin';
  if (!isSuper && (!expected || secret !== expected)) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.items)) {
    return NextResponse.json({ error: 'items[] obrigatório' }, { status: 400 });
  }
  const empresaId = b.empresa_id != null ? Number(b.empresa_id) : null;

  const busca = await queryOne(
    `INSERT INTO public.marketplace_buscas (empresa_id, query, cidade, pais, status, origem, criado_por)
     VALUES ($1,$2,'rj','BR','concluida','olx',$3) RETURNING id`,
    [empresaId, String(b.query || 'olx-scrape'), isSuper ? u!.id : null],
  );

  let inseridos = 0;
  let duplicados = 0;
  for (const it of b.items.slice(0, 500)) {
    const url = String(it.url || it.link || '').trim();
    if (!url) continue;
    const titulo = String(it.name || it.titulo || it.title || '').slice(0, 300);
    const preco = String(it.price || it.preco || '').slice(0, 80);
    const local = String(it.address || it.localizacao || '').slice(0, 200);
    const ano = it.year || it.ano ? String(it.year || it.ano).slice(0, 20) : null;
    const km = it.km ? String(it.km) : '';
    const desc = [km ? `km: ${km}` : '', ano ? `ano: ${ano}` : ''].filter(Boolean).join(' · ');
    try {
      const row = await queryOne(
        `INSERT INTO public.marketplace_anuncios
          (busca_id, empresa_id, titulo, preco, localizacao, url, imagem_url, descricao,
           telefone, vendedor_nome, ano, origem, query_origem, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'olx',$12,$13::jsonb)
         ON CONFLICT (url) DO NOTHING RETURNING id`,
        [
          busca?.id,
          empresaId,
          titulo,
          preco,
          local,
          url.slice(0, 800),
          it.picture_url || it.imagem_url || null,
          desc.slice(0, 2000),
          it.phone || it.telefone || null,
          it.seller || it.vendedor_nome || null,
          ano,
          String(b.query || 'olx'),
          JSON.stringify(it),
        ],
      );
      if (row) inseridos++;
      else duplicados++;
    } catch {
      duplicados++;
    }
  }

  if (busca?.id) {
    await query(
      `UPDATE public.marketplace_buscas SET total_encontrado=$2, concluido_em=now(), status='concluida' WHERE id=$1`,
      [busca.id, inseridos],
    );
  }

  return NextResponse.json({
    ok: true,
    inseridos,
    duplicados,
    busca_id: busca?.id,
    aviso:
      'Fila da bomba preenchida. Telefone só entra se o worker enviar. Listagem OLX padrão NÃO tem telefone.',
  });
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }
  const { rows } = await query(
    `SELECT * FROM public.marketplace_anuncios WHERE origem='olx' ORDER BY criado_em DESC LIMIT 200`,
  );
  return NextResponse.json(rows);
}
