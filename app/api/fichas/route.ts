import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

function periodoBounds(p: string): { di: string | null; df: string | null } {
  const now = new Date();
  if (p === 'todas' || p === 'all') return { di: null, df: null };
  if (p === 'mes' || p === 'este_mes') {
    const di = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { di, df: null };
  }
  if (p === 'mes_passado') {
    const di = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const df = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { di, df };
  }
  return { di: null, df: null };
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const periodo = new URL(req.url).searchParams.get('periodo') || 'todas';
  const { di, df } = periodoBounds(periodo);
  const params: unknown[] = [];
  const where: string[] = ['1=1'];

  if (u.tipo === 'vendedor' && u.vendedor_id) {
    params.push(u.vendedor_id);
    where.push(`f.vendedor_id = $${params.length}`);
  } else if (u.tipo === 'gerente' && u.loja) {
    params.push(u.loja);
    where.push(`f.vendedor_id IN (SELECT id FROM public.vendedores WHERE UPPER(COALESCE(loja,'381')) = UPPER($${params.length}))`);
  }

  const base = `
    SELECT
      f.*,
      l.nome_lead AS lead_nome,
      l.telefone,
      l.cpf,
      COALESCE(l.cliente_na_loja, FALSE) AS em_loja,
      COALESCE(f.comprou, l.venda_concluida, FALSE) AS comprou,
      v.nome AS vendedor_nome
    FROM public.fichas_credito f
    LEFT JOIN public.leads l ON l.id = f.lead_id
    LEFT JOIN public.vendedores v ON v.id = f.vendedor_id
    WHERE ${where.join(' AND ')} ${busca ? `AND (COALESCE(l.nome_lead,'') ILIKE $${params.length+1} OR COALESCE(l.nome_completo,'') ILIKE $${params.length+1} OR COALESCE(l.cpf,'') ILIKE $${params.length+1} OR COALESCE(l.telefone,'') ILIKE $${params.length+1} OR COALESCE(v.nome,'') ILIKE $${params.length+1} OR COALESCE(f.banco_contratado,'') ILIKE $${params.length+1})` : ''}
  `;

  if (busca) params.push(`%${busca}%`);
  async function run(dateSql: string) {
    const p = [...params];
    let sql = base;
    if (dateSql) sql += ' AND ' + dateSql;
    sql += `
      ORDER BY
        COALESCE(l.cliente_na_loja, FALSE) DESC,
        CASE WHEN LOWER(COALESCE(f.status_geral,'')) IN ('aprovada','negada','reprovada','aprovado','negado','recusada','concluido','concluído') THEN 1 ELSE 0 END ASC,
        f.id DESC
      LIMIT 500`;
    return query(sql, p);
  }

  try {
    let dateSql = '';
    if (di) {
      params.push(di);
      dateSql = `COALESCE(f.data_compra, l.data_lead)::date >= $${params.length}::date`;
      if (df) {
        params.push(df);
        dateSql += ` AND COALESCE(f.data_compra, l.data_lead)::date < $${params.length}::date`;
      }
    }
    const { rows } = await run(dateSql);
    return NextResponse.json(rows);
  } catch (e: any) {
    try {
      const { rows } = await run('');
      return NextResponse.json(rows);
    } catch (e2: any) {
      return NextResponse.json({ error: e2?.message || e?.message }, { status: 500 });
    }
  }
}
