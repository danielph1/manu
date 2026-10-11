import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const { rows } = await query(
      `SELECT p.*, f.lead_id, l.nome_lead
       FROM public.processos_transferencia p
       LEFT JOIN public.fichas_credito f ON f.id = p.ficha_id
       LEFT JOIN public.leads l ON l.id = f.lead_id
       ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
       LIMIT 150`,
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
