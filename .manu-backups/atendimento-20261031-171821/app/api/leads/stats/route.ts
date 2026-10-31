import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

function bounds(periodo: string | null): { di: string | null; df: string | null } {
  const p = (periodo || 'mes').toLowerCase();
  if (p === 'todas' || p === 'todo' || p === 'all') return { di: null, df: null };
  const now = new Date();
  if (p === 'hoje') return { di: now.toISOString().slice(0, 10), df: null };
  if (p === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { di: d.toISOString().slice(0, 10), df: null };
  }
  if (p === 'mes_passado') {
    return {
      di: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10),
      df: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    };
  }
  return { di: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), df: null };
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const periodo = new URL(req.url).searchParams.get('periodo');
    const { di, df } = bounds(periodo);
    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    if (di) {
      params.push(di);
      where.push(`COALESCE(l.data_lead, l.created_at)::date >= $${params.length}::date`);
      if (df) {
        params.push(df);
        where.push(`COALESCE(l.data_lead, l.created_at)::date < $${params.length}::date`);
      }
    }
    if (u.tipo === 'vendedor' && u.vendedor_id) {
      params.push(u.vendedor_id);
      where.push(`l.vendedor_id = $${params.length}`);
    } else if (u.tipo === 'gerente' && u.loja) {
      params.push(u.loja);
      where.push(`l.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length}))`);
    }
    let row: any = null;
    try {
      row = await queryOne<any>(
        `SELECT
           COUNT(*)::int AS total_leads,
           COUNT(*) FILTER (WHERE COALESCE(l.respondeu, FALSE))::int AS total_responderam,
           COUNT(*) FILTER (WHERE COALESCE(l.gerou_ficha, FALSE))::int AS total_fichas,
           COUNT(*) FILTER (WHERE COALESCE(l.aprovado, FALSE))::int AS total_aprovados,
           COUNT(*) FILTER (WHERE COALESCE(l.venda_concluida, FALSE) = TRUE OR l.data_venda IS NOT NULL)::int AS total_vendidos
         FROM public.leads l
         WHERE ${where.join(' AND ')}`,
        params,
      );
    } catch {
      const w2 = where.join(' AND ').replace('COALESCE(l.data_lead, l.created_at)', 'l.data_lead');
      row = await queryOne<any>(
        `SELECT
           COUNT(*)::int AS total_leads,
           COUNT(*) FILTER (WHERE COALESCE(l.respondeu, FALSE))::int AS total_responderam,
           COUNT(*) FILTER (WHERE COALESCE(l.gerou_ficha, FALSE))::int AS total_fichas,
           COUNT(*) FILTER (WHERE COALESCE(l.aprovado, FALSE))::int AS total_aprovados,
           COUNT(*) FILTER (WHERE COALESCE(l.venda_concluida, FALSE) = TRUE OR l.data_venda IS NOT NULL)::int AS total_vendidos
         FROM public.leads l
         WHERE ${w2}`,
        params,
      );
    }
    return NextResponse.json({
      total_leads: row?.total_leads ?? 0,
      total_responderam: row?.total_responderam ?? 0,
      total_fichas: row?.total_fichas ?? 0,
      total_aprovados: row?.total_aprovados ?? 0,
      total_vendidos: row?.total_vendidos ?? 0,
      total: row?.total_leads ?? 0,
      responderam: row?.total_responderam ?? 0,
      fichas: row?.total_fichas ?? 0,
      aprovados: row?.total_aprovados ?? 0,
      vendidos: row?.total_vendidos ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
