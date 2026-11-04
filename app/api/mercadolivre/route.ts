import { NextResponse } from 'next/server';
/** Endpoint legado sem vínculo empresarial verificável. Use a Central de Integrações. */
export async function POST() { return NextResponse.json({ error: 'Endpoint legado desativado por segurança multiempresa. Configure o webhook individual do canal na Central de Integrações.' }, { status: 410 }); }
export async function GET() { return NextResponse.json({ deprecated: true, channel: 'mercadolivre' }, { status: 410 }); }
