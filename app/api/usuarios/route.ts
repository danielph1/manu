import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';
/** Lista usada por metas/tarefas: apenas usuários da MESMA empresa. O gerenciamento fica em /gestao-usuarios. */
export async function GET(req:NextRequest){
 const u=await requireUser(req);
 if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(u.tipo!=='superadmin'&&!u.empresa_id)return NextResponse.json([]);
 try{
  const {rows}=await query(`SELECT id,nome,login,tipo,loja FROM public.usuarios
   WHERE COALESCE(ativo,TRUE) AND ($1::boolean OR empresa_id=$2) ORDER BY nome LIMIT 500`,
   [u.tipo==='superadmin',u.empresa_id||null]);
  return NextResponse.json(rows,{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Falha ao consultar usuários'},{status:500});}
}
