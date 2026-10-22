import { NextRequest, NextResponse } from 'next/server';
import { gestorIntegracoes } from '@/lib/integracoes/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Só true/false — nunca devolve valor dos secrets */
export async function GET(req: NextRequest) {
  const actor = await gestorIntegracoes(req);
  if (!actor) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });

  const has = (k: string) => Boolean(String(process.env[k] || '').trim());
  const token = has('WHATSAPP_TOKEN') || has('WHATSAPP_ACCESS_TOKEN');
  const phone =
    has('WHATSAPP_PHONE_NUMBER_ID') || has('WHATSAPP_PHONE_ID');
  const verify = has('WHATSAPP_VERIFY_TOKEN') || has('META_VERIFY_TOKEN');
  const evo = has('EVOLUTION_API_URL');
  const zapi = has('ZAPI_INSTANCE_ID') && has('ZAPI_TOKEN');
  const supabaseUrl = has('NEXT_PUBLIC_SUPABASE_URL') || has('SUPABASE_URL');

  let mode: string = 'nenhum';
  if (token && phone) mode = 'meta_cloud';
  else if (evo) mode = 'evolution';
  else if (zapi) mode = 'zapi';

  return NextResponse.json({
    code_version: 'v129-cloud',
    mode,
    vercel: {
      WHATSAPP_TOKEN: token,
      WHATSAPP_PHONE_NUMBER_ID: phone,
      WHATSAPP_VERIFY_TOKEN: verify,
      EVOLUTION_API_URL: evo,
      ZAPI: zapi,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    },
    dica:
      mode === 'meta_cloud'
        ? 'Cloud API OK no Vercel — Conectar WhatsApp deve funcionar após este deploy.'
        : mode === 'nenhum'
          ? 'Falta WHATSAPP_TOKEN e/ou WHATSAPP_PHONE_NUMBER_ID no Vercel (Production + Redeploy).'
          : `Modo detectado: ${mode}`,
  });
}
