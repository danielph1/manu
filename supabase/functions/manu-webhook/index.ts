// Deploy: supabase functions deploy manu-webhook --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_VERIFY_TOKEN (opcional, default aurox-meta-verify)
import { createClient } from 'npm:@supabase/supabase-js@2';

const VERIFY = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || Deno.env.get('META_VERIFY_TOKEN') || 'aurox-meta-verify';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Meta / WhatsApp Cloud API — validação do webhook (GET)
  // Universal: mesmo verify token para todas as empresas (mostrado na UI Aurox)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY && challenge) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const match = pathname.match(/\/manu-webhook\/([0-9a-f-]{36})\/([a-f0-9]{64})\/?$/i);
    if (!match) return Response.json({ error: 'endpoint inválido' }, { status: 404 });

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return Response.json({ error: 'JSON obrigatório' }, { status: 415 });
    }
    if (Number(req.headers.get('content-length') || 0) > 130000) {
      return Response.json({ error: 'payload muito grande' }, { status: 413 });
    }
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 130000) {
      return Response.json({ error: 'payload muito grande' }, { status: 413 });
    }
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return Response.json({ error: 'JSON inválido' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Response.json({ error: 'objeto JSON obrigatório' }, { status: 422 });
    }

    // Normaliza payloads Meta (WhatsApp Cloud, Messenger, Instagram) para campos planos
    payload = normalizeMeta(payload) ?? payload;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRole) {
      return Response.json({ error: 'configuração do servidor ausente' }, { status: 503 });
    }
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Blindagem: RPC só grava triagem com empresa_id da integração dona do token
    const { data, error } = await admin.rpc('manu_receber_webhook', {
      p_integracao: match[1],
      p_token: match[2],
      p_payload: payload,
    });

    if (error) {
      if (error.code === '28000') return Response.json({ error: 'não autorizado' }, { status: 401 });
      if (error.code === '22023') return Response.json({ error: 'lead inválido' }, { status: 422 });
      console.error('manu_receber_webhook falhou', error.code);
      return Response.json({ error: 'falha ao receber lead' }, { status: 500 });
    }
    return Response.json(data, { status: 200 });
  } catch (err) {
    console.error('manu-webhook', err instanceof Error ? err.name : 'erro');
    return Response.json({ error: 'falha interna' }, { status: 500 });
  }
});

/** Extrai nome/telefone/mensagem de webhooks Meta quando possível */
function normalizeMeta(body: any): Record<string, unknown> | null {
  try {
    // WhatsApp Cloud API
    const wEntry = body?.entry?.[0]?.changes?.[0]?.value;
    if (wEntry?.messages?.[0]) {
      const msg = wEntry.messages[0];
      const contact = wEntry.contacts?.[0];
      return {
        name: contact?.profile?.name || msg.from,
        phone: msg.from,
        message: msg.text?.body || msg.type || '',
        externalId: msg.id,
        object: body.object,
        raw_meta: true,
      };
    }
    // Messenger / Instagram messaging
    const mEntry = body?.entry?.[0]?.messaging?.[0];
    if (mEntry) {
      return {
        name: String(mEntry.sender?.id || ''),
        phone: '',
        message: mEntry.message?.text || '',
        externalId: mEntry.message?.mid || mEntry.timestamp,
        object: body.object,
        raw_meta: true,
      };
    }
    // Lead Ads
    const lead = body?.entry?.[0]?.changes?.[0]?.value;
    if (lead?.leadgen_id) {
      return {
        name: lead.full_name || lead.name || '',
        phone: lead.phone_number || lead.phone || '',
        email: lead.email || '',
        message: 'Lead Ads',
        externalId: lead.leadgen_id,
        object: body.object,
        raw_meta: true,
      };
    }
  } catch {
    /* keep original */
  }
  return null;
}
