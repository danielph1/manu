import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes } from '@/lib/integracoes/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function has(...keys: string[]) {
  return keys.some((k) => Boolean(String(process.env[k] || '').trim()));
}

function resolveAppUrl(req: NextRequest): string {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (env) return env.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return '';
}

/** Só booleanos — nunca devolve secret */
export async function GET(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const rawId = String(
    process.env.META_APP_ID ||
      process.env.FACEBOOK_APP_ID ||
      process.env.NEXT_PUBLIC_META_APP_ID ||
      '',
  )
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^["']|["']$/g, '');
  const appIdValid = /^\d{6,20}$/.test(rawId);
  const appId = has('META_APP_ID', 'FACEBOOK_APP_ID', 'NEXT_PUBLIC_META_APP_ID');
  const app_id_preview = rawId
    ? `${rawId.slice(0, 4)}…${rawId.slice(-4)} (len=${rawId.length}, valid=${appIdValid})`
    : '(vazio)';
  const appSecret = has('META_APP_SECRET', 'FACEBOOK_APP_SECRET');
  const configId = has('NEXT_PUBLIC_META_CONFIG_ID', 'NEXT_PUBLIC_WHATSAPP_CONFIG_ID');
  const publicAppId = has('NEXT_PUBLIC_META_APP_ID', 'NEXT_PUBLIC_FACEBOOK_APP_ID');
  const base = resolveAppUrl(req);
  const redirect = base ? `${base}/api/integracoes/oauth/meta/callback` : '';

  const oauthOk = appId && appSecret && Boolean(base);
  const embeddedOk = publicAppId && configId && appSecret;

  return NextResponse.json({
    code_version: 'v133-meta-diag',
    oauth_facebook_pages: {
      app_id_preview,
      pronto: oauthOk,
      META_APP_ID_or_equiv: appId,
      META_APP_SECRET: appSecret,
      app_url: Boolean(base),
      redirect_uri_esperado: redirect || null,
      dica: !oauthOk
        ? 'Falta App ID, App Secret ou URL do app. Salve env em Production e Redeploy.'
        : `Cadastre este redirect na Meta: ${redirect}`,
    },
    embedded_signup: {
      pronto: embeddedOk,
      NEXT_PUBLIC_META_APP_ID: publicAppId,
      NEXT_PUBLIC_META_CONFIG_ID: configId,
      META_APP_SECRET: appSecret,
      dica: !embeddedOk
        ? 'Embedded precisa de NEXT_PUBLIC_META_APP_ID + NEXT_PUBLIC_META_CONFIG_ID (build) e META_APP_SECRET (runtime). Redeploy após criar NEXT_PUBLIC_*.'
        : 'Embedded Signup deve abrir o popup da Meta.',
    },
  });
}
