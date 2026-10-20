import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Métricas + projeções (visão macro e micro).
 * Modelo simplificado de regressão defasada (sem libs externas):
 *   Y_t ≈ β0 + β1·leads_{t-1} + β2·leads_t + β3·vendas_{t-1}
 * βs estimados por mínimos quadrados em série mensal (até 6 meses).
 */

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** OLS 1 variável dependente, várias independentes (inclui intercepto) */
function ols(y: number[], Xrows: number[][]) {
  const n = y.length;
  if (n < 2) return null;
  const k = Xrows[0].length; // cols
  // (X'X) e (X'y)
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const x = Xrows[i];
    for (let a = 0; a < k; a++) {
      Xty[a] += x[a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += x[a] * x[b];
    }
  }
  // Gauss-Jordan
  const A = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const div = A[col][col];
    for (let c = col; c <= k; c++) A[col][c] /= div;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let c = col; c <= k; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row) => row[k]);
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const tipo = String(u.tipo || '').toLowerCase();
  // métricas: admin / gerente / marketing / superadmin (Aurox)
  if (!['admin', 'gerente', 'marketing', 'superadmin'].includes(tipo)) {
    return NextResponse.json({ error: 'sem acesso' }, { status: 403 });
  }

  try {
    const periodo = req.nextUrl.searchParams.get('periodo') || 'mes';
    const lojaParam = (req.nextUrl.searchParams.get('loja') || 'geral').trim();
    const now = new Date();
    let di: string | null = null;
    let df: string | null = null;
    if (periodo === 'mes') {
      di = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    } else if (periodo === 'mes_passado') {
      di = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      df = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    }

    // plano efetivo (sessão ou black)
    const plano = String((u as any).loja_plano || (u as any).plano || 'black').toLowerCase();

    const params: unknown[] = [di];
    let scope = '';
    // isolamento empresa
    if (u.empresa_id && tipo !== 'superadmin') {
      params.push(u.empresa_id);
      scope += ` AND (vendedor_id IS NULL OR vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = $${params.length}))`;
    }
    // gerente: só a loja dele
    if (tipo === 'gerente' && u.loja) {
      params.push(u.loja);
      scope += ` AND vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length}))`;
    } else if (lojaParam && lojaParam !== 'geral' && ['admin', 'marketing', 'superadmin'].includes(tipo)) {
      params.push(lojaParam);
      scope += ` AND vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length}))`;
    }

    let row: any = { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendidos: 0 };
    try {
      row = await queryOne<any>(
        `SELECT
          COUNT(*)::int AS leads,
          COUNT(*) FILTER (WHERE COALESCE(respondeu,FALSE))::int AS responderam,
          COUNT(*) FILTER (WHERE COALESCE(gerou_ficha,FALSE))::int AS fichas,
          COUNT(*) FILTER (WHERE COALESCE(aprovado,FALSE))::int AS aprovados,
          COUNT(*) FILTER (WHERE COALESCE(venda_concluida,FALSE) OR data_venda IS NOT NULL)::int AS vendidos
        FROM public.leads
        WHERE ($1::date IS NULL OR data_lead >= $1::date)
        ${df ? ` AND data_lead < '${df}'::date` : ''}
        ${scope}`,
        params,
      );
    } catch {
      try {
        row = await queryOne<any>(
          `SELECT COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE COALESCE(respondeu,FALSE))::int AS responderam,
             COUNT(*) FILTER (WHERE COALESCE(gerou_ficha,FALSE))::int AS fichas,
             0::int AS aprovados,
             COUNT(*) FILTER (WHERE COALESCE(venda_concluida,FALSE))::int AS vendidos
           FROM public.leads`,
        );
      } catch { /* zeros */ }
    }

    let porBanco: any[] = [];
    try {
      const r = await query(
        `SELECT
           COALESCE(banco, '—') AS banco,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status,'')) IN ('aprovada','aprovado'))::int AS aprovadas,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status,'')) IN ('negada','reprovada','negado'))::int AS negadas,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status,'')) IN ('pendente','enviada') OR status IS NULL)::int AS pendentes
         FROM public.ficha_bancos
         GROUP BY 1 ORDER BY 1 LIMIT 20`,
      );
      porBanco = r.rows;
    } catch {
      porBanco = [];
    }

    // Financeiro a partir do "gerou venda" (fichas comprou) — mais completo que só faturamento
    let fin: any = {};
    try {
      fin =
        (await queryOne(
          `SELECT
             COALESCE(SUM(
               COALESCE(fc.valor_liberado, (
                 SELECT fb.valor_financiado FROM public.ficha_bancos fb
                 WHERE fb.ficha_id = fc.id AND LOWER(COALESCE(fb.status,'')) LIKE 'aprov%'
                 ORDER BY fb.id DESC LIMIT 1
               ), 0)
             ), 0)::float AS valor_liberado,
             COALESCE(SUM(
               COALESCE(fc.entrada_paga, fc.valor_entrada, fc.entrada_total, 0)
             ), 0)::float AS entrada_paga,
             COALESCE(SUM(
               COALESCE(fc.valor_pendente, fc.boleto_total, fc.boleto_valor, 0)
             ), 0)::float AS valor_pendente,
             COALESCE(SUM(
               COALESCE(fc.boleto_total, fc.boleto_valor, 0)
             ), 0)::float AS total_boletos,
             COUNT(*) FILTER (
               WHERE COALESCE(fc.valor_pendente, fc.boleto_total, fc.boleto_valor, 0) > 0
             )::int AS clientes_com_boleto,
             COUNT(*)::int AS vendas
           FROM public.fichas_credito fc
           WHERE COALESCE(fc.comprou, FALSE) = TRUE
             AND ($1::date IS NULL OR COALESCE(fc.data_compra, fc.created_at)::date >= $1::date)
             AND ($2::date IS NULL OR COALESCE(fc.data_compra, fc.created_at)::date < $2::date)`,
          [di, df],
        )) || {};
    } catch {
      // fallback faturamentos
      try {
        fin =
          (await queryOne(
            `SELECT
               COALESCE(SUM(COALESCE(fc.valor_liberado,0)),0)::float AS valor_liberado,
               COALESCE(SUM(COALESCE(f.entrada_total,0)),0)::float AS entrada_paga,
               COALESCE(SUM(COALESCE(f.entrada_boleto,0)),0)::float AS total_boletos,
               COALESCE(SUM(COALESCE(f.entrada_boleto,0)),0)::float AS valor_pendente,
               COUNT(*) FILTER (WHERE COALESCE(f.entrada_boleto,0) > 0)::int AS clientes_com_boleto
             FROM public.faturamentos f
             LEFT JOIN public.fichas_credito fc ON fc.id = f.ficha_id
             WHERE ($1::date IS NULL OR f.created_at::date >= $1)
               AND ($2::date IS NULL OR f.created_at::date < $2)`,
            [di, df],
          )) || {};
      } catch {
        fin = {};
      }
    }

    // gasto oficina (valor_final / valor_carro no período)
    let gasto_oficina = 0;
    try {
      const g = await queryOne(
        `SELECT COALESCE(SUM(
           COALESCE(
             NULLIF(regexp_replace(COALESCE(valor_final::text,''), '[^0-9,.-]', '', 'g'), '')::float,
             NULLIF(regexp_replace(COALESCE(valor_carro::text,''), '[^0-9,.-]', '', 'g'), '')::float,
             0
           )
         ),0)::float AS g
         FROM public.oficina_carros
         WHERE ($1::date IS NULL OR COALESCE(created_at, now())::date >= $1::date)
           AND ($2::date IS NULL OR COALESCE(created_at, now())::date < $2::date)`,
        [di, df],
      );
      gasto_oficina = Number(g?.g || 0);
    } catch {
      try {
        const g = await queryOne(
          `SELECT COALESCE(SUM(COALESCE(valor_carro,0)),0)::float AS g FROM public.oficina_carros`,
        );
        gasto_oficina = Number(g?.g || 0);
      } catch {
        gasto_oficina = 0;
      }
    }

    // --- Série mensal (6 meses) para projeção ---
    const historico: {
      mes: string;
      leads: number;
      responderam: number;
      fichas: number;
      aprovados: number;
      vendidos: number;
      valor_bruto: number;
    }[] = [];

    for (let i = 5; i >= 0; i--) {
      const start = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -i);
      const end = addMonths(start, 1);
      const diM = start.toISOString().slice(0, 10);
      const dfM = end.toISOString().slice(0, 10);
      let m: any = { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendidos: 0 };
      try {
        if (tipo === 'gerente' && u.loja) {
          m = await queryOne(
            `SELECT
               COUNT(*)::int AS leads,
               COUNT(*) FILTER (WHERE COALESCE(respondeu,FALSE))::int AS responderam,
               COUNT(*) FILTER (WHERE COALESCE(gerou_ficha,FALSE))::int AS fichas,
               COUNT(*) FILTER (WHERE COALESCE(aprovado,FALSE))::int AS aprovados,
               COUNT(*) FILTER (WHERE COALESCE(venda_concluida,FALSE) OR data_venda IS NOT NULL)::int AS vendidos
             FROM public.leads
             WHERE data_lead >= $1::date AND data_lead < $2::date
               AND vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($3))`,
            [diM, dfM, u.loja],
          );
        } else {
          m = await queryOne(
            `SELECT
               COUNT(*)::int AS leads,
               COUNT(*) FILTER (WHERE COALESCE(respondeu,FALSE))::int AS responderam,
               COUNT(*) FILTER (WHERE COALESCE(gerou_ficha,FALSE))::int AS fichas,
               COUNT(*) FILTER (WHERE COALESCE(aprovado,FALSE))::int AS aprovados,
               COUNT(*) FILTER (WHERE COALESCE(venda_concluida,FALSE) OR data_venda IS NOT NULL)::int AS vendidos
             FROM public.leads
             WHERE data_lead >= $1::date AND data_lead < $2::date`,
            [diM, dfM],
          );
        }
      } catch {
        m = { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendidos: 0 };
      }
      let val = 0;
      try {
        const f = await queryOne(
          `SELECT COALESCE(SUM(COALESCE(entrada_total,0) + COALESCE(entrada_boleto,0)),0)::float AS v
           FROM public.faturamentos
           WHERE created_at::date >= $1 AND created_at::date < $2`,
          [diM, dfM],
        );
        val = Number(f?.v || 0);
      } catch {
        val = 0;
      }
      historico.push({
        mes: monthKey(start),
        leads: Number(m?.leads || 0),
        responderam: Number(m?.responderam || 0),
        fichas: Number(m?.fichas || 0),
        aprovados: Number(m?.aprovados || 0),
        vendidos: Number(m?.vendidos || 0),
        valor_bruto: val,
      });
    }

    // Taxas (conversão / crédito)
    const sum = historico.reduce(
      (a, h) => ({
        leads: a.leads + h.leads,
        responderam: a.responderam + h.responderam,
        fichas: a.fichas + h.fichas,
        aprovados: a.aprovados + h.aprovados,
        vendidos: a.vendidos + h.vendidos,
        valor: a.valor + h.valor_bruto,
      }),
      { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendidos: 0, valor: 0 },
    );

    const safe = (n: number, d: number) => (d > 0 ? n / d : 0);
    const taxas = {
      resposta: safe(sum.responderam, sum.leads),
      ficha: safe(sum.fichas, sum.leads),
      aprovacao_credito: safe(sum.aprovados, sum.fichas || sum.leads),
      conversao_venda: safe(sum.vendidos, sum.leads),
      conversao_aprovado_venda: safe(sum.vendidos, sum.aprovados || 1),
      ticket_medio: safe(sum.valor, sum.vendidos || 1),
    };

    // Inadimplência proxy: boletos / valor bruto do período atual
    
    // se "gerou venda" veio zerado, mescla faturamentos
    if (!Number(fin.valor_liberado) && !Number(fin.entrada_paga)) {
      try {
        const fat = await queryOne(
          `SELECT
             COALESCE(SUM(COALESCE(fc.valor_liberado, (
               SELECT fb.valor_financiado FROM public.ficha_bancos fb
               WHERE fb.ficha_id = fc.id AND LOWER(COALESCE(fb.status,'')) LIKE 'aprov%' LIMIT 1
             ), 0)),0)::float AS valor_liberado,
             COALESCE(SUM(COALESCE(f.entrada_total, f.entrada_paga, 0)),0)::float AS entrada_paga,
             COALESCE(SUM(COALESCE(f.entrada_boleto, f.valor_pendente, 0)),0)::float AS valor_pendente,
             COALESCE(SUM(COALESCE(f.entrada_boleto, 0)),0)::float AS total_boletos
           FROM public.faturamentos f
           LEFT JOIN public.fichas_credito fc ON fc.id = f.ficha_id OR fc.lead_id = f.lead_id
           WHERE ($1::date IS NULL OR f.created_at::date >= $1::date)
             AND ($2::date IS NULL OR f.created_at::date < $2::date)`,
          [di, df],
        );
        if (fat) fin = { ...fin, ...fat };
      } catch { /* ok */ }
    }

    const valorLiberado = Number(fin.valor_liberado || 0);
    const entrada = Number(fin.entrada_paga || 0);
    const boletos = Number(fin.total_boletos || 0);
    const taxaInadimplenciaProxy = safe(boletos, valorLiberado + entrada + boletos);

    // Carroceria (estoque + vendas se houver campo)
    let porCarroceria: { carroceria: string; qtd: number; pct: number }[] = [];
    try {
      const r = await query(
        `SELECT
           LOWER(TRIM(COALESCE(NULLIF(carroceria,''), 'nao informado'))) AS carroceria,
           COUNT(*)::int AS qtd
         FROM public.estoque_carros
         GROUP BY 1
         ORDER BY qtd DESC
         LIMIT 12`,
      );
      const total = r.rows.reduce((s: number, x: any) => s + Number(x.qtd || 0), 0) || 1;
      porCarroceria = r.rows.map((x: any) => ({
        carroceria: String(x.carroceria),
        qtd: Number(x.qtd || 0),
        pct: Number(x.qtd || 0) / total,
      }));
    } catch {
      porCarroceria = [];
    }

    // --- Projeção: regressão defasada simples em vendas ---
    // Y_t = β0 + β1 * leads_{t-1} + β2 * leads_t + β3 * vendas_{t-1}
    const y: number[] = [];
    const X: number[][] = [];
    for (let t = 1; t < historico.length; t++) {
      y.push(historico[t].vendidos);
      X.push([1, historico[t - 1].leads, historico[t].leads, historico[t - 1].vendidos]);
    }
    let betas = ols(y, X);
    // fallback: média móvel + tendência
    if (!betas) {
      const n = historico.length;
      const avg = n ? historico.reduce((s, h) => s + h.vendidos, 0) / n : 0;
      const trend =
        n >= 2 ? (historico[n - 1].vendidos - historico[0].vendidos) / Math.max(1, n - 1) : 0;
      betas = [avg, 0, 0, 0];
      // inject trend into intercept for next steps
      betas[0] = avg + trend;
    }

    const last = historico[historico.length - 1] || {
      leads: 0,
      vendidos: 0,
      valor_bruto: 0,
    };
    const prev = historico[historico.length - 2] || last;

    // leads projetados: média últimos 3 + tendência
    const last3 = historico.slice(-3);
    const avgLeads = last3.length
      ? last3.reduce((s, h) => s + h.leads, 0) / last3.length
      : last.leads;
    const leadTrend =
      last3.length >= 2 ? (last3[last3.length - 1].leads - last3[0].leads) / (last3.length - 1) : 0;

    function projetarVendas(leadsAtual: number, leadsAnt: number, vendasAnt: number) {
      const v = betas![0] + betas![1] * leadsAnt + betas![2] * leadsAtual + betas![3] * vendasAnt;
      return Math.max(0, Math.round(v * 10) / 10);
    }

    const leadsM1 = Math.max(0, Math.round(avgLeads + leadTrend));
    const leadsM2 = Math.max(0, Math.round(avgLeads + leadTrend * 2));
    const vendasM1 = projetarVendas(leadsM1, last.leads, last.vendidos);
    const vendasM2 = projetarVendas(leadsM2, leadsM1, vendasM1);

    const ticket = taxas.ticket_medio || (last.vendidos ? last.valor_bruto / last.vendidos : 0);
    const projM1 = {
      mes: monthKey(addMonths(now, 1)),
      leads: leadsM1,
      vendidos: vendasM1,
      valor_bruto: Math.round(vendasM1 * ticket * 100) / 100,
      aprovados: Math.round(leadsM1 * taxas.aprovacao_credito * taxas.ficha),
      fichas: Math.round(leadsM1 * taxas.ficha),
    };
    const projM2 = {
      mes: monthKey(addMonths(now, 2)),
      leads: leadsM2,
      vendidos: vendasM2,
      valor_bruto: Math.round(vendasM2 * ticket * 100) / 100,
      aprovados: Math.round(leadsM2 * taxas.aprovacao_credito * taxas.ficha),
      fichas: Math.round(leadsM2 * taxas.ficha),
    };

    // Mix de carroceria na projeção de volume
    const mixProjecao = porCarroceria.map((c) => ({
      carroceria: c.carroceria,
      vendidos_mes1: Math.round(vendasM1 * c.pct * 10) / 10,
      vendidos_mes2: Math.round(vendasM2 * c.pct * 10) / 10,
      pct: Math.round(c.pct * 1000) / 10,
    }));


    // --- por loja ---
    let por_loja: any[] = [];
    try {
      let sqlLoja = `
        SELECT UPPER(COALESCE(v.loja,'381')) AS loja,
          COUNT(*)::int AS leads,
          COUNT(*) FILTER (WHERE COALESCE(l.respondeu,FALSE))::int AS responderam,
          COUNT(*) FILTER (WHERE COALESCE(l.gerou_ficha,FALSE))::int AS fichas,
          COUNT(*) FILTER (WHERE COALESCE(l.aprovado,FALSE))::int AS aprovados,
          COUNT(*) FILTER (WHERE COALESCE(l.venda_concluida,FALSE) OR l.data_venda IS NOT NULL)::int AS vendidos
        FROM public.leads l
        LEFT JOIN public.vendedores v ON v.id = l.vendedor_id
        WHERE ($1::date IS NULL OR COALESCE(l.data_lead, l.created_at)::date >= $1::date)`;
      const pLoja: unknown[] = [di];
      if (df) {
        pLoja.push(df);
        sqlLoja += ` AND COALESCE(l.data_lead, l.created_at)::date < $${pLoja.length}::date`;
      }
      if (u.empresa_id && tipo !== 'superadmin') {
        pLoja.push(u.empresa_id);
        sqlLoja += ` AND (l.vendedor_id IS NULL OR l.vendedor_id IN (SELECT id FROM public.vendedores WHERE empresa_id = $${pLoja.length}))`;
      }
      sqlLoja += ` GROUP BY 1 ORDER BY leads DESC`;
      por_loja = (await query(sqlLoja, pLoja)).rows;
    } catch {
      por_loja = [];
    }

    let alertas_vendedores: any[] = [];
    try {
      const r = await query(
        `SELECT v.nome, UPPER(COALESCE(v.loja,'381')) AS loja,
           COUNT(*)::int AS leads,
           COUNT(*) FILTER (WHERE COALESCE(l.venda_concluida,FALSE) OR l.data_venda IS NOT NULL)::int AS vendidos
         FROM public.leads l
         JOIN public.vendedores v ON v.id = l.vendedor_id
         WHERE ($1::date IS NULL OR COALESCE(l.data_lead,l.created_at)::date >= $1::date)
         GROUP BY v.id, v.nome, v.loja
         HAVING COUNT(*) >= 5`,
        [di],
      );
      const rows = r.rows.map((x: any) => ({
        nome: x.nome,
        loja: x.loja,
        leads: Number(x.leads),
        vendidos: Number(x.vendidos),
        conversao: Number(x.leads) > 0 ? Number(x.vendidos) / Number(x.leads) : 0,
      }));
      const avg = rows.length ? rows.reduce((s: number, x: any) => s + x.conversao, 0) / rows.length : 0;
      alertas_vendedores = rows
        .filter((x: any) => x.conversao < avg * 0.6)
        .map((x: any) => ({ ...x, media: avg, status: 'baixo_desempenho' }))
        .slice(0, 15);
    } catch {
      alertas_vendedores = [];
    }

    const avgConvLoja =
      por_loja.length > 0
        ? por_loja.reduce(
            (s: number, x: any) =>
              s + (Number(x.leads) > 0 ? Number(x.vendidos) / Number(x.leads) : 0),
            0,
          ) / por_loja.length
        : 0;
    const alertas_lojas = por_loja
      .map((x: any) => ({
        loja: x.loja,
        leads: Number(x.leads),
        vendidos: Number(x.vendidos),
        conversao: Number(x.leads) > 0 ? Number(x.vendidos) / Number(x.leads) : 0,
      }))
      .filter((x: any) => x.leads >= 8 && x.conversao < avgConvLoja * 0.7)
      .map((x: any) => ({ ...x, status: 'loja_abaixo_media' }));

    const nivel =
      plano === 'vanguard' ? 'vanguard' : plano === 'command' ? 'command' : 'black';

    return NextResponse.json({
      plano: nivel,
      loja_filtro: lojaParam || 'geral',
      funil: {
        leads: row?.leads ?? 0,
        responderam: row?.responderam ?? 0,
        fichas: row?.fichas ?? 0,
        aprovados: row?.aprovados ?? 0,
        vendidos: row?.vendidos ?? 0,
      },
      por_banco: porBanco,
      financeiro: {
        // regra: valor bruto = entrada paga + valor liberado
        valor_bruto: valorLiberado + entrada,
        valor_liberado: valorLiberado,
        entrada_paga: entrada,
        total_boletos: boletos,
        valor_pendente: Number(fin.valor_pendente || 0),
        clientes_com_boleto: Number(fin.clientes_com_boleto || 0),
        gasto_oficina,
        gasto: gasto_oficina, // + campos futuros
        vendas: Number(fin.vendas || 0),
      },
      taxas: {
        ...taxas,
        taxa_liberacao_credito: taxas.aprovacao_credito,
        taxa_inadimplencia_proxy: taxaInadimplenciaProxy,
      },
      historico_mensal: historico,
      projecao: {
        modelo: 'regressao_linear_multipla_defasada',
        formula: 'Y_t = β0 + β1·leads_{t-1} + β2·leads_t + β3·vendas_{t-1}',
        betas: {
          beta0: betas[0],
          beta1_leads_ant: betas[1],
          beta2_leads_atual: betas[2],
          beta3_vendas_ant: betas[3],
        },
        mes_1: projM1,
        mes_2: projM2,
        mix_carroceria: mixProjecao,
      },
      por_carroceria: porCarroceria,
      por_loja,
      alertas_vendedores: nivel === 'command' ? alertas_vendedores : nivel === 'black' ? [] : [],
      alertas_lojas: nivel === 'black' || nivel === 'command' ? alertas_lojas : [],
      // Vanguard: frontend ignora financeiro avançado / projeção
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
