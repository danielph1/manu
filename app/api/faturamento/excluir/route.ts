import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { obterFaturamentoPermitido } from '@/lib/faturamento-empresa';
export const runtime='nodejs';
export async function POST(req:NextRequest) {
 const u=await requireUser(req);
 if(!u)return NextResponse.json({error:'não autenticado'},{status:401});
 if(!['admin','gerente','superadmin'].includes(u.tipo))return NextResponse.json({error:'sem permissão'},{status:403});
 const b=await req.json().catch(()=>({}));
 const atual=await obterFaturamentoPermitido(Number(b.id),u);
 if(!atual)return NextResponse.json({error:'não encontrado na sua empresa'},{status:404});
 await query(`DELETE FROM public.faturamentos WHERE id=$1 AND empresa_id=$2`,[atual.id,atual.empresa_id]);
 return NextResponse.json({ok:true});
}
