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

  // ---- Meta Cloud API ----
  if (waToken && phoneId) {
    const integId = randomUUID();
    const hookToken = gerarToken();
    let webhook_url = '';
    try {
      webhook_url = urlWebhook(integId, hookToken);
    } catch {
      const base = env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
      if (base) webhook_url = `${base.replace(/\/$/, '')}/functions/v1/manu-webhook/${integId}/${hookToken}`;
    }

    try {
      await queryOne(
        `INSERT INTO public.manu_integracoes (id, empresa_id, nome, plataforma, token_hash, mapeamento, criado_por)
         VALUES ($1,$2,$3,'whatsapp',$4,$5::jsonb,$6) RETURNING id`,
        [
          integId,
          empresaId,
          'WhatsApp Cloud API',
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
      console.error('manu_integracoes insert', e);
    }

    try {
      const row = await queryOne(
        `INSERT INTO public.manu_conexoes_oauth
          (empresa_id, provedor, status, label, external_id, access_token_enc, meta, integracao_id, criado_por)
         VALUES ($1,'whatsapp_cloud','conectado',$2,$3,$4,$5::jsonb,$6,$7)
         ON CONFLICT (empresa_id, provedor, external_id) DO UPDATE SET
           status='conectado',
           access_token_enc=EXCLUDED.access_token_enc,
           meta=EXCLUDED.meta,
           integracao_id=EXCLUDED.integracao_id,
           atualizado_em=now()
         RETURNING id`,
        [
          empresaId,
          'WhatsApp Cloud API',
          phoneId,
          waToken,
          JSON.stringify({
            phone_number_id: phoneId,
            verify_token: verify,
            webhook_url,
            provider: 'meta_cloud',
            code_version: 'v130',
          }),
          integId,
          actor.id,
        ],
      );

      return NextResponse.json({
        id: row?.id,
        provider: 'meta_cloud',
        status: 'conectado',
        phone_number_id: phoneId,
        webhook_url,
        verify_token: verify,
        qrcode_base64: null,
        message: 'WhatsApp Cloud API conectado a esta empresa.',
        code_version: 'v130',
      });
    } catch (e: any) {
      // tabela oauth pode não existir
      console.error('oauth insert', e?.message || e);
      return NextResponse.json(
        {
          error: 'db',
          message:
            'Tokens OK no Vercel, mas falhou ao gravar. Rode SQL_MANU_OAUTH.sql no Supabase.',
          detail: String(e?.message || e).slice(0, 120),
        },
        { status: 500 },
      );
    }
  }

  // ---- Evolution ----
  const evoUrl = env('EVOLUTION_API_URL').replace(/\/$/, '');
  const evoKey = env('EVOLUTION_API_KEY');
  if (evoUrl) {
    const instance = `aurox_${empresaId}_${randomBytes(3).toString('hex')}`;
    const row = await queryOne(
      `INSERT INTO public.manu_conexoes_oauth
        (empresa_id, provedor, status, label, external_id, meta, criado_por)
       VALUES ($1,'whatsapp_qr','pendente','WhatsApp (QR)',$2,$3::jsonb,$4) RETURNING id`,
      [empresaId, instance, JSON.stringify({ provider: 'evolution' }), actor.id],
    );
    try {
      await fetch(`${evoUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoKey },
        body: JSON.stringify({ instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      });
      const qrRes = await fetch(`${evoUrl}/instance/connect/${instance}`, {
        headers: { apikey: evoKey },
      });
      const qrJson = await qrRes.json().catch(() => ({}));
      return NextResponse.json({
        id: row?.id,
        provider: 'evolution',
        qrcode_base64: qrJson?.base64 || qrJson?.qrcode?.base64 || null,
        message: 'Escaneie o QR',
      });
    } catch {
      return NextResponse.json({ error: 'evolution_fail' }, { status: 500 });
    }
  }

  // diagnóstico claro — NUNCA mais mensagem só de Evolution
  return NextResponse.json(
    {
      error: 'whatsapp_nao_configurado',
      code_version: 'v130',
      message:
        'No Vercel (Production) faltam WHATSAPP_TOKEN e/ou WHATSAPP_PHONE_NUMBER_ID. Depois de salvar as env: Redeploy obrigatório. Abra /api/integracoes/oauth/whatsapp/diagnostico logado para ver o que o servidor enxerga.',
      seen: {
        WHATSAPP_TOKEN: Boolean(waToken),
        WHATSAPP_PHONE_NUMBER_ID: Boolean(phoneId),
      },
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
