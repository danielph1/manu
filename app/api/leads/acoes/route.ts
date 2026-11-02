import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireUser } from '@/lib/session';
export const runtime='nodejs';
const GESTORES=new Set(['admin','gerente','marketing','superadmin']);
export async function POST(req:NextRequest){
 const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
 const b=await req.json().catch(()=>null);const acao=String(b?.acao||'');
 if(!['excluir','marcar_respondido','marcar_pendente'].includes(acao))return NextResponse.json({error:'Ação desconhecida'},{status:400});
 const ids=[...new Set((Array.isArray(b?.ids)?b.ids:[]).map(Number))].filter(x=>Number.isSafeInteger(x)&&x>0);
 if(!ids.length||ids.length>100)return NextResponse.json({error:'Selecione até 100 leads'},{status:400});
 if(!GESTORES.has(u.tipo))return NextResponse.json({error:'Ações em massa exigem cargo administrativo'},{status:403});
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const {rows}=await client.query(`SELECT l.id,v.empresa_id,v.loja FROM public.leads l LEFT JOIN public.vendedores v ON v.id=l.vendedor_id WHERE l.id=ANY($1::bigint[]) FOR UPDATE OF l`,[ids]);
  if(rows.length!==ids.length){await client.query('ROLLBACK');return NextResponse.json({error:'Algum lead não existe'},{status:404});}
  const autorizado=rows.every((r:any)=>u.tipo==='superadmin'||(
   u.empresa_id!=null&&r.empresa_id!=null&&Number(r.empresa_id)===Number(u.empresa_id)&&
   (u.tipo!=='gerente'||String(r.loja||'').toUpperCase()===String(u.loja||'').toUpperCase())
  ));
  if(!autorizado){await client.query('ROLLBACK');return NextResponse.json({error:'Um ou mais leads não pertencem à sua empresa/loja'},{status:403});}
  if(acao==='excluir') await client.query('DELETE FROM public.leads WHERE id=ANY($1::bigint[])',[ids]);
  else await client.query('UPDATE public.leads SET respondeu=$2 WHERE id=ANY($1::bigint[])',[ids,acao==='marcar_respondido']);
  await client.query('COMMIT');return NextResponse.json({ok:true,alterados:ids.length});
 }catch(e:any){await client.query('ROLLBACK').catch(()=>{});return NextResponse.json({error:'Não foi possível aplicar a ação em massa. '+String(e?.message||'').slice(0,130)},{status:500});}
 finally{client.release();}
}
