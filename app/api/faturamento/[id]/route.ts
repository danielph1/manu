import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { obterFaturamentoPermitido } from '@/lib/faturamento-empresa';
export const runtime = 'nodejs';
export async function GET(req: NextRequest,{params}:{params:Promise<{id:string}>}) {
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'não autenticado'},{status:401});
  const {id}=await params;
  try {
    const row=await obterFaturamentoPermitido(Number(id),u);
    if(!row)return NextResponse.json({error:'faturamento não encontrado nesta empresa'},{status:404});
    delete row.valor_financiado;
    return NextResponse.json(row,{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Falha ao consultar faturamento. Confira a migration por empresa.'},{status:500});}
}
