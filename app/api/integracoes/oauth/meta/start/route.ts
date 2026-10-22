import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { queryOne } from '@/lib/db';
import { randomBytes, createHmac } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Inicia OAuth Meta (Facebook Login → páginas).
 * Env: META_APP_ID, META_APP_SECRET, NEXT_PUBLIC_APP_URL
 */
export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 });

  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '').replace(/\/$/, '');
  const base = appUrl.startsWith('http') ? appUrl : appUrl ? `https://${appUrl}` : '';

  if (!appId || !appSecret || !base) {
    return NextResponse.json(
      {
        error: 'oauth_nao_configurado',
        message:
          'Configure META_APP_ID, META_APP_SECRET e NEXT_PUBLIC_APP_URL no servidor Aurox (uma vez). O cliente da loja não precisa disso.',
      },
      { status: 503 },
    );
  }

  const statePayload = JSON.stringify({
    e: empresaId,
    u: actor.id,
    n: randomBytes(8).toString('hex'),
    t: Date.now(),
  });
  const sig = createHmac('sha256', appSecret).update(statePayload).digest('hex').slice(0, 16);
  const state = Buffer.from(statePayload).toString('base64url') + '.' + sig;

  await queryOne(
    `INSERT INTO public.manu_conexoes_oauth (empresa_id, provedor, status, label, criado_por, meta)
     VALUES ($1,'meta_facebook','pendente','Facebook / Instagram (autorizando…)',$2,$3::jsonb)
     RETURNING id`,
    [empresaId, actor.id, JSON.stringify({ state_n: JSON.parse(statePayload).n })],
  );

  const redirectUri = `${base}/api/integracoes/oauth/meta/callback`;
  const scope = [
    'pages_show_list',
    'pages_messaging',
    'pages_manage_metadata',
    'instagram_basic',
    'instagram_manage_messages',
    'business_management',
    'leads_retrieval',
  ].join(',');

  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code`;

  return NextResponse.json({ auth_url: authUrl, redirect_uri: redirectUri });
}
