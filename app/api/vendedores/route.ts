import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const params: unknown[] = [];
    let where = `COALESCE(ativo, TRUE) = TRUE AND LOWER(nome) <> 'matheus'`;
    if (u.tipo === 'gerente' && u.loja) {
      params.push(u.loja);
      where += ` AND UPPER(COALESCE(loja,'381')) = UPPER($1)`;
    }
    const { rows } = await query(
      `SELECT DISTINCT ON (LOWER(nome)) id, nome, loja, COALESCE(ativo, TRUE) AS ativo
       FROM public.vendedores
       WHERE ${where}
       ORDER BY LOWER(nome), CASE WHEN nome = LOWER(nome) THEN 0 ELSE 1 END, id`,
      params,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
