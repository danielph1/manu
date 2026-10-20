import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * IA PASSIVA — só observa e grava insights.
 * Não há chat / interação na UI ainda.
 *
 * Chamar:
 *   POST /api/ia/observar
 *   Header: x-manu-cron: <CRON_SECRET>
 *   ou ?token=<CRON_SECRET>
 *
 * Agendar no Vercel Cron / cron-job.org a cada 1–6h.
 */

async function ensure() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.ia_snapshots (
      id bigserial PRIMARY KEY,
      empresa_id bigint,
      loja text,
      periodo text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS public.ia_insights (
      id bigserial PRIMARY KEY,
      empresa_id bigint,
      loja text,
      severidade text DEFAULT 'info',
      categoria text,
      titulo text NOT NULL,
      detalhe text,
      metricas jsonb DEFAULT '{}'::jsonb,
      ativo boolean DEFAULT true,
      created_at timestamptz DEFAULT now()
    );
  `);
}

type Agg = {
  empresa_id: number | null;
  loja: string | null;
  leads_24h: number;
  leads_7d: number;
  sem_resposta_2h: number;
  sem_comentario_interno: number;
  fichas_pendentes: number;
  fichas_aprovadas_7d: number;
  vendas_7d: number;
  tempo_medio_1a_resposta_min: number | null;
  msgs_cliente_24h: number;
  msgs_equipe_24h: number;
};

async function coletarGlobal(): Promise<Agg[]> {
  // Por empresa (vendedores.empresa_id)
  const { rows: empresas } = await query(
    `SELECT DISTINCT empresa_id FROM public.vendedores WHERE empresa_id IS NOT NULL
     UNION
     SELECT DISTINCT empresa_id FROM public.usuarios WHERE empresa_id IS NOT NULL AND LOWER(tipo) <> 'superadmin'`,
  );

  const out: Agg[] = [];
  const ids = empresas.map((e: any) => Number(e.empresa_id)).filter(Boolean);
  if (!ids.length) ids.push(0); // legado sem empresa

  for (const empresaId of ids) {
    const empFilter =
      empresaId === 0
        ? ` (v.empresa_id IS NULL) `
        : ` v.empresa_id = ${empresaId} `;

    const leads = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(l.data_lead, l.created_at) >= now() - interval '24 hours')::int AS leads_24h,
         COUNT(*) FILTER (WHERE COALESCE(l.data_lead, l.created_at) >= now() - interval '7 days')::int AS leads_7d,
         COUNT(*) FILTER (
           WHERE COALESCE(l.respondeu, FALSE) = FALSE
             AND COALESCE(l.data_lead, l.created_at) < now() - interval '2 hours'
             AND COALESCE(l.venda_concluida, FALSE) = FALSE
         )::int AS sem_resposta_2h,
         COUNT(*) FILTER (
           WHERE COALESCE(TRIM(l.comentario_interno), '') = ''
             AND l.vendedor_id IS NOT NULL
             AND COALESCE(l.venda_concluida, FALSE) = FALSE
             AND COALESCE(l.data_lead, l.created_at) >= now() - interval '7 days'
         )::int AS sem_comentario_interno
       FROM public.leads l
       LEFT JOIN public.vendedores v ON v.id = l.vendedor_id
       WHERE ${empresaId === 0 ? 'TRUE' : empFilter.replace(/v\./g, 'v.')}
         ${empresaId === 0 ? '' : `AND (${empFilter} OR l.vendedor_id IS NULL)`}`,
    ).catch(() => null);

    // query mais simples e robusta
    const baseVend = empresaId
      ? `l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = $1)`
      : 'TRUE';
    const p = empresaId ? [empresaId] : [];

    const L = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(l.data_lead, l.created_at) >= now() - interval '24 hours')::int AS leads_24h,
         COUNT(*) FILTER (WHERE COALESCE(l.data_lead, l.created_at) >= now() - interval '7 days')::int AS leads_7d,
         COUNT(*) FILTER (
           WHERE COALESCE(l.respondeu, FALSE) = FALSE
             AND COALESCE(l.data_lead, l.created_at) < now() - interval '2 hours'
             AND COALESCE(l.venda_concluida, FALSE) = FALSE
             AND l.vendedor_id IS NOT NULL
         )::int AS sem_resposta_2h,
         COUNT(*) FILTER (
           WHERE COALESCE(TRIM(l.comentario_interno), '') = ''
             AND l.vendedor_id IS NOT NULL
             AND COALESCE(l.venda_concluida, FALSE) = FALSE
             AND COALESCE(l.atribuido_em, l.data_lead, l.created_at) >= now() - interval '7 days'
         )::int AS sem_comentario_interno
       FROM public.leads l
       WHERE (${baseVend})`,
      p,
    );

    const F = await queryOne(
      `SELECT
         COUNT(*) FILTER (
           WHERE COALESCE(f.comprou, FALSE) = FALSE
             AND COALESCE(f.status_geral,'') NOT ILIKE '%recus%'
             AND COALESCE(f.status_geral,'') NOT ILIKE '%negad%'
         )::int AS fichas_pendentes,
         COUNT(*) FILTER (
           WHERE (COALESCE(f.status_geral,'') ILIKE '%aprov%' OR COALESCE(f.aprovado,FALSE) = TRUE)
             AND COALESCE(f.created_at, now()) >= now() - interval '7 days'
         )::int AS fichas_aprovadas_7d
       FROM public.fichas_credito f
       WHERE f.vendedor_id IN (SELECT id FROM public.vendedores WHERE ${
         empresaId ? 'empresa_id = $1' : 'TRUE'
       }) OR f.vendedor_id IS NULL`,
      p,
    ).catch(() => ({ fichas_pendentes: 0, fichas_aprovadas_7d: 0 }));

    const V = await queryOne(
      `SELECT COUNT(*)::int AS vendas_7d
       FROM public.leads l
       WHERE (${baseVend})
         AND (COALESCE(l.venda_concluida,FALSE) = TRUE OR l.data_venda IS NOT NULL)
         AND COALESCE(l.data_venda, l.created_at) >= now() - interval '7 days'`,
      p,
    ).catch(() => ({ vendas_7d: 0 }));

    const M = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE m.mensagem ILIKE '[cliente]%' OR m.remetente_id IS NULL)::int AS msgs_cliente_24h,
         COUNT(*) FILTER (WHERE m.remetente_id IS NOT NULL AND m.mensagem NOT ILIKE '[cliente]%')::int AS msgs_equipe_24h
       FROM public.chat_geral_mensagens m
       JOIN public.leads l ON l.id = m.lead_id
       WHERE m.created_at >= now() - interval '24 hours'
         AND (${baseVend})`,
      p,
    ).catch(() => ({ msgs_cliente_24h: 0, msgs_equipe_24h: 0 }));

    out.push({
      empresa_id: empresaId || null,
      loja: null,
      leads_24h: Number(L?.leads_24h || leads?.leads_24h || 0),
      leads_7d: Number(L?.leads_7d || 0),
      sem_resposta_2h: Number(L?.sem_resposta_2h || 0),
      sem_comentario_interno: Number(L?.sem_comentario_interno || 0),
      fichas_pendentes: Number((F as any)?.fichas_pendentes || 0),
      fichas_aprovadas_7d: Number((F as any)?.fichas_aprovadas_7d || 0),
      vendas_7d: Number((V as any)?.vendas_7d || 0),
      tempo_medio_1a_resposta_min: null,
      msgs_cliente_24h: Number((M as any)?.msgs_cliente_24h || 0),
      msgs_equipe_24h: Number((M as any)?.msgs_equipe_24h || 0),
    });
  }
  return out;
}

