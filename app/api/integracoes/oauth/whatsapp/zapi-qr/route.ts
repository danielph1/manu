import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes, escopoEmpresa } from '@/lib/integracoes/auth';
import { query, queryOne } from '@/lib/db';
import { zapiAssinatura } from '@/lib/zapi-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await gestorIntegracoes(req);
    if (!actor) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const empresaId = escopoEmpresa(actor, body.empresa_id ?? actor.empresa_id);
    if (!empresaId) return NextResponse.json({ error: 'Selecione a empresa' }, { status: 400 });
    const instance = String(body.instance_id || '').trim() || String(process.env.ZAPI_INSTANCE_ID || '').trim();
    const token = String(body.token || '').trim() || String(process.env.ZAPI_TOKEN || '').trim();
    const clientToken = String(body.client_token || '').trim() || String(process.env.ZAPI_CLIENT_TOKEN || '').trim();
    if (!instance || !token) return NextResponse.json({ error: 'Informe a instância e token Z-API desta empresa.' }, { status: 400 });
    if (!/^[\w-]{8,120}$/.test(instance)) return NextResponse.json({ error: 'ID de instância inválido.' }, { status: 400 });
    const base = String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    if (!base.startsWith('https://')) return NextResponse.json({ error: 'APP_URL precisa ser uma URL HTTPS pública para receber mensagens.' }, { status: 503 });

    // Proíbe conectar o MESMO número/instância a empresas diferentes.
    const conexoes = await query<{ id: string; empresa_id: number; status: string }>(
      `SELECT id, empresa_id, status FROM public.manu_conexoes_oauth
        WHERE provedor='whatsapp_qr' AND external_id=$1 AND status <> 'revogado'`, [instance],
    );
    if (conexoes.rows.some((c) => Number(c.empresa_id) !== empresaId)) return NextResponse.json({
      error: 'Instância Z-API já vinculada a outra empresa. Use uma instância exclusiva por empresa.' }, { status: 409 });
    const existing = conexoes.rows.find((c) => Number(c.empresa_id) === empresaId);
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;
    const prefix = `https://api.z-api.io/instances/${encodeURIComponent(instance)}/token/${encodeURIComponent(token)}`;
    const st = await fetch(`${prefix}/status`, { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!st.ok) return NextResponse.json({ error: `Z-API recusou esta instância (HTTP ${st.status}). Verifique token ou assinatura.` }, { status: 502 });
    const status = await st.json().catch(() => ({}));
    const connected = Boolean(status.connected || status.smartphoneConnected);

    // O ID é criado pelo banco; a URL do callback é derivada do ID e de um segredo do servidor.
    let id = existing?.id;
    if (!id) {
      const inserted = await queryOne<{ id: string }>(
        `INSERT INTO public.manu_conexoes_oauth
           (empresa_id, provedor, status, label, external_id, access_token_enc, meta, criado_por)
         VALUES ($1,'whatsapp_qr','pendente','WhatsApp Z-API',$2,$3,$4::jsonb,$5) RETURNING id`,
        [empresaId, instance, token, JSON.stringify({ instance_id: instance, client_token: clientToken || null, webhook_registered: false }), actor.id],
      );
      id = inserted?.id;
    }
    if (!id) return NextResponse.json({ error: 'Não foi possível criar vínculo da empresa.' }, { status: 500 });
    const signature = zapiAssinatura(id, instance);
    const webhookUrl = `${base}/api/webhooks/zapi/${id}?sig=${signature}`;
    // Atualiza o webhook da instância no provedor, não depende do empresário colar URL.
    const webhookRes = await fetch(`${prefix}/update-webhook-received`, {
      method: 'PUT', headers, body: JSON.stringify({ value: webhookUrl }),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const webhookRegistered = webhookRes.ok;
    await query(
      `UPDATE public.manu_conexoes_oauth SET status=$2, access_token_enc=$3,
              meta=COALESCE(meta,'{}'::jsonb) || $4::jsonb, atualizado_em=now()
         WHERE id=$1 AND empresa_id=$5`,
      [id, connected && webhookRegistered ? 'conectado' : webhookRegistered ? 'pendente' : 'erro', token,
        JSON.stringify({ instance_id: instance, client_token: clientToken || null, webhook_registered: webhookRegistered,
          provider: 'z-api', last_status: status }), empresaId],
    );
    if (!webhookRegistered) return NextResponse.json({
      error: `A Z-API não confirmou o webhook (HTTP ${webhookRes.status}). Conexão não ativada.` }, { status: 502 });
    if (connected) return NextResponse.json({ ok: true, connected: true,
      message: 'WhatsApp conectado e webhook exclusivo desta empresa configurado.' });
    const qrRes = await fetch(`${prefix}/qr-code/image`, { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const ct = qrRes.headers.get('content-type') || '';
    let qr: string | null = null;
    if (qrRes.ok && ct.startsWith('image/')) {
      qr = `data:${ct.split(';')[0]};base64,${Buffer.from(await qrRes.arrayBuffer()).toString('base64')}`;
    } else if (qrRes.ok) {
      const data = await qrRes.json().catch(() => ({}));
      if (data.value) qr = String(data.value).startsWith('data:') ? data.value : `data:image/png;base64,${data.value}`;
    }
    if (!qr) return NextResponse.json({ error: 'Z-API não devolveu QR Code; confira o plano e a instância.' }, { status: 502 });
    return NextResponse.json({ ok: true, connected: false, qrcode_base64: qr,
      message: 'Escaneie o QR pelo WhatsApp da loja. O webhook já foi preparado.' });
  } catch (e: any) {
    console.error('[ZAPI QR]', e?.message || 'erro');
    return NextResponse.json({ error: String(e?.message || 'Erro ao conectar instância').slice(0, 200) }, { status: 500 });
  }
}
