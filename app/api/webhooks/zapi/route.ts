import { NextResponse } from 'next/server';
// Endpoint antigo sem identificação de empresa: NÃO receber leads neste endereço.
export async function POST() {
  return NextResponse.json({ error: 'Webhook antigo desativado por segurança multiempresa. Reconecte a instância na Central de Integrações.' }, { status: 410 });
}
export async function GET() {
  return NextResponse.json({ ok: false, deprecated: true, message: 'Reconfigure a Z-API no painel de integrações.' }, { status: 410 });
}
