import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    const row = await queryOne(`SELECT * FROM public.faturamentos WHERE id = $1`, [id]);
    if (!row) return NextResponse.json({ error: 'não encontrado' }, { status: 404 });
    // valor financiado nunca vai pro faturamento nem pro vendedor
    delete (row as any).valor_financiado;
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
