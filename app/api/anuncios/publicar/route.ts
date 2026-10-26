import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OK = ['admin', 'marketing', 'superadmin', 'gerente'];

type Body = {
  estoque_id: number;
  plataformas: string[];
  descricao?: string;
  preco?: number | string;
  titulo?: string;
};

async function tokenML(empresaId: number) {
  return queryOne<{ access_token_enc: string; external_id: string }>(
    `SELECT access_token_enc, external_id FROM public.manu_conexoes_oauth
      WHERE empresa_id=$1 AND provedor='mercadolivre' AND status='conectado'
      ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC LIMIT 1`,
    [empresaId],
  );
}

async function publicarMercadoLivre(
  token: string,
  car: any,
  descricao: string,
  titulo: string,
  preco: number,
) {
  // Categoria veículos usados BR — placeholder; produção: /sites/MLB/domain_discovery
  const category_id = 'MLB1744'; // carros e caminhonetes (ajustar por discovery depois)
  const body = {
    title: titulo.slice(0, 60),
    category_id,
    price: preco,
    currency_id: 'BRL',
    available_quantity: 1,
    buying_mode: 'classified',
    listing_type_id: 'gold_special',
    condition: 'used',
    description: { plain_text: descricao.slice(0, 50000) },
    attributes: [
      { id: 'VEHICLE_YEAR', value_name: String(car.ano || car.ano_modelo || '') },
      { id: 'COLOR', value_name: String(car.cor || 'Não informado') },
      { id: 'LICENSE_PLATE', value_name: String(car.placa || '') },
    ].filter((a) => a.value_name),
  };

  const res = await fetch('https://api.mercadolibre.com/items', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `ML HTTP ${res.status}`);
  }
  return json;
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!OK.includes(String(u.tipo || '').toLowerCase()) && !isSuperAdmin(u)) {
    return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const estoqueId = Number(body.estoque_id);
  const plataformas = Array.isArray(body.plataformas)
    ? body.plataformas.map((p) => String(p).toLowerCase())
    : [];

  if (!estoqueId) return NextResponse.json({ error: 'estoque_id obrigatório' }, { status: 400 });
  if (!plataformas.length) {
    return NextResponse.json({ error: 'Selecione pelo menos uma plataforma' }, { status: 400 });
  }

  const car = await queryOne<any>(`SELECT * FROM public.estoque_carros WHERE id=$1`, [estoqueId]);
  if (!car) return NextResponse.json({ error: 'carro não encontrado' }, { status: 404 });

  const empresaId = Number(car.empresa_id || u.empresa_id || 0);
  if (!isSuperAdmin(u) && u.empresa_id && car.empresa_id && Number(car.empresa_id) !== Number(u.empresa_id)) {
    return NextResponse.json({ error: 'carro de outra empresa' }, { status: 403 });
  }

  const faltando: string[] = [];
  if (!car.marca && !car.modelo && !car.carro) faltando.push('marca/modelo');
  const precoNum = Number(body.preco ?? car.preco);
  if (!precoNum || precoNum <= 0) faltando.push('preço');
  if (faltando.length) {
    return NextResponse.json(
      {
        error: 'dados_faltando',
        message: `Preencha antes de anunciar: ${faltando.join(', ')}`,
        faltando,
      },
      { status: 400 },
    );
  }

  const titulo =
    (body.titulo || '').trim() ||
    [car.marca, car.modelo || car.carro, car.ano || car.ano_modelo].filter(Boolean).join(' ').slice(0, 60);

  const descricao =
    (body.descricao || '').trim() ||
    [
      titulo,
      car.cor ? `Cor: ${car.cor}` : '',
      car.placa ? `Placa: ${car.placa}` : '',
      car.km ? `KM: ${car.km}` : '',
      car.carroceria ? `Carroceria: ${car.carroceria}` : '',
      '',
      'Anúncio gerado via Aurox CRM.',
    ]
      .filter(Boolean)
      .join('\n');

  const resultados: Record<string, any> = {};
  const erros: string[] = [];

  for (const p of plataformas) {
    try {
      if (p === 'mercadolivre' || p === 'ml') {
        const tok = await tokenML(empresaId || Number(u.empresa_id));
        if (!tok?.access_token_enc) {
          erros.push('Mercado Livre: conecte o canal em Integrações antes');
          continue;
        }
        const item = await publicarMercadoLivre(tok.access_token_enc, car, descricao, titulo, precoNum);
        resultados.mercadolivre = {
          id: item.id,
          permalink: item.permalink,
          status: item.status,
        };
        await query(
          `INSERT INTO public.anuncios_log (empresa_id, estoque_id, placa, plataforma, external_id, status, payload, criado_por)
           VALUES ($1,$2,$3,'mercadolivre',$4,'publicado',$5::jsonb,$6)`,
          [
            empresaId || u.empresa_id,
            estoqueId,
            car.placa,
            String(item.id),
            JSON.stringify({ permalink: item.permalink, title: titulo }),
            u.id,
          ],
        );
      } else if (['olx', 'webmotors', 'napista', 'icarros', 'chavesnamao', 'facebook', 'instagram'].includes(p)) {
        // Token da loja existe, mas API de publicação de cada portal varia — registra intenção
        const conn = await queryOne(
          `SELECT id FROM public.manu_conexoes_oauth
            WHERE empresa_id=$1 AND provedor=$2 AND status='conectado' LIMIT 1`,
          [empresaId || u.empresa_id, p === 'facebook' ? 'meta_facebook' : p],
        );
        if (!conn) {
          erros.push(`${p}: canal não conectado em Integrações`);
          continue;
        }
        resultados[p] = {
          status: 'fila',
          message: 'Canal conectado. Publicação automática desta plataforma em expansão — use ML por enquanto.',
        };
        await query(
          `INSERT INTO public.anuncios_log (empresa_id, estoque_id, placa, plataforma, status, payload, criado_por)
           VALUES ($1,$2,$3,$4,'fila',$5::jsonb,$6)`,
          [
            empresaId || u.empresa_id,
            estoqueId,
            car.placa,
            p,
            JSON.stringify({ titulo, descricao, preco: precoNum }),
            u.id,
          ],
        );
      } else {
        erros.push(`${p}: plataforma desconhecida`);
      }
    } catch (e: any) {
      erros.push(`${p}: ${e?.message || e}`);
    }
  }

  const okPlats = Object.keys(resultados);
  if (okPlats.length) {
    const metaRow = await queryOne<{ anuncios_meta: any }>(
      `SELECT COALESCE(anuncios_meta,'{}'::jsonb) AS anuncios_meta FROM public.estoque_carros WHERE id=$1`,
      [estoqueId],
    );
    const meta = { ...(metaRow?.anuncios_meta || {}), ...resultados };
    await query(
      `UPDATE public.estoque_carros SET
         anunciado = true,
         anunciado_em = now(),
         anuncios_meta = $2::jsonb,
         preco = COALESCE($3::numeric, preco)
       WHERE id=$1`,
      [estoqueId, JSON.stringify(meta), precoNum || null],
    );
  }

  if (!okPlats.length) {
    return NextResponse.json(
      { error: 'falha_total', message: erros.join(' | ') || 'Nenhuma plataforma publicou' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    resultados,
    avisos: erros,
    message:
      erros.length
        ? `Publicado em parte. Avisos: ${erros.join(' | ')}`
        : 'Anúncio enviado às plataformas selecionadas.',
  });
}
