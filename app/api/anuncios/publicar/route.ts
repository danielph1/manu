import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase';
import { accessTokenMLValido } from '@/lib/mercadolivre/access-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OK = ['admin', 'marketing', 'superadmin', 'gerente'];

type Body = {
  estoque_id: number;
  plataformas: string[];
  descricao?: string;
  preco?: number | string;
  titulo?: string;
  telefone_whatsapp?: string;
  cidade_ml_id?: string;
};

// AUROX_ML_V13 — publicação de veículos: pacote silver, localização, imagens e validação.
function limparTelefone(v: unknown) {
  const d=String(v ?? '').replace(/\D/g,'');
  return d.startsWith('55') && d.length>=12 ? d.slice(2) : d;
}

function erroML(json: any, fallback: string) {
  const causas=Array.isArray(json?.cause)
    ? json.cause.map((c: any)=>String(c?.message || c?.code || '')).filter(Boolean)
    : [];
  const principal=String(json?.message || json?.error || fallback);
  return [principal, ...causas.slice(0,5)].filter(Boolean).join(' | ').slice(0,800);
}

async function publicarMercadoLivre(
  token: string, car: any, descricao: string, titulo: string, preco: number,
  telefone: string, cidadeId: string,
) {
  const categoria = /moto|motocicleta|scooter/i.test(String(car.carroceria || ''))
    || /motos?\s*(0|o)\s*km/i.test(String(car.marca || ''))
    ? 'MLB1763' : 'MLB1744';
  const fabricante=String(car.marca || '').trim();
  const modelo=String(car.modelo || car.carro || '').trim();
  if (!String(car.carroceria || '').trim())
    throw new Error('Selecione a carroceria do veículo no estoque (ex.: moto, sedan, SUV).');
  if (!fabricante || /^motos?\s*(0|o)\s*km$/i.test(fabricante) || !modelo)
    throw new Error('Informe a marca fabricante real e o modelo do veículo no estoque (ex.: Honda / PCX).');
  const tel=limparTelefone(telefone);
  if (!/^\d{10,11}$/.test(tel))
    throw new Error('Informe o WhatsApp da loja com DDD (10 ou 11 dígitos).');
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(cidadeId))
    throw new Error('Selecione um estado e uma cidade válidos no campo Localização da loja.');
  const { rows: fotos } = await query<{path: string}>(
    'SELECT path FROM public.estoque_fotos WHERE carro_id=$1 ORDER BY ordem ASC, id ASC LIMIT 6',
    [Number(car.id)],
  );
  if (!fotos.length)
    throw new Error('Adicione pelo menos uma foto REAL do veículo antes de publicar (não a imagem AGUARDE).');
  const fotosEnviadas: {id:string}[]=[];
  for(const foto of fotos) {
    const {data, error}=await supabaseAdmin.storage.from('manu_arquivos').download(foto.path);
    if (error || !data) throw new Error('Não foi possível ler uma das fotos do estoque no Supabase Storage.');
    const bytes=await data.arrayBuffer();
    const form=new FormData();
    const ext=String(foto.path.split('.').pop() || 'jpg').toLowerCase();
    const mime=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';
    form.append('file',new Blob([bytes],{type:mime}),'foto.'+ext);
    const r=await fetch('https://api.mercadolibre.com/pictures/items/upload',{
      method:'POST',headers:{Authorization:'Bearer '+token},body:form,
      signal:AbortSignal.timeout(20000),
    });
    const j=await r.json().catch(()=>({}));
    if (!r.ok || !j?.id) throw new Error('Falha no upload de foto para o Mercado Livre: '+erroML(j,'HTTP '+r.status));
    fotosEnviadas.push({id:String(j.id)});
  }
  const body={
    title:titulo.slice(0,60),category_id:categoria,price:preco,currency_id:'BRL',
    available_quantity:1,buying_mode:'classified',listing_type_id:'silver',
    condition:/\b(0\s*km|zero\s*km)\b/i.test(titulo)?'new':'used',
    channels:['marketplace'],
    description:{plain_text:descricao.slice(0,50000)},
    pictures:fotosEnviadas,
    seller_contact:{contact:'',other_info:'',country_code:'55',area_code:'',phone:tel,
      country_code2:'55',phone2:tel,email:'',webpage:''},
    location:{city:{id:cidadeId}},
    attributes:[
      {id:'BRAND',value_name:fabricante},
      {id:'MODEL',value_name:modelo},
      {id:'VEHICLE_YEAR',value_name:String(car.ano || '').split('/')[0]},
      {id:'COLOR',value_name:String(car.cor || '')},
    ].filter(a=>a.value_name),
  };
  // O validado não publica nem consome uma nova cota. Em caso de erro,
  // manter dados e detalhar os motivos antes de POST /items.
  const validacao=await fetch('https://api.mercadolibre.com/items/validate',{
    method:'POST',headers:{Authorization:'Bearer '+token,
      'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000),
  });
  if (!validacao.ok) {
    const j=await validacao.json().catch(()=>({}));
    throw new Error('Pré-validação Mercado Livre: '+erroML(j,'HTTP '+validacao.status));
  }
  const res=await fetch('https://api.mercadolibre.com/items',{
    method:'POST',headers:{Authorization:'Bearer '+token,
      'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(30000),
  });
  const json=await res.json().catch(()=>({}));
  if (!res.ok)throw new Error('Mercado Livre: '+erroML(json,'HTTP '+res.status));
  if (!json?.id)throw new Error('Mercado Livre não devolveu ID da publicação: verifique a conta antes de repetir.');
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
  if (!car.empresa_id || (!isSuperAdmin(u) && (!u.empresa_id || Number(car.empresa_id) !== Number(u.empresa_id)))) {
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
        const existente = await queryOne<{id:string}>(
          "SELECT anuncios_meta->'mercadolivre'->>'id' AS id FROM public.estoque_carros WHERE id=$1",
          [estoqueId],
        );
        if (existente?.id) {
          erros.push('Mercado Livre: este veículo já tem anúncio registrado ('+existente.id+'). Consulte o anúncio antes de publicar novamente.');
          continue;
        }
        const item = await publicarMercadoLivre(mlToken, car, descricao, titulo, precoNum, String(body.telefone_whatsapp || ''), String(body.cidade_ml_id || ''));
        resultados.mercadolivre = {
          id: item.id,
          permalink: item.permalink,
          status: item.status,
        };
        try { await query(
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
        ); } catch(e) { console.warn('[Aurox ML] publicação criada; auditoria não gravada', e instanceof Error ? e.message : 'erro'); }
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

