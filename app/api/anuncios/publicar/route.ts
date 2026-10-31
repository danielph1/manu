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
  return queryOne<{
    id: string;
    access_token_enc: string;
    refresh_token_enc: string | null;
    external_id: string;
  }>(
    `SELECT id, access_token_enc, refresh_token_enc, external_id FROM public.manu_conexoes_oauth
      WHERE empresa_id=$1 AND provedor='mercadolivre' AND status='conectado'
      ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC LIMIT 1`,
    [empresaId],
  );
}

/** Access token ML expira (~6h). Usa refresh_token e grava o novo. */
async function accessTokenMLValido(empresaId: number): Promise<string> {
  const row = await tokenML(empresaId);
  if (!row?.access_token_enc) {
    throw new Error('Mercado Livre não conectado — Integrações → Conectar Mercado Livre');
  }

  // testa o token
  const me = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${row.access_token_enc}` },
  });
  if (me.ok) return row.access_token_enc;

  const clientId = process.env.ML_APP_ID || process.env.MERCADOLIVRE_APP_ID || '';
  const secret = process.env.ML_APP_SECRET || process.env.MERCADOLIVRE_APP_SECRET || '';
  if (!row.refresh_token_enc || !clientId || !secret) {
    throw new Error(
      'Token Mercado Livre expirado. Abra Integrações → desconecte e conecte o Mercado Livre de novo.',
    );
  }

  const refreshRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: secret,
      refresh_token: row.refresh_token_enc,
    }),
  });
  const tj = await refreshRes.json();
  if (!tj.access_token) {
    throw new Error(
      'Não foi possível renovar o Mercado Livre. Reconecte o canal em Integrações.',
    );
  }

  try {
    await query(
      `UPDATE public.manu_conexoes_oauth SET
         access_token_enc = $2,
         refresh_token_enc = COALESCE($3, refresh_token_enc),
         atualizado_em = now()
       WHERE id = $1`,
      [row.id, tj.access_token, tj.refresh_token || null],
    );
  } catch {
    await query(
      `UPDATE public.manu_conexoes_oauth SET access_token_enc = $2 WHERE id = $1`,
      [row.id, tj.access_token],
    );
  }
  return tj.access_token as string;
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
      { id: 'VEHICLE_YEAR', value_name: String(car.ano || '') },
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
    const msg = json?.message || json?.error || `ML HTTP ${res.status}`;
    if (String(msg).toLowerCase().includes('invalid') || res.status === 401) {
      throw new Error('Token Mercado Livre inválido/expirado. Integrações → reconectar Mercado Livre.');
    }
    throw new Error(msg);
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
    [car.marca, car.modelo || car.carro, car.ano].filter(Boolean).join(' ').slice(0, 60);

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
        let mlToken: string;
        try {
          mlToken = await accessTokenMLValido(empresaId || Number(u.empresa_id) || 0);
        } catch (e: any) {
          erros.push(e?.message || 'Mercado Livre: reconecte em Integrações');
          continue;
        }
        const item = await publicarMercadoLivre(mlToken, car, descricao, titulo, precoNum);
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

  // Só conta publicação REAL (tem id/permalink ou status publicado)
  const publicadosDeVerdade = Object.entries(resultados).filter(([, v]) => {
    if (!v || typeof v !== 'object') return false;
    if (v.permalink || v.id) return true;
    if (v.status === 'publicado' || v.status === 'active') return true;
    return false;
  });
  const soFila = Object.entries(resultados).filter(([, v]) => v?.status === 'fila');

  const metaRow = await queryOne<{ anuncios_meta: any }>(
    `SELECT COALESCE(anuncios_meta,'{}'::jsonb) AS anuncios_meta FROM public.estoque_carros WHERE id=$1`,
    [estoqueId],
  );
  const meta = { ...(metaRow?.anuncios_meta || {}), ...resultados };

  if (publicadosDeVerdade.length) {
    await query(
      `UPDATE public.estoque_carros SET
         anunciado = true,
         anunciado_em = now(),
         anuncios_meta = $2::jsonb,
         preco = COALESCE($3::numeric, preco)
       WHERE id=$1`,
      [estoqueId, JSON.stringify(meta), precoNum || null],
    );
  } else if (Object.keys(resultados).length || erros.length) {
    // guarda tentativa sem marcar como no ar
    await query(
      `UPDATE public.estoque_carros SET anuncios_meta = $2::jsonb WHERE id=$1`,
      [estoqueId, JSON.stringify(meta)],
    );
  }

  if (!publicadosDeVerdade.length && !soFila.length) {
    return NextResponse.json(
      {
        error: 'falha_total',
        message: erros.join(' | ') || 'Nenhuma plataforma publicou de verdade',
        resultados,
        avisos: erros,
        links: [],
      },
      { status: 400 },
    );
  }

  const links = publicadosDeVerdade
    .map(([plat, v]) => ({
      plataforma: plat,
      url: v.permalink || v.url || null,
      id: v.id || null,
      status: v.status || 'publicado',
    }))
    .filter((x) => x.url || x.id);

  return NextResponse.json({
    ok: publicadosDeVerdade.length > 0,
    resultados,
    avisos: [
      ...erros,
      ...soFila.map(([p]) => `${p}: registrado na fila Aurox (API de publicação ainda não envia sozinha)`),
    ],
    links,
    message:
      links.length
        ? `No ar em ${links.length} plataforma(s).` +
          (erros.length ? ` Falhas: ${erros.join(' | ')}` : '')
        : soFila.length
          ? 'Só fila interna — nenhum anúncio foi ao ar nas plataformas. Reconecte Mercado Livre ou use outra API.'
          : erros.join(' | '),
  });
}

