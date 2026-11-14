import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PAPEIS_CAIXA, resolverEscopoMetricas } from '@/lib/metricas/escopo';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req: NextRequest) {
  const u=await requireUser(req); if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  if(!PAPEIS_CAIXA.has(String(u.tipo||'').toLowerCase()))return NextResponse.json({error:'Finanças restritas a admin e superadmin'},{status:403});
  let sc:ReturnType<typeof resolverEscopoMetricas>;
  try{sc=resolverEscopoMetricas(u,req.nextUrl.searchParams.get('empresa_id'),req.nextUrl.searchParams.get('loja'));}
  catch{return NextResponse.json({error:'Empresa ou permissão inválida'},{status:403});}
  const p:unknown[]=[sc.empresaId];let w='empresa_id=$1';if(sc.loja){p.push(sc.loja);w+=` AND UPPER(loja)=$${p.length}`;}
  try {const {rows}=await query(`SELECT id,loja,tipo,status,categoria,descricao,valor,data_movimento,origem_tipo,origem_id
    FROM public.manu_movimentos_caixa WHERE ${w} ORDER BY data_movimento DESC,id DESC LIMIT 100`,p);
    return NextResponse.json(rows,{headers:{'Cache-Control':'private, no-store'}});
  } catch{return NextResponse.json({error:'Razão de caixa indisponível. Execute a migration 202611040001_metricas_caixa.sql'},{status:503});}
}

export async function POST(req: NextRequest) {
  const u=await requireUser(req);if(!u)return NextResponse.json({error:'Não autenticado'},{status:401});
  if(!PAPEIS_CAIXA.has(String(u.tipo||'').toLowerCase()))return NextResponse.json({error:'Somente admin ou superadmin registra liquidações'},{status:403});
  const body=await req.json().catch(()=>null);
  let sc:ReturnType<typeof resolverEscopoMetricas>;
  try{sc=resolverEscopoMetricas(u,body?.empresa_id,body?.loja);}catch{return NextResponse.json({error:'Empresa inválida'},{status:403});}
  const loja=String(body?.loja||sc.loja||'').trim().toUpperCase();
  if(!loja||loja.length>40||(sc.loja&&sc.loja!==loja))return NextResponse.json({error:'Loja obrigatória'},{status:400});
  const tipo=String(body?.tipo||'');const status=String(body?.status||'confirmado');
  const categoria=String(body?.categoria||'').trim().slice(0,80);
  const descricao=String(body?.descricao||'').trim().slice(0,1000);
  const valor=Number(body?.valor);const data=String(body?.data_movimento||'');
  if(!['entrada','saida'].includes(tipo)||!['confirmado','previsto','cancelado'].includes(status)||
    !categoria||!Number.isFinite(valor)||valor<=0||valor>1e12||!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return NextResponse.json({error:'Tipo, categoria, data ou valor inválido'},{status:400});
  try{
    const lojaValida=await queryOne(`SELECT id FROM public.lojas WHERE empresa_id=$1 AND UPPER(codigo)=$2`,[sc.empresaId,loja]);
    if(!lojaValida)return NextResponse.json({error:'Loja não pertence à empresa selecionada'},{status:403});
    const r=await queryOne(`INSERT INTO public.manu_movimentos_caixa
      (empresa_id,loja,tipo,status,categoria,descricao,valor,data_movimento,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [sc.empresaId,loja,tipo,status,categoria,descricao,Math.round(valor*100)/100,data,u.id]);
    return NextResponse.json({ok:true,id:r?.id},{status:201});
  }catch(e){console.error('[caixa] inserir',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Não foi possível registrar. Verifique a migration.'},{status:500});}
}
