import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { query, queryOne } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Recebe `code` do Embedded Signup, troca por token (app secret só no servidor),
 * grava conexão isolada por empresa_id.
 */
export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 });

  const code = String(body.code || '').trim();
  if (!code) return NextResponse.json({ error: 'code ausente' }, { status: 400 });

  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || process.env.FACEBOOK_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
  if (!appId || !appSecret) {
    return NextResponse.json(
      {
        error: 'meta_secret',
        message: 'META_APP_ID e META_APP_SECRET devem estar no Vercel (servidor).',
      },
      { status: 503 },
    );
  }

  // Troca code → token (Embedded Signup)
  let accessToken = '';
  try {
    const tokenUrl =
      `https://graph.facebook.com/v21.0/oauth/access_token` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&code=${encodeURIComponent(code)}`;
    const tr = await fetch(tokenUrl);
    const tj = await tr.json();
    if (tj.error) {
      return NextResponse.json(
        {
          error: 'token_exchange',
          message: tj.error?.message || 'Falha ao trocar code por token',
        },
        { status: 400 },
      );
    }
    accessToken = tj.access_token || '';
  } catch (e) {
    console.error('embedded exchange', e);
    return NextResponse.json({ error: 'token_exchange', message: 'Erro de rede na Graph API' }, { status: 502 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'token_vazio', message: 'Meta não retornou access_token' }, { status: 400 });
  }

  let phoneNumberId = String(body.phone_number_id || '').trim();
  let wabaId = String(body.waba_id || '').trim();
  const businessId = String(body.business_id || '').trim();

  // Se o front não mandou phone_number_id, tenta descobrir via Graph
  if (!phoneNumberId && wabaId) {
    try {
      const pr = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`,
      );
      const pj = await pr.json();
      phoneNumberId = pj?.data?.[0]?.id || '';
    } catch {
      /* ok */
    }
  }

  if (!phoneNumberId) {
    // ainda assim grava WABA — admin completa phone id depois
    phoneNumberId = wabaId ? `waba:${wabaId}` : `pending:${empresaId}`;
  }

  const integId = randomUUID();
  const hookToken = gerarToken();
  let webhook_url = '';
  try {
    webhook_url = urlWebhook(integId, hookToken);
  } catch {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    if (base) {
      webhook_url = `${base.replace(/\/$/, '')}/functions/v1/manu-webhook/${integId}/${hookToken}`;
    }
  }

  const verify =
    process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'aurox-meta-verify';

  try {
    await queryOne(
      `INSERT INTO public.manu_integracoes (id, empresa_id, nome, plataforma, token_hash, mapeamento, criado_por)
       VALUES ($1,$2,$3,'whatsapp',$4,$5::jsonb,$6) RETURNING id`,
      [
        integId,
        empresaId,
        'WhatsApp Embedded Signup',
        hashToken(hookToken),
        JSON.stringify({
          nome: 'name',
          telefone: 'phone',
          email: 'email',
          interesse: 'interest',
          mensagem: 'message',
          id_externo: 'externalId',
        }),
        actor.id,
      ],
    );
  } catch (e) {
    console.error('integracoes embed', e);
  }

  // upsert conexão
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM public.manu_conexoes_oauth
      WHERE empresa_id=$1 AND provedor='whatsapp_cloud' AND external_id=$2 LIMIT 1`,
    [empresaId, phoneNumberId],
  );

  const meta = {
    provider: 'embedded_signup',
    waba_id: wabaId || null,
    business_id: businessId || null,
    phone_number_id: phoneNumberId,
    webhook_url,
    verify_token: verify,
    code_version: 'v132-embedded',
  };

  let rowId = existing?.id;
  try {
    if (existing) {
      await query(
        `UPDATE public.manu_conexoes_oauth SET
           status='conectado', access_token_enc=$2, meta=$3::jsonb,
           label='WhatsApp (Embedded Signup)', integracao_id=$4, atualizado_em=now()
         WHERE id=$1`,
        [existing.id, accessToken, JSON.stringify(meta), integId],
      );
    } else {
      const row = await queryOne<{ id: string }>(
        `INSERT INTO public.manu_conexoes_oauth
          (empresa_id, provedor, status, label, external_id, access_token_enc, meta, integracao_id, criado_por)
         VALUES ($1,'whatsapp_cloud','conectado','WhatsApp (Embedded Signup)',$2,$3,$4::jsonb,$5,$6)
         RETURNING id`,
        [empresaId, phoneNumberId, accessToken, JSON.stringify(meta), integId, actor.id],
      );
      rowId = row?.id;
    }
  } catch (e: any) {
    console.error('oauth embed', e);
    return NextResponse.json(
      {
        error: 'db',
        message: 'Rode SQL_MANU_OAUTH.sql no Supabase.',
        detail: String(e?.message || e).slice(0, 120),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: rowId,
    status: 'conectado',
    phone_number_id: phoneNumberId,
    waba_id: wabaId || null,
    webhook_url,
    verify_token: verify,
    message:
      'WhatsApp conectado via Embedded Signup. Configure o webhook na Meta (URL + verify token) se ainda não estiver no app.',
  });
}
