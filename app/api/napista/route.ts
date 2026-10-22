import { NextResponse } from 'next/server';
export const runtime='nodejs';
/** Endpoint antigo removido: recebia leads sem autenticação e sem isolamento SaaS. */
export async function POST() {
  return NextResponse.json({error:'Endpoint antigo desativado. Cadastre NaPista em /integracoes e use a URL exclusiva.'},{status:410});
}
export async function GET() {
  return NextResponse.json({ok:false,deprecated:true,endpoint:'/integracoes'},{status:410});
}
