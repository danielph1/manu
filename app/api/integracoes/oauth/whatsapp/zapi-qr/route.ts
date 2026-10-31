import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { query, queryOne } from '@/lib/db';
import { randomUUID } from 'node:crypto';
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

/** POST { empresa_id, instance_id?, token?, client_token? } — busca QR da Z-API */
export async function POST(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
  if (!empresaId) return NextResponse.json({ error: 'empresa obrigatória' }, { status: 400 });

  const instance =
    String(body.instance_id || body.instance || '').trim() ||
    env('ZAPI_INSTANCE_ID');
  const token =
    String(body.token || '').trim() ||
    env('ZAPI_TOKEN');
  const clientToken =
    String(body.client_token || '').trim() ||
    env('ZAPI_CLIENT_TOKEN');

  if (!instance || !token) {
    return NextResponse.json(
      {
        error: 'zapi_creds',
        message:
          'Informe Instance ID + Token da Z-API (ou configure ZAPI_INSTANCE_ID e ZAPI_TOKEN no Vercel). Trial expirado não gera QR.',
      },
      { status: 400 },
    );
  }

  // QR image Z-API
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (clientToken) headers['Client-Token'] = clientToken;

  let qrBase64: string | null = null;
  let statusPhone: any = null;
  let errMsg = '';

  try {
    const qrRes = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/qr-code/image`,
      { headers },
    );
    const ct = qrRes.headers.get('content-type') || '';
    if (qrRes.ok && ct.includes('image')) {
      const buf = Buffer.from(await qrRes.arrayBuffer());
      qrBase64 = `data:${ct};base64,${buf.toString('base64')}`;
    } else {
      const j = await qrRes.json().catch(() => ({}));
      // algumas contas devolvem { value: base64 }
      if (j?.value) qrBase64 = String(j.value).startsWith('data:') ? j.value : `data:image/png;base64,${j.value}`;
      else errMsg = j?.message || j?.error || `Z-API QR HTTP ${qrRes.status}`;
    }
  } catch (e: any) {
    errMsg = e?.message || 'falha ao pedir QR';
  }

  try {
    const st = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/status`,
      { headers },
    );
    statusPhone = await st.json().catch(() => null);
  } catch { /* ok */ }

  // persiste credenciais da loja
  const integId = randomUUID();
  const hookToken = gerarToken();
  let webhook_url = '';
  try {
    webhook_url = urlWebhook(integId, hookToken);
  } catch {
    webhook_url = `${env('NEXT_PUBLIC_APP_URL')}/api/webhooks/zapi`;
  }

  const connected = Boolean(statusPhone?.connected || statusPhone?.smartphoneConnected);

  try {
    await query(
      `INSERT INTO public.manu_conexoes_oauth
         (empresa_id, provedor, status, label, external_id, access_token_enc, meta, criado_por, atualizado_em)
       VALUES ($1,'whatsapp_qr',$2,'WhatsApp Z-API',$3,$4,$5::jsonb,$6, now())
       ON CONFLICT DO NOTHING`,
      [
        empresaId,
        connected ? 'conectado' : 'pendente',
        instance,
        token,
        JSON.stringify({
          instance_id: instance,
          client_token: clientToken || null,
          webhook_url,
          provider: 'z-api',
          last_status: statusPhone,
        }),
        actor.id,
      ],
    );
    // update existing
    await query(
      `UPDATE public.manu_conexoes_oauth SET
         status=$2, access_token_enc=$3, meta = COALESCE(meta,'{}'::jsonb) || $4::jsonb, atualizado_em=now()
       WHERE empresa_id=$1 AND provedor='whatsapp_qr'`,
      [
        empresaId,
        connected ? 'conectado' : 'pendente',
        token,
        JSON.stringify({
          instance_id: instance,
          client_token: clientToken || null,
          webhook_url,
          provider: 'z-api',
          last_status: statusPhone,
        }),
      ],
    );
  } catch (e) {
    console.error('zapi oauth save', e);
  }

  if (connected) {
    return NextResponse.json({
      ok: true,
      connected: true,
      message: 'WhatsApp já está conectado nesta instância Z-API',
      status: statusPhone,
      webhook_url,
    });
  }

  if (!qrBase64) {
    return NextResponse.json(
      {
        error: 'qr_indisponivel',
        message:
          errMsg ||
          'Z-API não devolveu QR. Trial expirado, instância desligada ou token errado — renove o plano em developer.z-api.io',
        status: statusPhone,
      },
      { status: 402 },
    );
  }

  return NextResponse.json({
    ok: true,
    connected: false,
    qrcode_base64: qrBase64,
    webhook_url,
    message: 'Escaneie o QR com o WhatsApp do número da loja',
  });
}
