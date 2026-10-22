// Deploy: supabase functions deploy manu-webhook --no-verify-jwt
// Nunca use a key anon aqui; SUPABASE_SERVICE_ROLE_KEY é definida como secret da função.
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  try {
    const pathname = new URL(req.url).pathname;
    const match = pathname.match(/\/manu-webhook\/([0-9a-f-]{36})\/([a-f0-9]{64})\/?$/i);
    if (!match) return Response.json({ error: 'endpoint inválido' }, { status: 404 });
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return Response.json({ error: 'JSON obrigatório' }, { status: 415 });
    if (Number(req.headers.get('content-length') || 0) > 130000) return Response.json({ error: 'payload muito grande' }, { status: 413 });
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 130000) return Response.json({ error: 'payload muito grande' }, { status: 413 });
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return Response.json({ error: 'objeto JSON obrigatório' }, { status: 422 });
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRole) return Response.json({ error: 'configuração do servidor ausente' }, { status: 503 });
    const admin = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.rpc('manu_receber_webhook', {
      p_integracao: match[1], p_token: match[2], p_payload: payload,
    });
    if (error) {
      // Não divulga payload nem segredo nos logs/respostas.
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
