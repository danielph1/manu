import {NextRequest,NextResponse} from 'next/server';
import {getPool,query} from '@/lib/db';
import {requireUser} from '@/lib/session';
import {auditarAlteracao} from '@/lib/auditoria';
import {FINALIDADES} from '@/lib/anuncio-coletivo';
export const runtime='nodejs';export const dynamic='force-dynamic';
const ROLES=new Set(['marketing','gerente','admin','superadmin']);
const allowed=new Set<string>(FINALIDADES);
const num=(x:unknown)=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0};
async function scope(req:NextRequest,empresa:unknown){
 const user=await requireUser(req);
 if(!user)return {error:NextResponse.json({error:'Não autenticado'},{status:401})} as const;
 if(!ROLES.has(user.tipo))return {error:NextResponse.json({error:'Acesso não autorizado'},{status:403})} as const;
 const empresaId=user.tipo==='superadmin'?num(empresa):num(user.empresa_id);
 if(!empresaId)return {error:NextResponse.json({error:'Selecione uma empresa'},{status:400})} as const;
 return {user,empresaId};
}
export async function GET(req:NextRequest){
 const sp=req.nextUrl.searchParams;const s=await scope(req,sp.get('empresa_id'));if('error'in s)return s.error;
 const busca=String(sp.get('busca')||'').trim().slice(0,80);
 if(busca.length<3)return NextResponse.json({leads:[]},{headers:{'Cache-Control':'private,no-store'}});
 try{
  const {rows}=await query(`SELECT l.id,l.nome_lead,l.produto_interesse,
     RIGHT(regexp_replace(COALESCE(l.telefone,''),'[^0-9]','','g'),4) AS telefone_final,
     COALESCE((SELECT array_agg(p.finalidade ORDER BY p.finalidade)
       FROM public.aurox_followup_permissoes p
       WHERE p.empresa_id=$1 AND p.lead_id=l.id AND p.revogado_em IS NULL),ARRAY[]::text[]) AS finalidades
   FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=$1
   WHERE (l.empresa_id=$1 OR l.empresa_id IS NULL)
     AND (l.nome_lead ILIKE $2 OR l.telefone ILIKE $2 OR COALESCE(l.produto_interesse,'') ILIKE $2)
   ORDER BY l.id DESC LIMIT 25`,[s.empresaId,`%${busca}%`]);
  return NextResponse.json({leads:rows},{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){console.error('[coletivo consentimentos GET]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha ao pesquisar contatos autorizados'},{status:503});}
}
export async function PATCH(req:NextRequest){
 const b=await req.json().catch(()=>null),s=await scope(req,b?.empresa_id);if('error'in s)return s.error;
 const leadId=num(b?.lead_id);
 const finalidades=[...new Set((Array.isArray(b?.finalidades)?b.finalidades:[]).map((v:unknown)=>String(v||'')))];
 if(!leadId||finalidades.length>FINALIDADES.length||finalidades.some(x=>!allowed.has(x)))
  return NextResponse.json({error:'Lead ou finalidades inválidas'},{status:400});
 const canal=String(b?.canal||'presencial');
 const data=new Date(String(b?.consentido_em||''));
 const evidencia=String(b?.evidencia||'').trim().slice(0,700);
 const declaracao=('Declaração autenticada: o titular autorizou esta empresa a comunicar as finalidades marcadas pelo canal WhatsApp. '+evidencia).slice(0,1000);
 if(!['presencial','whatsapp','ligacao','formulario','email','outro'].includes(canal)||
   !Number.isFinite(data.getTime())||data.getTime()>Date.now()||data.getTime()<new Date('2000-01-01').getTime())
  return NextResponse.json({error:'Informe canal e data/hora válidos'},{status:400});
 const db=await getPool().connect();
 try{
  await db.query('BEGIN');
  const {rows}=await db.query<{id:number;followup_optin:boolean}>(`SELECT l.id,l.followup_optin FROM public.leads l
    JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=$2
    WHERE l.id=$1 AND (l.empresa_id=$2 OR l.empresa_id IS NULL) FOR UPDATE OF l`,[leadId,s.empresaId]);
  const existing=rows[0];if(!existing){await db.query('ROLLBACK');return NextResponse.json({error:'Lead fora da empresa'},{status:403});}
  const current=await db.query<{finalidade:string}>(`SELECT finalidade FROM public.aurox_followup_permissoes
    WHERE empresa_id=$1 AND lead_id=$2 AND revogado_em IS NULL FOR UPDATE`,[s.empresaId,leadId]);
  const old=new Set(current.rows.map(x=>x.finalidade)),wanted=new Set(finalidades);
  const novos=finalidades.filter(x=>!old.has(x)),revogar=[...old].filter(x=>!wanted.has(x));
  if(novos.length&&b?.declarou!==true){await db.query('ROLLBACK');return NextResponse.json({error:'Confirme que o cliente realmente autorizou as novas finalidades'},{status:400});}
  if(novos.length){
   await db.query(`INSERT INTO public.aurox_followup_permissoes
       (empresa_id,lead_id,finalidade,canal,consentido_em,evidencia,registrado_por)
       SELECT $1,$2,x.finalidade,$4,$5::timestamptz,$6,$7
       FROM unnest($3::text[]) AS x(finalidade)`,
       [s.empresaId,leadId,novos,canal,data.toISOString(),declaracao,s.user.id]);
  }
  if(revogar.length){
   await db.query(`UPDATE public.aurox_followup_permissoes SET revogado_em=now(),revogado_por=$4
     WHERE empresa_id=$1 AND lead_id=$2 AND finalidade=ANY($3::text[]) AND revogado_em IS NULL`,
     [s.empresaId,leadId,revogar,s.user.id]);
  }
  const possui=finalidades.length>0;
  await db.query(`UPDATE public.leads SET followup_optin=$1,
    followup_optin_em=CASE WHEN $1 THEN COALESCE(followup_optin_em,now()) ELSE NULL END,
    followup_optin_origem=CASE WHEN $1 THEN COALESCE(followup_optin_origem,$2) ELSE NULL END,
    followup_optout_em=CASE WHEN $1 THEN NULL ELSE now() END WHERE id=$3`,
    [possui,'Autorização documentada pelo responsável via Anúncio Coletivo',leadId]);
  if(revogar.length){
   await db.query(`UPDATE public.aurox_followup_envios e SET estado='cancelado'
     FROM public.aurox_followup_campanhas c
     WHERE c.id=e.campanha_id AND c.empresa_id=e.empresa_id
       AND e.empresa_id=$1 AND e.lead_id=$2 AND e.estado='pendente'
       AND c.finalidade=ANY($3::text[])`,[s.empresaId,leadId,revogar]);
  }
  await auditarAlteracao(db,{usuario:s.user,empresaId:s.empresaId,recurso:'anuncio_coletivo_consentimento',recursoId:leadId,
    acao:'consentimento',resumo:`Autorizações atualizadas: ${novos.length} registradas e ${revogar.length} revogadas`,
    campos:['followup_optin'],antes:{followup_optin:existing.followup_optin},depois:{followup_optin:possui}});
  await db.query('COMMIT');
  return NextResponse.json({ok:true,finalidades},{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});const err=e as {code?:string};console.error('[coletivo consentimento]',err?.code||'erro');
   return NextResponse.json({error:'Falha ao atualizar autorização; confira migrations e auditoria'},{status:503});}
 finally{db.release();}
}
