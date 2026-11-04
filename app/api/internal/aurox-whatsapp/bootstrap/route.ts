import { NextRequest, NextResponse } from 'next/server';
import { authorizedWorker } from '@/lib/aurox-whatsapp/security';
import { query } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  try {
    if(!authorizedWorker(req.headers.get('authorization')))
      return NextResponse.json({error:'não autorizado'},{status:401});
    const {rows}=await query<{empresa_id:number;instancia_id:string}>(`
      SELECT i.empresa_id,i.instancia_id FROM public.aurox_wa_instancias i
      JOIN public.empresas e ON e.id=i.empresa_id
      WHERE i.habilitada=TRUE AND e.ativo=TRUE ORDER BY i.empresa_id`);
    return NextResponse.json({sessions:rows},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Falha ao restaurar sessões'}, {status:503});}
}
