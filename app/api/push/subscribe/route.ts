import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

/** Salva inscrição Web Push do dispositivo */
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  try {
    const b = await req.json();
    const endpoint = String(b.endpoint || '');
    const p256dh = String(b.keys?.p256dh || b.p256dh || '');
    const auth = String(b.keys?.auth || b.auth || '');
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'subscription inválida' }, { status: 400 });
    }

    // upsert por endpoint
    const existing = await queryOne(
      `SELECT id FROM public.push_subscriptions WHERE endpoint = $1 LIMIT 1`,
      [endpoint],
    );
    if (existing?.id) {
      await query(
        `UPDATE public.push_subscriptions
         SET usuario_id = $1, p256dh = $2, auth = $3, ativo = TRUE, updated_at = now()
         WHERE id = $4`,
        [u.id, p256dh, auth, existing.id],
      );
    } else {
      await query(
        `INSERT INTO public.push_subscriptions (usuario_id, endpoint, p256dh, auth, ativo)
         VALUES ($1,$2,$3,$4,TRUE)`,
        [u.id, endpoint, p256dh, auth],
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
