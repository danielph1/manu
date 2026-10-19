/**
 * Cliente Z-API (WhatsApp)
 *
 * Env no Vercel:
 *   ZAPI_INSTANCE_ID
 *   ZAPI_TOKEN
 *   ZAPI_CLIENT_TOKEN  (opcional — se a conta exigir)
 */

export function phoneToZapi(raw: string | null | undefined): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  // remove zeros à esquerda
  d = d.replace(/^0+/, '');
  if (d.startsWith('55') && d.length >= 12) return d;
  // BR: DDD + número (10 ou 11 dígitos)
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}

export async function zapiSendText(phoneRaw: string, message: string): Promise<{
  ok: boolean;
  status?: number;
  body?: any;
  error?: string;
  phone?: string;
  skipped?: string;
}> {
  const instance = process.env.ZAPI_INSTANCE_ID || '';
  const token = process.env.ZAPI_TOKEN || '';
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || '';
  if (!instance || !token) {
    return { ok: false, skipped: 'ZAPI_INSTANCE_ID / ZAPI_TOKEN não configurados no Vercel' };
  }
  const phone = phoneToZapi(phoneRaw);
  if (!phone || phone.length < 12) {
    return { ok: false, error: `telefone inválido: ${phoneRaw}`, phone };
  }

  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) headers['Client-Token'] = clientToken;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, message }),
    });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch { /* ok */ }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        phone,
        error: typeof body === 'object' ? JSON.stringify(body) : String(body),
      };
    }
    return { ok: true, status: res.status, body, phone };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), phone };
  }
}