function gerarInsights(a: Agg): Array<{
  severidade: string;
  categoria: string;
  titulo: string;
  detalhe: string;
  metricas: Record<string, number>;
}> {
  const list: any[] = [];

  if (a.sem_resposta_2h >= 3) {
    list.push({
      severidade: a.sem_resposta_2h >= 10 ? 'alta' : 'media',
      categoria: 'atendimento',
      titulo: `${a.sem_resposta_2h} leads sem resposta há mais de 2h`,
      detalhe:
        'Leads atribuídos ainda sem flag de resposta. Risco de perda e rotação automática.',
      metricas: { sem_resposta_2h: a.sem_resposta_2h },
    });
  }

  if (a.sem_comentario_interno >= 5) {
    list.push({
      severidade: 'media',
      categoria: 'retencao_lead',
      titulo: `${a.sem_comentario_interno} leads sem comentário interno (7d)`,
      detalhe:
        'Sem comentário interno o lead pode rotacionar. Padrão: comentar para segurar.',
      metricas: { sem_comentario_interno: a.sem_comentario_interno },
    });
  }

  if (a.leads_7d > 0 && a.vendas_7d === 0 && a.fichas_aprovadas_7d === 0) {
    list.push({
      severidade: 'media',
      categoria: 'conversao',
      titulo: 'Leads na semana sem aprovação nem venda',
      detalhe: `${a.leads_7d} leads em 7 dias, 0 aprovações e 0 vendas registradas no período.`,
      metricas: { leads_7d: a.leads_7d, vendas_7d: 0 },
    });
  }

  if (a.msgs_cliente_24h > a.msgs_equipe_24h * 2 && a.msgs_cliente_24h >= 10) {
    list.push({
      severidade: 'alta',
      categoria: 'chat',
      titulo: 'Clientes falam bem mais que a equipe (24h)',
      detalhe: `Msgs cliente ${a.msgs_cliente_24h} vs equipe ${a.msgs_equipe_24h}. Possível gargalo de resposta no chat.`,
      metricas: {
        msgs_cliente_24h: a.msgs_cliente_24h,
        msgs_equipe_24h: a.msgs_equipe_24h,
      },
    });
  }

  if (a.fichas_pendentes >= 8) {
    list.push({
      severidade: 'info',
      categoria: 'credito',
      titulo: `${a.fichas_pendentes} fichas ainda em aberto`,
      detalhe: 'Fila de crédito/ElfenAI pode estar acumulando etapas.',
      metricas: { fichas_pendentes: a.fichas_pendentes },
    });
  }

  // snapshot “saudável”
  if (!list.length) {
    list.push({
      severidade: 'info',
      categoria: 'resumo',
      titulo: 'Operação estável neste ciclo',
      detalhe: `24h: ${a.leads_24h} leads · 7d: ${a.leads_7d} leads, ${a.vendas_7d} vendas, ${a.fichas_aprovadas_7d} aprovações.`,
      metricas: {
        leads_24h: a.leads_24h,
        leads_7d: a.leads_7d,
        vendas_7d: a.vendas_7d,
      },
    });
  }

  return list;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-manu-cron') || new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.CRON_SECRET || process.env.ENTRADA_SECRET || '';
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await ensure();
    const aggs = await coletarGlobal();
    let snapshots = 0;
    let insights = 0;

    for (const a of aggs) {
      await query(
        `INSERT INTO public.ia_snapshots (empresa_id, loja, periodo, payload)
         VALUES ($1,$2,'ciclo',$3::jsonb)`,
        [a.empresa_id, a.loja, JSON.stringify(a)],
      );
      snapshots++;

      // desativa insights antigos da mesma categoria (evita poluir)
      try {
        await query(
          `UPDATE public.ia_insights SET ativo = FALSE
           WHERE COALESCE(empresa_id,0) = COALESCE($1,0)
             AND created_at < now() - interval '12 hours'`,
          [a.empresa_id],
        );
      } catch { /* ok */ }

      for (const ins of gerarInsights(a)) {
        await query(
          `INSERT INTO public.ia_insights
             (empresa_id, loja, severidade, categoria, titulo, detalhe, metricas, ativo)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,TRUE)`,
          [
            a.empresa_id,
            a.loja,
            ins.severidade,
            ins.categoria,
            ins.titulo,
            ins.detalhe,
            JSON.stringify(ins.metricas),
          ],
        );
        insights++;
      }
    }

    return NextResponse.json({
      ok: true,
      passiva: true,
      snapshots,
      insights,
      empresas: aggs.length,
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

/** Cron Vercel (GET) com token, ou superadmin lê insights */
export async function GET(req: NextRequest) {
  const secret =
    req.headers.get('x-manu-cron') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    new URL(req.url).searchParams.get('token') ||
    '';
  const expected = process.env.CRON_SECRET || process.env.ENTRADA_SECRET || '';

  // Cron: roda observação
  if (expected && secret === expected) {
    const fake = new Request(req.url, { method: 'POST', headers: { 'x-manu-cron': secret } });
    return POST(fake as any);
  }

  const { requireUser } = await import('@/lib/session');
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }
  try {
    await ensure();
    const { rows: insights } = await query(
      `SELECT * FROM public.ia_insights
       WHERE COALESCE(ativo, TRUE) = TRUE
       ORDER BY created_at DESC LIMIT 50`,
    );
    const { rows: snaps } = await query(
      `SELECT id, empresa_id, periodo, created_at, payload
       FROM public.ia_snapshots ORDER BY created_at DESC LIMIT 10`,
    );
    return NextResponse.json({ insights, snapshots: snaps });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
