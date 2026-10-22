import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { createHmac } from 'node:crypto';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Callback OAuth Meta — troca code por token, lista páginas, salva Page Access Token */
export async function GET(req: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '').replace(/\/$/, '');
  const base = appUrl.startsWith('http') ? appUrl : appUrl ? `https://${appUrl}` : 'https://manu-manu-automoveis.vercel.app';
  const fail = (msg: string) => NextResponse.redirect(`${base}/integracoes?oauth_error=${encodeURIComponent(msg)}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateRaw = url.searchParams.get('state');
    const err = url.searchParams.get('error');
    if (err) return fail(err);
    if (!code || !stateRaw) return fail('codigo_ausente');

    const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
    if (!appId || !appSecret) return fail('oauth_nao_configurado');

    const [payloadB64, sig] = stateRaw.split('.');
    if (!payloadB64 || !sig) return fail('state_invalido');
    const statePayload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const expect = createHmac('sha256', appSecret).update(statePayload).digest('hex').slice(0, 16);
    if (expect !== sig) return fail('state_assinatura');
    const st = JSON.parse(statePayload) as { e: number; u: number; n: string; t: number };
    if (Date.now() - st.t > 20 * 60 * 1000) return fail('state_expirado');

    const redirectUri = `${base}/api/integracoes/oauth/meta/callback`;
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${appSecret}&code=${encodeURIComponent(code)}`,
    );
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) return fail('token_falhou');

    // Long-lived user token
    const ll = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenJson.access_token}`,
    );
    const llJson = await ll.json();
    const userToken = llJson.access_token || tokenJson.access_token;

    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(userToken)}`,
    );
    const pagesJson = await pagesRes.json();
    const pages: any[] = pagesJson.data || [];
    if (!pages.length) return fail('nenhuma_pagina');

    // Usa a primeira página (UI futura: seletor). Token da PÁGINA, não do perfil pessoal.
    const page = pages[0];
    const pageToken = page.access_token;
    const pageId = String(page.id);
    const pageName = String(page.name || 'Página');

    // Cria integração webhook inbound ligada à empresa + salva OAuth
    const token = gerarToken();
    const integId = randomUUID();
    let webhook_url = '';
    try {
      webhook_url = urlWebhook(integId, token);
    } catch {
      webhook_url = '';
    }

    await queryOne(
      `INSERT INTO public.manu_integracoes (id, empresa_id, nome, plataforma, token_hash, mapeamento, criado_por)
       VALUES ($1,$2,$3,'facebook',$4,$5::jsonb,$6) RETURNING id`,
      [
        integId,
        st.e,
        `Meta · ${pageName}`,
        hashToken(token),
        JSON.stringify({
          nome: 'name',
          telefone: 'phone',
          email: 'email',
          interesse: 'interest',
          mensagem: 'message',
          id_externo: 'externalId',
        }),
        st.u,
      ],
    );

    await query(
      `UPDATE public.manu_conexoes_oauth SET status='revogado', atualizado_em=now()
        WHERE empresa_id=$1 AND provedor IN ('meta_facebook','meta_instagram') AND status='conectado'`,
      [st.e],
    );

    await queryOne(
      `INSERT INTO public.manu_conexoes_oauth
        (empresa_id, provedor, status, label, external_id, access_token_enc, meta, integracao_id, criado_por)
       VALUES ($1,'meta_facebook','conectado',$2,$3,$4,$5::jsonb,$6,$7)
       ON CONFLICT (empresa_id, provedor, external_id) DO UPDATE SET
         status='conectado', access_token_enc=EXCLUDED.access_token_enc,
         label=EXCLUDED.label, meta=EXCLUDED.meta, integracao_id=EXCLUDED.integracao_id,
         atualizado_em=now()
       RETURNING id`,
      [
        st.e,
        pageName,
        pageId,
        pageToken, // em produção: cifrar com KMS; por ora só backend
        JSON.stringify({
          pages: pages.map((p: any) => ({ id: p.id, name: p.name })),
          webhook_url,
          note: 'Page Access Token — perfil pessoal não é armazenado como token operacional',
        }),
        integId,
        st.u,
      ],
    );

    return NextResponse.redirect(
      `${base}/integracoes?oauth=ok&page=${encodeURIComponent(pageName)}`,
    );
  } catch (e) {
    console.error('meta callback', e);
    return fail('erro_interno');
  }
}
