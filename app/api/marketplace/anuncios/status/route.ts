import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

/** Marca anúncios como selecionado | descartado | novo */
export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || String(u.tipo).toLowerCase() !== 'superadmin') {
    return NextResponse.json({ error: 'somente superadmin' }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter((n: number) => n > 0) : [];
  const status = String(b.status || '');
  if (!ids.length || !['novo', 'selecionado', 'descartado'].includes(status)) {
    return NextResponse.json({ error: 'ids[] e status inválidos' }, { status: 400 });
  }
  await query(
    `UPDATE public.marketplace_anuncios SET status=$2
      WHERE id = ANY($1::bigint[]) AND status <> 'distribuido'`,
    [ids, status],
  );
  return NextResponse.json({ ok: true });
}
