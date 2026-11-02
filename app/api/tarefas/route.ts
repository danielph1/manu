import { NextRequest, NextResponse } from 'next/server';
import { getPool, query, queryOne } from '@/lib/db';
import { requireUser, type SessionUser } from '@/lib/session';
import { notificar } from '@/lib/notify';
export const runtime='nodejs';
const GERENCIA=new Set(['admin','gerente','marketing','superadmin']);
const gestor=(u:SessionUser)=>GERENCIA.has(String(u.tipo).toLowerCase());
function filtro(u:SessionUser, params:unknown[], tabela='t') {
 const parts:string[]=[];
 if(u.tipo!=='superadmin') {
  if(!u.empresa_id) return 'FALSE';
  params.push(u.empresa_id);
  const x=`$${params.length}`;
  parts.push(`EXISTS(SELECT 1 FROM public.usuarios z WHERE z.id=${tabela}.destinatario_id AND z.empresa_id=${x})`);
  parts.push(`EXISTS(SELECT 1 FROM public.usuarios z WHERE z.id=${tabela}.criado_por_id AND z.empresa_id=${x})`);
 }
 if(!gestor(u)) {params.push(u.id);parts.push(`${tabela}.destinatario_id=$${params.length}`);}
 if(u.tipo==='gerente' && u.loja){
  params.push(String(u.loja).toUpperCase());
  const x=`$${params.length}`;
  params.push(u.id);
  parts.push(`(${tabela}.criado_por_id=$${params.length} OR EXISTS(SELECT 1 FROM public.usuarios z LEFT JOIN public.vendedores v ON v.id=z.vendedor_id WHERE z.id=${tabela}.destinatario_id AND UPPER(COALESCE(v.loja,z.loja,''))=${x}))`);
 }
 return parts.length?parts.join(' AND '):'TRUE';
}
export async function GET(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 try {const params:unknown[]=[];const where=filtro(u,params);
  const {rows}=await query(`SELECT t.*, d.nome AS destinatario_nome,c.nome AS criador_nome FROM public.tarefas t
  LEFT JOIN public.usuarios d ON d.id=t.destinatario_id LEFT JOIN public.usuarios c ON c.id=t.criado_por_id
  WHERE ${where} ORDER BY CASE WHEN t.resposta IS NULL THEN 0 ELSE 1 END,t.created_at DESC LIMIT 300`,params);
  return NextResponse.json(rows);
 }catch(e:any){return NextResponse.json({error:e?.message||'Falha nas tarefas'},{status:500});}
}
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!gestor(u))return NextResponse.json({error:'Sem permissão'},{status:403});
 try {const b=await req.json();const titulo=String(b.titulo||'').trim();if(!titulo||titulo.length>180)return NextResponse.json({error:'Título obrigatório (máximo 180 caracteres)'},{status:400});
  const desc=String(b.descricao||'').slice(0,2000)||null;
  const params:unknown[]=[];
  let where='COALESCE(z.ativo,TRUE)=TRUE';
  if(u.tipo!=='superadmin'){
   if(!u.empresa_id)return NextResponse.json({error:'Empresa não vinculada'},{status:403});
   params.push(u.empresa_id);where+=` AND z.empresa_id=$${params.length}`;
  }
  if(u.tipo==='gerente' && u.loja){params.push(u.loja.toUpperCase());where+=` AND UPPER(COALESCE(v.loja,z.loja,''))=$${params.length}`;}
  if(b.destinatario_tipo){
   const tipo=String(b.destinatario_tipo).toLowerCase();
   const aliases:Record<string,string[]>={vendedores:['vendedor'],guaribas:['guariba'],mecanicos:['mecanico'],documentistas:['documentista','documento']};
   const roles=aliases[tipo]||[tipo];params.push(roles);where+=` AND LOWER(z.tipo)=ANY($${params.length}::text[])`;
  }else {
   const id=Number(b.destinatario_id);if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Selecione destinatário'},{status:400});
   params.push(id);where+=` AND z.id=$${params.length}`;
  }
  const {rows:dests}=await query(`SELECT DISTINCT z.id FROM public.usuarios z LEFT JOIN public.vendedores v ON v.id=z.vendedor_id WHERE ${where} LIMIT 300`,params);
  if(!dests.length)return NextResponse.json({error:'Destinatário fora da sua empresa/loja ou inexistente'},{status:403});
  const client=await getPool().connect();let criadas:any[]=[];
  try{await client.query('BEGIN');for(const d of dests){const {rows:[r]}=await client.query(`INSERT INTO public.tarefas(titulo,descricao,destinatario_id,criado_por_id) VALUES($1,$2,$3,$4) RETURNING *`,[titulo,desc,d.id,u.id]);criadas.push(r);}await client.query('COMMIT');}
  catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  await notificar({titulo:'Nova tarefa',mensagem:titulo,tipo:'tarefa',usuario_ids:dests.map((d:any)=>d.id)}).catch(()=>{});
  return NextResponse.json({ok:true,n:criadas.length,tarefas:criadas},{status:201});
 }catch(e:any){return NextResponse.json({error:e?.message||'Falha ao criar tarefa'},{status:500});}
}
export async function PATCH(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 try{const b=await req.json();const id=Number(b.id);if(!Number.isSafeInteger(id))return NextResponse.json({error:'ID inválido'},{status:400});
  const params:unknown[]=[b.resposta??null,b.observacao??null,id];const where=filtro(u,params);
  const row=await queryOne(`UPDATE public.tarefas t SET resposta=COALESCE($1,resposta), observacao=COALESCE($2,observacao),respondida_at=CASE WHEN $1 IS NOT NULL THEN NOW() ELSE respondida_at END,updated_at=NOW() WHERE t.id=$3 AND (${where}) RETURNING *`,params);
  if(!row)return NextResponse.json({error:'Tarefa inexistente ou sem permissão'},{status:403});return NextResponse.json(row);
 }catch(e:any){return NextResponse.json({error:e?.message||'Falha ao atualizar'},{status:500});}
}
export async function DELETE(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 if(!gestor(u))return NextResponse.json({error:'Sem permissão para excluir tarefas'},{status:403});
 try{
  const b=await req.json();const ids=[...new Set((Array.isArray(b.ids)?b.ids:[b.id]).map(Number))].filter(x=>Number.isSafeInteger(x)&&x>0);
  if(!ids.length||ids.length>100)return NextResponse.json({error:'Selecione de 1 a 100 tarefas'},{status:400});
  const params:unknown[]=[ids];const where=filtro(u,params);
  const {rows:found}=await query(`SELECT t.id FROM public.tarefas t WHERE t.id=ANY($1::bigint[]) AND (${where})`,params);
  if(found.length!==ids.length)return NextResponse.json({error:'Há tarefas de outra loja/empresa ou sem permissão. Nada foi excluído.'},{status:403});
  const {rows}=await query(`DELETE FROM public.tarefas WHERE id=ANY($1::bigint[]) RETURNING id`,[ids]);
  return NextResponse.json({ok:true,excluidas:rows.length});
 }catch(e:any){return NextResponse.json({error:e?.message||'Falha ao excluir tarefas'},{status:500});}
}
