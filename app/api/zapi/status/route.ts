import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

/** Debug: admin vê se Z-API está configurado (sem expor o token completo) */
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u || !['admin', 'gerente'].includes(String(u.tipo || '').toLowerCase())) {
    return NextResponse.json({ error: 'sem acesso' }, { status: 403 });
  }
  const instance = process.env.ZAPI_INSTANCE_ID || '';
  const token = process.env.ZAPI_TOKEN || '';
  const client = process.env.ZAPI_CLIENT_TOKEN || '';
  return NextResponse.json({
    instance_ok: !!instance,
    instance_preview: instance ? instance.slice(0, 6) + '…' : null,
    token_ok: !!token,
    token_preview: token ? token.slice(0, 4) + '…' : null,
    client_token_ok: !!client,
    send_url: instance && token
      ? `https://api.z-api.io/instances/${instance}/token/***/send-text`
      : null,
  });
}
