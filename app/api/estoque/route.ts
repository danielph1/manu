import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const busca = (new URL(req.url).searchParams.get('busca') || '').trim();
    const params: unknown[] = [];
    let where = '1=1';
    if (busca) {
      params.push(`%${busca}%`);
      const p = `$${params.length}`;
      where = `(marca ILIKE ${p} OR modelo ILIKE ${p} OR placa ILIKE ${p} OR COALESCE(carro,'') ILIKE ${p} OR COALESCE(cor,'') ILIKE ${p})`;
    }
    const { rows } = await query(
      `SELECT * FROM public.estoque_carros WHERE ${where} ORDER BY id DESC LIMIT 200`,
      params,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
