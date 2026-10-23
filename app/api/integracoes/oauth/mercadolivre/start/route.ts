import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { randomBytes, createHmac } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function env(...keys: string[]) {
  for (const k of keys) {
    const v = String(process.env[k] || '').trim();
    if (v) return v;
  }
  return '';
}

export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 });

  const clientId = env('ML_APP_ID', 'MERCADOLIVRE_APP_ID', 'NEXT_PUBLIC_ML_APP_ID');
  const secret = env('ML_APP_SECRET', 'MERCADOLIVRE_APP_SECRET');
  const appUrl = env('NEXT_PUBLIC_APP_URL') || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  if (!clientId || !secret || !appUrl) {
    return NextResponse.json(
      {
        error: 'ml_nao_configurado',
        message:
          'Configure no Vercel (app Aurox, uma vez): ML_APP_ID, ML_APP_SECRET, NEXT_PUBLIC_APP_URL. A loja só faz login ML.',
      },
      { status: 503 },
    );
  }

  const statePayload = JSON.stringify({ e: empresaId, u: actor.id, n: randomBytes(6).toString('hex'), t: Date.now() });
  const sig = createHmac('sha256', secret).update(statePayload).digest('hex').slice(0, 12);
  const state = Buffer.from(statePayload).toString('base64url') + '.' + sig;
  const redirect = `${appUrl.replace(/\/$/, '')}/api/integracoes/oauth/mercadolivre/callback`;

  const authUrl =
    `https://auth.mercadolivre.com.br/authorization?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.json({ auth_url: authUrl, redirect_uri: redirect });
}
