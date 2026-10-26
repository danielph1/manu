import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { createHmac, randomUUID } from 'node:crypto';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function appBase() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://manu-manu-automoveis.vercel.app';
  const base = appUrl.replace(/\/$/, '');
  return base.startsWith('http') ? base : `https://${base}`;
}

export async function GET(req: NextRequest) {
  const base = appBase();
  const fail = (msg: string) =>
    NextResponse.redirect(`${base}/integracoes?oauth_error=${encodeURIComponent(msg.slice(0, 180))}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateRaw = url.searchParams.get('state');
    const err = url.searchParams.get('error');
    const errDesc = url.searchParams.get('error_description');
    if (err) return fail(`${err}${errDesc ? ':' + errDesc : ''}`);
    if (!code || !stateRaw) return fail('codigo_ausente');

    const appId = String(process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '').trim();
    const appSecret = String(process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '').trim();
    if (!appId || !appSecret) return fail('oauth_nao_configurado');

    const [payloadB64, sig] = stateRaw.split('.');
    if (!payloadB64 || !sig) return fail('state_invalido');
    let statePayload = '';
    try {
      statePayload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    } catch {
      return fail('state_decode');
    }
    const expect = createHmac('sha256', appSecret).update(statePayload).digest('hex').slice(0, 16);
    if (expect !== sig) return fail('state_assinatura');

    let st: { e: number; u: number; t: number };
    try {
      st = JSON.parse(statePayload);
    } catch {
      return fail('state_json');
    }
    if (Date.now() - Number(st.t || 0) > 20 * 60 * 1000) return fail('state_expirado');

    const redirectUri = `${base}/api/integracoes/oauth/meta/callback`;
    const tokenRes = await fetch(
      'https://graph.facebook.com/v21.0/oauth/access_token?client_id=' +
        encodeURIComponent(appId) +
        '&redirect_uri=' +
        encodeURIComponent(redirectUri) +
        '&client_secret=' +
        encodeURIComponent(appSecret) +
        '&code=' +
        encodeURIComponent(code),
    );
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      return fail('token_falhou:' + (tokenJson.error?.message || tokenJson.error_message || tokenRes.status));
    }

    const ll = await fetch(
      'https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token' +
        '&client_id=' +
        encodeURIComponent(appId) +
        '&client_secret=' +
        encodeURIComponent(appSecret) +
        '&fb_exchange_token=' +
        encodeURIComponent(tokenJson.access_token),
    );
    const llJson = await ll.json();
    const userToken = llJson.access_token || tokenJson.access_token;

    const pagesRes = await fetch(
      'https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=' +
        encodeURIComponent(userToken),
    );
    const pagesJson = await pagesRes.json();
    const pages: any[] = pagesJson.data || [];
    if (!pages.length) {
      return fail('nenhuma_pagina:selecione a Pagina no login Meta ou crie uma Pagina');
    }

    const page = pages[0];
    const pageToken = page.access_token;
    const pageId = String(page.id);
    const pageName = String(page.name || 'Pagina');

    const token = gerarToken();
    const integId = randomUUID();
    let webhook_url = '';
    try {
      webhook_url = urlWebhook(integId, token);
    } catch {
      webhook_url = '';
    }

    // integracao_id só se a linha existir de verdade (evita FK)
    let integracaoId: string | null = null;
    try {
      await query(
        `INSERT INTO public.manu_integracoes (id, empresa_id, nome, plataforma, token_hash, mapeamento, criado_por)
         VALUES ($1,$2,$3,'facebook',$4,$5::jsonb,$6)`,
        [
          integId,
          st.e,
          'Meta · ' + pageName,
          hashToken(token),
          JSON.stringify({
            nome: 'name',
            telefone: 'phone',
            email: 'email',
            interesse: 'interest',
            mensagem: 'message',
            id_externo: 'externalId',
            page_id: pageId,
          }),
          st.u,
        ],
      );
      integracaoId = integId;
    } catch (e: any) {
      console.error('integracao insert', e?.message);
      integracaoId = null;
    }

    try {
      await query(
        `UPDATE public.manu_conexoes_oauth SET status='revogado', atualizado_em=now()
          WHERE empresa_id=$1 AND provedor IN ('meta_facebook','meta_instagram') AND status='conectado'`,
        [st.e],
      );
    } catch {
      /* ok */
    }

    try {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM public.manu_conexoes_oauth
          WHERE empresa_id=$1 AND provedor='meta_facebook' AND external_id=$2 LIMIT 1`,
        [st.e, pageId],
      );
      const meta = JSON.stringify({
        pages: pages.map((p: any) => ({ id: p.id, name: p.name })),
        webhook_url,
        page_id: pageId,
        note: 'Page Access Token',
      });
      if (existing?.id) {
        await query(
          `UPDATE public.manu_conexoes_oauth SET
             status='conectado', access_token_enc=$2, label=$3, meta=$4::jsonb,
             integracao_id=$5, atualizado_em=now()
           WHERE id=$1`,
          [existing.id, pageToken, pageName, meta, integracaoId],
        );
      } else {
        await query(
          `INSERT INTO public.manu_conexoes_oauth
            (empresa_id, provedor, status, label, external_id, access_token_enc, meta, integracao_id, criado_por)
           VALUES ($1,'meta_facebook','conectado',$2,$3,$4,$5::jsonb,$6,$7)`,
          [st.e, pageName, pageId, pageToken, meta, integracaoId, st.u],
        );
      }
    } catch (e: any) {
      console.error('oauth save', e);
      // último recurso: sem integracao_id
      try {
        await query(
          `INSERT INTO public.manu_conexoes_oauth
            (empresa_id, provedor, status, label, external_id, access_token_enc, meta, criado_por)
           VALUES ($1,'meta_facebook','conectado',$2,$3,$4,$5::jsonb,$6)`,
          [
            st.e,
            pageName,
            pageId,
            pageToken,
            JSON.stringify({ page_id: pageId, pages: pages.map((p: any) => ({ id: p.id, name: p.name })) }),
            st.u,
          ],
        );
      } catch (e2: any) {
        return fail('db:' + String(e2?.message || e?.message || e).slice(0, 120));
      }
    }

    return NextResponse.redirect(base + '/integracoes?oauth=ok&page=' + encodeURIComponent(pageName));
  } catch (e: any) {
    console.error('meta callback', e);
    return fail('erro_interno:' + String(e?.message || e).slice(0, 100));
  }
}
