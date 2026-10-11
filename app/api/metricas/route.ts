import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  try {
    const now = new Date();
    const di = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const params: unknown[] = [di];
    let scope = '';
    if (u.tipo === 'vendedor' && u.vendedor_id) {
      params.push(u.vendedor_id);
      scope = ` AND vendedor_id = $${params.length}`;
    } else if (u.tipo === 'gerente' && u.loja) {
      params.push(u.loja);
      scope = ` AND vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length}))`;
    }

    let row: any = { leads: 0, responderam: 0, fichas: 0, aprovados: 0, vendidos: 0 };
    try {
      row = await queryOne<any>(
        `
        SELECT
          COUNT(*)::int AS leads,
          COUNT(*) FILTER (WHERE COALESCE(respondeu,FALSE))::int AS responderam,
          COUNT(*) FILTER (WHERE COALESCE(gerou_ficha,FALSE))::int AS fichas,
          COUNT(*) FILTER (WHERE COALESCE(aprovado,FALSE))::int AS aprovados,
          COUNT(*) FILTER (WHERE COALESCE(venda_concluida,FALSE) OR data_venda IS NOT NULL)::int AS vendidos
        FROM public.leads
        WHERE data_lead >= $1::date
        ${scope}
        `,
        params,
      );
    } catch {
      try {
        row = await queryOne<any>(
          `SELECT
             COUNT(*)::int AS leads,
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
         GROUP BY 1
         ORDER BY 1
         LIMIT 20`,
      );
      porBanco = r.rows;
    } catch {
      porBanco = [];
    }

    let fin: any = {};
    try {
      fin = (await queryOne(
        `SELECT
           COALESCE(SUM(valor_financiado),0)::float AS valor_liberado,
           COALESCE(SUM(valor_entrada),0)::float AS entrada_paga,
           COALESCE(SUM(COALESCE(boleto_valor,0)),0)::float AS total_boletos,
           COALESCE(SUM(COALESCE(valor_pendente,0)),0)::float AS valor_pendente,
           COUNT(*) FILTER (WHERE COALESCE(gerou_boleto,FALSE))::int AS clientes_com_boleto
         FROM public.fichas_credito`,
      )) || {};
    } catch {
      fin = {};
    }

    const valorLiberado = Number(fin.valor_liberado || 0);
    const entrada = Number(fin.entrada_paga || 0);

    return NextResponse.json({
      funil: {
        leads: row?.leads ?? 0,
        responderam: row?.responderam ?? 0,
        fichas: row?.fichas ?? 0,
        aprovados: row?.aprovados ?? 0,
        vendidos: row?.vendidos ?? 0,
      },
      por_banco: porBanco,
      financeiro: {
        valor_bruto: valorLiberado + entrada,
        valor_liberado: valorLiberado,
        entrada_paga: entrada,
        total_boletos: Number(fin.total_boletos || 0),
        valor_pendente: Number(fin.valor_pendente || 0),
        clientes_com_boleto: Number(fin.clientes_com_boleto || 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
