import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isSuperAdmin, isGerenteLoja } from '@/lib/tenant';

export const runtime = 'nodejs';

function rank(n: number) {
  if (n >= 20) return 'platina';
  if (n >= 10) return 'ouro';
  if (n >= 5) return 'prata';
  return 'bronze';
}

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const params: unknown[] = [];
  let extra = '';
  if (!isSuperAdmin(u) && u.empresa_id) {
    params.push(u.empresa_id);
    extra += ` AND v.empresa_id = $${params.length}`;
  }
  if (isGerenteLoja(u) && u.loja) {
    params.push(String(u.loja).toUpperCase());
    extra += ` AND UPPER(COALESCE(v.loja,'381')) = UPPER($${params.length})`;
  }
  const { rows } = await query(
    `SELECT v.id, v.nome, v.loja,
            COUNT(l.id) FILTER (WHERE COALESCE(l.venda_concluida,FALSE) OR l.data_venda IS NOT NULL)::int AS vendas
     FROM public.vendedores v
     LEFT JOIN public.leads l ON l.vendedor_id = v.id
     WHERE LOWER(COALESCE(v.nome,'')) <> 'matheus' ${extra}
     GROUP BY v.id, v.nome, v.loja
     ORDER BY vendas DESC, v.nome`,
    params,
  );
  return NextResponse.json(rows.map((r: any) => ({ ...r, rank: rank(Number(r.vendas || 0)) })));
}
