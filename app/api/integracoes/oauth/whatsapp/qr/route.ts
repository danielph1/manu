import { NextResponse } from 'next/server';
// API experimental antiga que vinculava WHATSAPP_* globais a qualquer empresa.
// Não use: poderia confundir contas de empresas diferentes.
export async function POST() {
  return NextResponse.json({ error: 'Atalho global desativado. Use Embedded Signup da Meta ou QR da Z-API para conectar a conta individual desta empresa.' }, { status: 410 });
}
export async function GET() {
  return NextResponse.json({ deprecated: true, error: 'Use Central de Integrações → WhatsApp.' }, { status: 410 });
}
