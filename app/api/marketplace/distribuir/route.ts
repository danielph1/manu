import { NextRequest, NextResponse } from 'next/server';
import { query, getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function onlyDigits(s: string) {
  return String(s || '').replace(/\D/g, '');
}

/** Monta observação padronizada para o painel do vendedor */
function montarObservacao(a: any, batchId: string): string {
  const payload = typeof a.payload === 'object' && a.payload ? a.payload : {};
  const descricao =
    a.descricao ||
    payload.descricao ||
    payload.description ||
    payload.desc ||
    '';
  const marca = a.marca || payload.marca || payload.make || '';
  const modelo = a.modelo || payload.modelo || payload.model || '';
  const ano = a.ano || payload.ano || payload.year || '';
  const carroParts = [marca, modelo, ano].filter(Boolean);
  const carro =
    carroParts.length > 0
      ? carroParts.join(' ')
      : String(a.titulo || payload.title || '').slice(0, 120);

  const linhas = [
    `observacao: ${String(descricao || a.titulo || 'Anúncio Marketplace').slice(0, 1500)}`,
    `carro: ${carro}`,
  ];
  if (a.preco || payload.price) linhas.push(`preco: ${a.preco || payload.price}`);
  if (a.localizacao || payload.location) linhas.push(`local: ${a.localizacao || payload.location}`);
  if (a.query_origem) linhas.push(`busca: ${a.query_origem}`);
  if (a.url) linhas.push(`link: ${a.url}`);
  linhas.push(`origem: marketplace`);
  linhas.push(`lote: ${batchId}`);
  return linhas.join('\n').slice(0, 4000);
}

function nomeLead(a: any): string {
  const payload = typeof a.payload === 'object' && a.payload ? a.payload : {};
  const n =
    a.vendedor_nome ||
    payload.vendedor_nome ||
    payload.sellerName ||
    payload.seller ||
    payload.nome ||
    '';
  if (String(n).trim()) return String(n).trim().slice(0, 120);
  // Sem nome do anunciante: usa título curto
  const t = String(a.titulo || payload.title || 'Contato Marketplace').trim();
  return t.slice(0, 80) || 'Contato Marketplace';
}

function telefoneLead(a: any): string | null {
  const payload = typeof a.payload === 'object' && a.payload ? a.payload : {};
  const raw =
    a.telefone ||
    payload.telefone ||
    payload.phone ||
    payload.whatsapp ||
    payload.mobile ||
    '';
  const d = onlyDigits(raw);
  if (d.length >= 10) return d.slice(0, 20);
  return null;
}

function interesse(a: any): string {
  const payload = typeof a.payload === 'object' && a.payload ? a.payload : {};
  const marca = a.marca || payload.marca || '';
  const modelo = a.modelo || payload.modelo || '';
  const ano = a.ano || payload.ano || '';
  const joined = [marca, modelo, ano].filter(Boolean).join(' ');
  if (joined) return joined.slice(0, 200);
  return String(a.titulo || 'Marketplace / troca').slice(0, 200);
}

export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (String(b.confirmacao || '') !== 'DISTRIBUIR') {
    return NextResponse.json(
      { error: 'Digite exatamente DISTRIBUIR no campo confirmacao para executar.' },
      { status: 400 },
    );
  }
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter((n: number) => n > 0) : [];
  if (!ids.length) return NextResponse.json({ error: 'ids[] obrigatório' }, { status: 400 });

  // exigir_telefone: se true, pula anúncios sem telefone (padrão false — Marketplace quase nunca tem)
  const exigirTelefone = b.exigir_telefone === true;

  const { rows: anuncios } = await query(
    `SELECT * FROM public.marketplace_anuncios
      WHERE id = ANY($1::bigint[]) AND status IN ('novo','selecionado') ORDER BY id`,
    [ids],
  );

  if (!anuncios.length) {
    return NextResponse.json({
      ok: false,
      error: 'Nenhum anúncio elegível. Nada foi criado.',
      distribuido: 0,
    });
  }

  const empresaId =
    b.empresa_id != null
      ? Number(b.empresa_id)
      : anuncios.find((a: any) => a.empresa_id)?.empresa_id || null;

  const { rows: vendedores } = await query(
    empresaId
      ? `SELECT id, nome FROM public.vendedores
          WHERE empresa_id=$1 AND LOWER(COALESCE(nome,'')) <> 'matheus'
            AND COALESCE(ativo, TRUE) IS NOT FALSE`
      : `SELECT id, nome FROM public.vendedores
          WHERE LOWER(COALESCE(nome,'')) <> 'matheus' AND COALESCE(ativo, TRUE) IS NOT FALSE LIMIT 200`,
    empresaId ? [empresaId] : [],
  );
  if (!vendedores.length) {
    return NextResponse.json({
      ok: false,
      error: 'Zero vendedores na empresa. Abortado. Nenhum lead criado.',
      distribuido: 0,
    });
  }

  const batchId = randomUUID();
  const client = await getPool().connect();
  const criados: any[] = [];
  const pulados: any[] = [];
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO public.marketplace_lotes (id, empresa_id, criado_por, total_anuncios, observacao)
       VALUES ($1,$2,$3,$4,$5)`,
      [batchId, empresaId, u.id, anuncios.length, 'distribuicao nuclear'],
    );

    const pool = [...vendedores];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    let vi = 0;
    for (const a of anuncios) {
      const tel = telefoneLead(a);
      if (exigirTelefone && !tel) {
        pulados.push({ anuncio_id: a.id, motivo: 'sem telefone' });
        continue;
      }
      const v = pool[vi % pool.length];
      vi++;
      const nome = nomeLead(a);
      const obs = montarObservacao(a, batchId);
      // Placeholder legível quando não há telefone (painel exige contato)
      const telefoneFinal = tel || 'ver_link_facebook';

      const { rows: leadRows } = await client.query(
        `INSERT INTO public.leads
          (nome_lead, telefone, email, produto_interesse, observacao, vendedor_id, data_lead, atribuido_em, rotacionar)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now(), TRUE) RETURNING id`,
        [
          nome,
          telefoneFinal,
          a.email || null,
          interesse(a),
          obs,
          v.id,
        ],
      );
      const leadId = Number(leadRows[0].id);
      const upd = await client.query(
        `UPDATE public.marketplace_anuncios
            SET status='distribuido', lead_id=$2, batch_id=$3
          WHERE id=$1 AND status IN ('novo','selecionado')
          RETURNING id`,
        [a.id, leadId, batchId],
      );
      if (!upd.rowCount) {
        await client.query(`DELETE FROM public.leads WHERE id=$1`, [leadId]);
        continue;
      }
      criados.push({
        anuncio_id: a.id,
        lead_id: leadId,
        vendedor_id: v.id,
        vendedor_nome: v.nome,
        telefone: telefoneFinal,
        nome,
      });
    }

    await client.query(
      `UPDATE public.marketplace_lotes SET total_leads=$2 WHERE id=$1`,
      [batchId, criados.length],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('distribuir nuclear', err);
    return NextResponse.json(
      { ok: false, error: 'Falha na transação. Rollback — nenhum lead deste clique.', distribuido: 0 },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    distribuido: criados.length,
    pulados: pulados.length,
    detalhe: criados,
    aviso:
      'Telefone real quase nunca vem do Marketplace público. Sem número usamos ver_link_facebook e o vendedor contata pelo link na observação.',
  });
}
