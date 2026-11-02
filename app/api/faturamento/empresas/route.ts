import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { query } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req: NextRequest) {
  const u=await requireUser(req);
  if(!u)return NextResponse.json({error:'não autenticado'},{status:401});
  if(u.tipo!=='superadmin' && !u.empresa_id)return NextResponse.json({error:'Usuário sem empresa vinculada'},{status:403});
  const params=u.tipo==='superadmin'?[]:[u.empresa_id];
  const where=u.tipo==='superadmin'?'':'WHERE e.id=$1';
  const {rows}=await query<any>(`SELECT e.id AS empresa_id,e.nome AS empresa_nome,
    l.id AS loja_id,l.codigo AS loja_codigo,l.nome AS loja_nome
    FROM public.empresas e LEFT JOIN public.lojas l ON l.empresa_id=e.id AND COALESCE(l.ativo,true)
    ${where} ORDER BY e.nome,l.codigo`,params);
  const map=new Map<number,any>();
  for(const row of rows){
    const id=Number(row.empresa_id);
    if(!map.has(id))map.set(id,{id,nome:row.empresa_nome,lojas:[]});
    if(row.loja_codigo)map.get(id).lojas.push({codigo:row.loja_codigo,nome:row.loja_nome});
  }
  return NextResponse.json([...map.values()]);
}
