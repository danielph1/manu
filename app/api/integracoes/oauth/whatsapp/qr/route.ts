import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { query, queryOne } from '@/lib/db';
import { randomBytes, randomUUID } from 'node:crypto';
import { gerarToken, hashToken, urlWebhook } from '@/lib/integracoes/helpers';

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

  const waToken = env('WHATSAPP_TOKEN', 'WHATSAPP_ACCESS_TOKEN');
  const phoneId = env('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_PHONE_ID');
  const verify = env('WHATSAPP_VERIFY_TOKEN', 'META_VERIFY_TOKEN') || 'aurox-meta-verify';

  if (waToken && phoneId) {
    // Já conectado? só atualiza e devolve sucesso (sem erro vermelho)
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM public.manu_conexoes_oauth
        WHERE empresa_id=$1 AND provedor='whatsapp_cloud' AND external_id=$2
        LIMIT 1`,
      [empresaId, phoneId],
    );

    const integId = randomUUID();
    const hookToken = gerarToken();
    let webhook_url = '';
    try {
      webhook_url = urlWebhook(integId, hookToken);
    } catch {
      const base = env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
      if (base) {
        webhook_url = `${base.replace(/\/$/, '')}/functions/v1/manu-webhook/${integId}/${hookToken}`;
      }
    }

    if (!existing) {
      try {
        await queryOne(
          `INSERT INTO public.manu_integracoes (id, empresa_id, nome, plataforma, token_hash, mapeamento, criado_por)
           VALUES ($1,$2,'WhatsApp Cloud API','whatsapp',$3,$4::jsonb,$5) RETURNING id`,
          [
            integId,
            empresaId,
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
        console.error('integracoes', e);
      }
    }

    let rowId = existing?.id;
    try {
      if (existing) {
        await query(
          `UPDATE public.manu_conexoes_oauth SET
             status='conectado',
             access_token_enc=$2,
             meta = COALESCE(meta,'{}'::jsonb) || $3::jsonb,
             label='WhatsApp Cloud API',
             atualizado_em=now()
           WHERE id=$1`,
          [
            existing.id,
            waToken,
            JSON.stringify({
              phone_number_id: phoneId,
              verify_token: verify,
              webhook_url: webhook_url || undefined,
              provider: 'meta_cloud',
              code_version: 'v131',
            }),
          ],
        );
        rowId = existing.id;
      } else {
        const row = await queryOne<{ id: string }>(
          `INSERT INTO public.manu_conexoes_oauth
            (empresa_id, provedor, status, label, external_id, access_token_enc, meta, integracao_id, criado_por)
           VALUES ($1,'whatsapp_cloud','conectado','WhatsApp Cloud API',$2,$3,$4::jsonb,$5,$6)
           RETURNING id`,
          [
            empresaId,
            phoneId,
            waToken,
            JSON.stringify({
              phone_number_id: phoneId,
              verify_token: verify,
              webhook_url,
              provider: 'meta_cloud',
              code_version: 'v131',
            }),
            integId,
            actor.id,
          ],
        );
        rowId = row?.id;
      }
    } catch (e: any) {
      console.error('oauth', e);
      // se a lista já mostra conectado, não assusta
      const again = await queryOne<{ id: string }>(
        `SELECT id FROM public.manu_conexoes_oauth
          WHERE empresa_id=$1 AND provedor='whatsapp_cloud' LIMIT 1`,
        [empresaId],
      );
      if (again) {
        return NextResponse.json({
          id: again.id,
          provider: 'meta_cloud',
          status: 'conectado',
          message: 'WhatsApp já estava conectado.',
          verify_token: verify,
          webhook_url,
          code_version: 'v131',
        });
      }
      return NextResponse.json(
        {
          error: 'db',
          message: 'Rode SQL_MANU_OAUTH.sql no Supabase e tente de novo.',
          detail: String(e?.message || e).slice(0, 150),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: rowId,
      provider: 'meta_cloud',
      status: 'conectado',
      phone_number_id: phoneId,
      webhook_url,
      verify_token: verify,
      qrcode_base64: null,
      message: existing
        ? 'WhatsApp Cloud API já conectado — dados atualizados.'
        : 'WhatsApp Cloud API conectado a esta empresa.',
      code_version: 'v131',
    });
  }

  return NextResponse.json(
    {
      error: 'whatsapp_nao_configurado',
      code_version: 'v131',
      message:
        'Faltam WHATSAPP_TOKEN e/ou WHATSAPP_PHONE_NUMBER_ID no Vercel Production (com Redeploy).',
      seen: { WHATSAPP_TOKEN: Boolean(waToken), WHATSAPP_PHONE_NUMBER_ID: Boolean(phoneId) },
    },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id' }, { status: 400 });
  const row = await queryOne(
    `SELECT id, status FROM public.manu_conexoes_oauth WHERE id=$1 AND ($2::boolean OR empresa_id=$3)`,
    [id, actor.tipo === 'superadmin', actor.empresa_id],
  );
  if (!row) return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  return NextResponse.json({ status: row.status });
}
