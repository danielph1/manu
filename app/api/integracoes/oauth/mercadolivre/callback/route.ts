import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { createHmac, randomUUID } from 'node:crypto';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') || 'https://manu-manu-automoveis.vercel.app';
  const fail = (m: string) => NextResponse.redirect(`${appUrl}/integracoes?oauth_error=${encodeURIComponent(m)}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateRaw = url.searchParams.get('state');
    if (!code || !stateRaw) return fail('codigo_ausente');

    const clientId = process.env.ML_APP_ID || process.env.MERCADOLIVRE_APP_ID || '';
    const secret = process.env.ML_APP_SECRET || process.env.MERCADOLIVRE_APP_SECRET || '';
    if (!clientId || !secret) return fail('ml_nao_configurado');

    const [b64, sig] = stateRaw.split('.');
    const payload = Buffer.from(b64, 'base64url').toString('utf8');
    const expect = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 12);
    if (sig !== expect) return fail('state_invalido');
    const st = JSON.parse(payload) as { e: number; u: number; t: number };
    if (Date.now() - st.t > 20 * 60 * 1000) return fail('state_expirado');

    const redirect = `${appUrl}/api/integracoes/oauth/mercadolivre/callback`;
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: secret,
        code,
        redirect_uri: redirect,
      }),
    });
    const tj = await tokenRes.json();
    if (!tj.access_token) return fail(tj.message || 'token_falhou');

    const integId = randomUUID();
    const hookToken = gerarToken();
    let webhook_url = '';
    try {
      webhook_url = urlWebhook(integId, hookToken);
    } catch { /* ok */ }

    let integracaoId: string | null = null;
    try {
      await queryOne(
        `INSERT INTO public.manu_integracoes (id, empresa_id, nome, plataforma, token_hash, mapeamento, criado_por)
         VALUES ($1,$2,'Mercado Livre','mercadolivre',$3,$4::jsonb,$5) RETURNING id`,
        [
          integId,
          st.e,
          hashToken(hookToken),
          JSON.stringify({
            nome: 'nome',
            telefone: 'telefone',
            email: 'email',
            interesse: 'titulo',
            mensagem: 'texto',
            id_externo: 'id',
          }),
          st.u,
        ],
      );
      integracaoId = integId;
    } catch (e: any) {
      console.error('ml integracao', e?.message);
      integracaoId = null;
    }

    const userId = String(tj.user_id || 'ml');
    try {
      await query(
        `DELETE FROM public.manu_conexoes_oauth WHERE empresa_id=$1 AND provedor='mercadolivre' AND status='conectado'`,
        [st.e],
      );
    } catch { /* ok */ }

    try {
      await queryOne(
        `INSERT INTO public.manu_conexoes_oauth
          (empresa_id, provedor, status, label, external_id, access_token_enc, refresh_token_enc, meta, integracao_id, criado_por)
         VALUES ($1,'mercadolivre','conectado','Mercado Livre',$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,
        [
          st.e,
          userId,
          tj.access_token,
          tj.refresh_token || null,
          JSON.stringify({
            provider: 'oauth_login',
            user_id: userId,
            webhook_url,
            expires_in: tj.expires_in,
          }),
          integracaoId,
          st.u,
        ],
      );
    } catch (e: any) {
      // sem FK
      await queryOne(
        `INSERT INTO public.manu_conexoes_oauth
          (empresa_id, provedor, status, label, external_id, access_token_enc, refresh_token_enc, meta, criado_por)
         VALUES ($1,'mercadolivre','conectado','Mercado Livre',$2,$3,$4,$5::jsonb,$6) RETURNING id`,
        [
          st.e,
          userId,
          tj.access_token,
          tj.refresh_token || null,
          JSON.stringify({ user_id: userId, webhook_url }),
          st.u,
        ],
      );
    }

    return NextResponse.redirect(`${appUrl}/integracoes?oauth=ok&page=Mercado%20Livre`);
  } catch (e) {
    console.error('ml callback', e);
    return fail('erro_interno');
  }
}
