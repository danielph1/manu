import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Importa CSV no formato:
 * titulo,preco,aceita_troca,descricao_resumida,url_anuncio,data_coleta
 * (ou colunas equivalentes)
 * Superadmin only. NÃO cria lead — só enche a fila da bomba.
 */
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') || '';
  let text = '';
  let empresaId: number | null = null;
  let origem = 'facebook';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    empresaId = form.get('empresa_id') ? Number(form.get('empresa_id')) : null;
    origem = String(form.get('origem') || 'facebook');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'envie file=CSV' }, { status: 400 });
    }
    text = await (file as File).text();
  } else {
    const b = await req.json().catch(() => null);
    if (!b?.csv) return NextResponse.json({ error: 'csv texto ou multipart' }, { status: 400 });
    text = String(b.csv);
    empresaId = b.empresa_id != null ? Number(b.empresa_id) : null;
    origem = String(b.origem || 'facebook');
  }

  if (!empresaId) {
    try {
      // fallback: primeira empresa do user context not available — leave null
    } catch { /* ok */ }
  }

  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV vazio' }, { status: 400 });
  }

  // parse header
  const header = splitCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTitulo = idx(['titulo', 'title', 'name', 'nome']);
  const iPreco = idx(['preco', 'price', 'valor']);
  const iDesc = idx(['descricao_resumida', 'descricao', 'description', 'desc']);
  const iUrl = idx(['url_anuncio', 'url', 'link']);
  const iTroca = idx(['aceita_troca', 'troca']);
  const iTel = idx(['telefone', 'phone', 'whatsapp']);
  const iNome = idx(['vendedor_nome', 'vendedor', 'seller', 'nome_vendedor']);
  const iMarca = idx(['marca', 'make']);
  const iModelo = idx(['modelo', 'model']);
  const iAno = idx(['ano', 'year']);

  if (iUrl < 0 && iTitulo < 0) {
    return NextResponse.json({ error: 'CSV precisa de url_anuncio ou titulo' }, { status: 400 });
  }

  // cria busca registro
  const busca = await queryOne(
    `INSERT INTO public.marketplace_buscas (empresa_id, query, cidade, pais, status, origem, criado_por, total_encontrado)
     VALUES ($1,$2,'rio','BR','concluida',$3,$4,0) RETURNING id`,
    [empresaId, `import-csv-${origem}`, origem, u.id],
  );

  let inseridos = 0;
  let duplicados = 0;
  let erros = 0;

  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li]).map((c) => c.replace(/^"|"$/g, '').trim());
    if (!cols.length || cols.every((c) => !c)) continue;
    const titulo = iTitulo >= 0 ? cols[iTitulo] : '';
    const preco = iPreco >= 0 ? cols[iPreco] : '';
    const desc = iDesc >= 0 ? cols[iDesc] : titulo;
    let url = iUrl >= 0 ? cols[iUrl] : '';
    if (url && !url.startsWith('http')) url = `https://www.facebook.com${url}`;
    if (!url && !titulo) continue;
    // synthetic url if missing to allow unique
    if (!url) url = `import://${origem}/${Buffer.from(titulo + preco).toString('base64url').slice(0, 40)}`;

    const telefone = iTel >= 0 ? cols[iTel] : null;
    const vendedor = iNome >= 0 ? cols[iNome] : null;
    const marca = iMarca >= 0 ? cols[iMarca] : null;
    const modelo = iModelo >= 0 ? cols[iModelo] : null;
    const ano = iAno >= 0 ? cols[iAno] : extractAno(titulo);
    const troca = iTroca >= 0 ? cols[iTroca] : '';

    // tenta parse marca modelo do titulo tipo "2012 Ford Ranger"
    const parsed = parseCarroTitulo(titulo);

    try {
      const row = await queryOne(
        `INSERT INTO public.marketplace_anuncios
          (busca_id, empresa_id, titulo, preco, localizacao, url, descricao, query_origem,
           vendedor_nome, telefone, marca, modelo, ano, origem, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
         ON CONFLICT (url) DO NOTHING
         RETURNING id`,
        [
          busca?.id || null,
          empresaId,
          titulo.slice(0, 300),
          String(preco).slice(0, 80),
          'Rio de Janeiro, RJ',
          url.slice(0, 800),
          String(desc).slice(0, 4000),
          `csv:${origem}`,
          vendedor,
          telefone,
          marca || parsed.marca,
          modelo || parsed.modelo,
          ano || parsed.ano,
          origem,
          JSON.stringify({ titulo, preco, desc, troca, raw: cols }),
        ],
      );
      if (row) inseridos++;
      else duplicados++;
    } catch {
      erros++;
    }
  }

  if (busca?.id) {
    await query(
      `UPDATE public.marketplace_buscas SET total_encontrado=$2, concluido_em=now() WHERE id=$1`,
      [busca.id, inseridos],
    );
  }

  return NextResponse.json({
    ok: true,
    busca_id: busca?.id,
    inseridos,
    duplicados,
    erros,
    aviso: 'Anúncios na fila da bomba. Ainda NÃO são leads até DISTRIBUIR.',
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function extractAno(t: string): string | null {
  const m = t.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}

function parseCarroTitulo(t: string): { marca: string | null; modelo: string | null; ano: string | null } {
  const ano = extractAno(t);
  const marcas = [
    'Volkswagen','VW','Ford','Chevrolet','FIAT','Fiat','Nissan','Hyundai','Renault','Toyota',
    'Honda','Jeep','Mitsubishi','Kia','Peugeot','Citroen','BMW','Mercedes','Audi','JAC','Yamaha','Santana',
  ];
  let marca: string | null = null;
  let modelo: string | null = null;
  for (const m of marcas) {
    const re = new RegExp(`\\b${m}\\b\\s+([\\w\\-]+(?:\\s+[\\w\\-]+){0,2})?`, 'i');
    const match = t.match(re);
    if (match) {
      marca = m;
      modelo = match[1]?.trim() || null;
      break;
    }
  }
  return { marca, modelo, ano };
}
