import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { queryOne } from '@/lib/db';
import { randomBytes, createHmac } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanAppId(raw: string): string {
  const s = String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!/^\d{6,20}$/.test(s)) return '';
  return s;
}

function env(...keys: string[]) {
  for (const k of keys) {
    const v = String(process.env[k] || '').trim();
    if (v) return v;
  }
  return '';
}

function resolveAppUrl(req: NextRequest): string {
  const fromEnv =
    env('NEXT_PUBLIC_APP_URL', 'APP_URL') ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return '';
}

export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 });

  const appId = cleanAppId(env('META_APP_ID', 'FACEBOOK_APP_ID', 'NEXT_PUBLIC_META_APP_ID'));
  const appSecret = env('META_APP_SECRET', 'FACEBOOK_APP_SECRET');
  const base = resolveAppUrl(req);

  const missing: string[] = [];
  if (!appId) missing.push('META_APP_ID (só números, sem aspas — copie em Configurações → Básico do app Meta)');
  if (!appSecret) missing.push('META_APP_SECRET');
  if (!base) missing.push('NEXT_PUBLIC_APP_URL');

  if (missing.length) {
    return NextResponse.json(
      {
        error: 'oauth_nao_configurado',
        message: `OAuth Meta incompleto no Vercel. Faltando: ${missing.join(', ')}. Env em Production + Redeploy.`,
        missing,
        code_version: 'v133',
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

  try {
    await queryOne(
      `INSERT INTO public.manu_conexoes_oauth (empresa_id, provedor, status, label, criado_por, meta)
       VALUES ($1,'meta_facebook','pendente','Facebook / Instagram (autorizando…)',$2,$3::jsonb)
       RETURNING id`,
      [empresaId, actor.id, JSON.stringify({ state_n: JSON.parse(statePayload).n })],
    );
  } catch (e) {
    console.error('oauth pending insert', e);
    // continua mesmo se tabela oauth falhar — o callback grava de novo
  }

  const redirectUri = `${base}/api/integracoes/oauth/meta/callback`;
  // Escopos em camadas: o mínimo funciona em modo desenvolvimento (admin/dev/tester do app).
  // Permissões avançadas exigem produto ativo no app + (produção) App Review.
  const scope = [
    // App tipo Negócio/Páginas: NÃO pedir email/public_profile (gera Invalid Scopes)
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_messaging',
    'instagram_basic',
    'instagram_manage_messages',
    'pages_read_user_content',
  ].join(',');

  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code`;

  return NextResponse.json({
    auth_url: authUrl,
    redirect_uri: redirectUri,
    code_version: 'v133',
  });
}
