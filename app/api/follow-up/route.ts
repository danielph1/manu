import { NextRequest,NextResponse } from 'next/server';
import { query, getPool } from '@/lib/db';
import {auditarAlteracao} from '@/lib/auditoria';
import { requireUser } from '@/lib/session';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const VIEW=new Set(['vendedor','gerente','admin','superadmin']);
const MANAGE=new Set(['gerente','admin','superadmin']);
const positive=(x:unknown)=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0};
const rejected=`EXISTS (SELECT 1 FROM public.fichas_credito f WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
 AND LOWER(COALESCE(f.status_geral,'')) ~ '^(negad|recus|reprov)')`;

async function scope(req:NextRequest,requestEmpresa:unknown){
 const u=await requireUser(req);
 if(!u)return {error:NextResponse.json({error:'Não autenticado'},{status:401})} as const;
 if(!VIEW.has(u.tipo))return {error:NextResponse.json({error:'Sem permissão'},{status:403})} as const;
 const empresaId=u.tipo==='superadmin'?positive(requestEmpresa):positive(u.empresa_id);
 if(!empresaId)return {error:NextResponse.json({error:'Selecione a empresa'},{status:400})} as const;
 if(u.tipo==='vendedor'&&!positive(u.vendedor_id))return {error:NextResponse.json({error:'Vendedor sem vínculo'},{status:403})} as const;
 return {u,empresaId};
}
export async function GET(req:NextRequest){
 const s=await scope(req,req.nextUrl.searchParams.get('empresa_id'));if('error'in s)return s.error;
 const {u,empresaId}=s;
 try{
  const vendedor=positive(req.nextUrl.searchParams.get('vendedor_id'));
  const params:unknown[]=[empresaId];
  let filtro=`(l.empresa_id=$1 OR (l.empresa_id IS NULL AND v.empresa_id=$1)) AND v.empresa_id=$1
    AND (l.followup_status IN ('followup','recusado') OR ${rejected})`;
  if(u.tipo==='vendedor'){params.push(u.vendedor_id);filtro+=` AND l.vendedor_id=$${params.length}`;}
  if(vendedor&&MANAGE.has(u.tipo)){params.push(vendedor);filtro+=` AND l.vendedor_id=$${params.length}`;}
  const {rows}=await query(`SELECT l.id,l.nome_lead,l.telefone,l.produto_interesse,l.followup_status,l.followup_motivo,
    l.followup_em,l.followup_optin,l.followup_optin_origem,l.followup_optout_em,
    v.id AS vendedor_id,v.nome AS vendedor_nome,v.loja,
    (SELECT f.status_geral FROM public.fichas_credito f WHERE f.lead_id=l.id ORDER BY f.id DESC LIMIT 1) AS status_ficha
    FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id
    WHERE ${filtro} ORDER BY COALESCE(l.followup_em,l.data_lead::timestamp) DESC,l.id DESC LIMIT 300`,params);
  return NextResponse.json({leads:rows,empresa_id:empresaId,pode_enviar:MANAGE.has(u.tipo)}, {headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error('[followup GET]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha ao carregar Follow Up. Execute a migration.'},{status:503});}
}
export async function PATCH(req:NextRequest){
 const b=await req.json().catch(()=>null);const s=await scope(req,b?.empresa_id);if('error'in s)return s.error;
 const {u,empresaId}=s;
 const id=positive(b?.lead_id),action=String(b?.acao||'');
 if(!id||!['mover','recusar','restaurar','consentimento'].includes(action))return NextResponse.json({error:'Ação inválida'},{status:400});
 const motivo=String(b?.motivo||'').trim().slice(0,400);
 if(action==='consentimento'&&b?.aceito===true&&(!MANAGE.has(u.tipo)||String(b?.origem||'').trim().length<8))
  return NextResponse.json({error:'Somente gestor pode registrar consentimento, indicando a origem verificável'},{status:403});
 if(action==='consentimento'&&typeof b?.aceito!=='boolean')return NextResponse.json({error:'Informe se o cliente autorizou'},{status:400});
 const db=await getPool().connect();
 try{
  await db.query('BEGIN');
  const params:unknown[]=[id,empresaId];let seller='';
  if(u.tipo==='vendedor'){params.push(u.vendedor_id);seller=' AND l.vendedor_id=$3';}
  const found=await db.query<{id:number;followup_status:string|null;followup_optin:boolean}>(`SELECT l.id,l.followup_status,l.followup_optin
    FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id
    WHERE l.id=$1 AND v.empresa_id=$2 AND (l.empresa_id=$2 OR l.empresa_id IS NULL) ${seller}
    FOR UPDATE OF l`,params);
  const old=found.rows[0];if(!old){await db.query('ROLLBACK');return NextResponse.json({error:'Lead fora da sua empresa ou carteira'},{status:403});}
  if(action==='restaurar'){
   const r=await db.query<{status_geral:string|null}>(`SELECT status_geral FROM public.fichas_credito WHERE lead_id=$1 ORDER BY id DESC LIMIT 1`,[id]);
   if(/^(negad|recus|reprov)/i.test(String(r.rows[0]?.status_geral||''))){
    await db.query('ROLLBACK');return NextResponse.json({error:'Crédito recusado: mantenha no Follow Up até atualizar a situação da ficha.'},{status:409});
   }
  }
  let campos:string[]=[],antes:Record<string,unknown>={},depois:Record<string,unknown>={},acaoAudit=action;
  if(action==='consentimento'){
   await db.query(`UPDATE public.leads SET followup_optin=$1,followup_optin_origem=$2,
     followup_optin_em=CASE WHEN $1 THEN now() ELSE NULL END,
     followup_optout_em=CASE WHEN $1 THEN NULL ELSE now() END WHERE id=$3`,
    [b.aceito===true,b.aceito===true?String(b.origem).trim().slice(0,250):null,id]);
   campos=['followup_optin'];antes={followup_optin:old.followup_optin};depois={followup_optin:b.aceito===true};
  }else{
   const status=action==='restaurar'?'na_fila':action==='recusar'?'recusado':'followup';
   await db.query(`UPDATE public.leads SET followup_status=$1,followup_motivo=$2,followup_por=$3,followup_em=now() WHERE id=$4`,
    [status,motivo||null,u.id,id]);
   campos=['followup_status'];antes={followup_status:old.followup_status};depois={followup_status:status};
  }
  if(action==='restaurar'||(action==='consentimento'&&b.aceito===false))
   await db.query(`UPDATE public.aurox_followup_envios SET estado='cancelado'
    WHERE empresa_id=$1 AND lead_id=$2 AND estado='pendente'`,[empresaId,id]);
  await auditarAlteracao(db,{usuario:u,empresaId,recurso:'leads',recursoId:id,acao:acaoAudit,
    resumo:action==='consentimento'?'Autorização de contato atualizada':action==='restaurar'?'Lead restaurado ao painel':action==='recusar'?'Lead recusado':'Lead enviado ao Follow Up',
    campos,antes,depois});
  await db.query('COMMIT');
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[followup PATCH]',e instanceof Error?e.message:'erro');
  return NextResponse.json({error:'Não foi possível salvar e auditar a alteração. Verifique a migration.'},{status:503});}
 finally{db.release();}
}
