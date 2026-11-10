import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {getPool,query} from '@/lib/db';
import {sendAuroxMessage,type AuroxAttachment} from '@/lib/aurox-whatsapp/send';
import {supabaseAdmin} from '@/lib/supabase';
import {BUCKET_COLETIVO,MIDIAS,validaMidia,type MimeColetivo} from '@/lib/anuncio-coletivo';
export const runtime='nodejs';export const dynamic='force-dynamic';
const equal=(a:string,b:string)=>!!a&&!!b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function businessTime(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const day=p.find(v=>v.type==='weekday')?.value||'';const hour=Number(p.find(v=>v.type==='hour')?.value||-1);
 return !['Sat','Sun'].includes(day)&&hour>=9&&hour<18;
}
/** Mark a campaign complete only when no queued/in-flight dispatch remains. Read-only GETs never mutate the database. */
async function concluirCampanhas(empresaId?:number,campanhaId?:number){
 await query(`UPDATE public.aurox_followup_campanhas c SET estado='concluida'
   WHERE c.estado='ativa' AND ($1::integer IS NULL OR c.empresa_id=$1)
     AND ($2::bigint IS NULL OR c.id=$2)
     AND EXISTS (SELECT 1 FROM public.aurox_followup_envios e WHERE e.campanha_id=c.id AND e.empresa_id=c.empresa_id)
     AND NOT EXISTS (SELECT 1 FROM public.aurox_followup_envios e WHERE e.campanha_id=c.id
       AND e.empresa_id=c.empresa_id AND e.estado IN ('pendente','processando'))`,[empresaId||null,campanhaId||null]);
}
export async function GET(req:NextRequest){
 const supplied=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
 const expected=process.env.FOLLOWUP_DISPATCH_SECRET||process.env.PUSH_DISPATCH_SECRET||'';
 if(expected.length<32||!equal(supplied,expected))return NextResponse.json({error:'Não autorizado'},{status:401});
 if(process.env.FOLLOWUP_BUSINESS_HOURS_ONLY==='1'&&!businessTime())return NextResponse.json({ok:true,pausado:'fora do horário comercial'});
 const pool=getPool(),db=await pool.connect();let id=0,leadId=0,empresaId=0,campanhaId=0,conteudo='';
 let mediaPath:string|null=null,mediaMime:MimeColetivo|null=null,mediaNome:string|null=null,iniciouEnvio=false;
 try{
  await db.query('BEGIN');
  const {rows}=await db.query<{id:number;empresa_id:number;lead_id:number;campanha_id:number;texto:string;media_path:string|null;media_mime:MimeColetivo|null;media_nome:string|null}>(`
    SELECT e.id,e.empresa_id,e.lead_id,e.campanha_id,e.texto,c.media_path,c.media_mime,c.media_nome
    FROM public.aurox_followup_envios e
    JOIN public.aurox_followup_campanhas c ON c.id=e.campanha_id AND c.empresa_id=e.empresa_id AND c.estado='ativa'
    JOIN public.leads l ON l.id=e.lead_id AND l.followup_optin=TRUE AND l.followup_optout_em IS NULL
    JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=e.empresa_id
    JOIN public.aurox_followup_permissoes cp ON cp.empresa_id=e.empresa_id AND cp.lead_id=l.id AND cp.finalidade=c.finalidade AND cp.revogado_em IS NULL
      AND (c.origem='coletivo' OR l.followup_status IN ('followup','recusado') OR
        (l.followup_status IS NULL AND EXISTS (SELECT 1 FROM public.fichas_credito f
          WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
          AND LOWER(COALESCE(f.status_geral,''))~'^(negad|recus|reprov)')))
    JOIN public.empresas emp ON emp.id=e.empresa_id AND emp.ativo=TRUE
    -- Autorizacao declarada tem validade imediata; envio pelo WhatsApp QR pode estar sujeito
    -- a restricoes do provedor. Nao confundir consentimento com janela de atendimento (24h).
    WHERE e.estado='pendente' AND e.agendado_em<=now() AND (l.empresa_id=e.empresa_id OR l.empresa_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM public.aurox_followup_envios recent
        WHERE recent.empresa_id=e.empresa_id AND recent.estado IN ('enviado','incerto','confirmado_manual') AND recent.processado_em>now()-interval '2 minutes')
    ORDER BY e.agendado_em,e.id LIMIT 12 FOR UPDATE OF e SKIP LOCKED`);
  let picked:typeof rows[number]|undefined;
  for(const job of rows){
   await db.query(`INSERT INTO public.aurox_followup_cadencia(empresa_id,ultima_reserva_em) VALUES($1,NULL) ON CONFLICT DO NOTHING`,[job.empresa_id]);
   const last=await db.query<{ultima_reserva_em:string|null}>(`SELECT ultima_reserva_em FROM public.aurox_followup_cadencia WHERE empresa_id=$1 FOR UPDATE`,[job.empresa_id]);
   const ts=last.rows[0]?.ultima_reserva_em?new Date(last.rows[0].ultima_reserva_em).getTime():0;
   if(ts&&Date.now()-ts<120000)continue;
   const quota=await db.query<{total:number}>(`SELECT COUNT(*)::int AS total FROM public.aurox_followup_envios WHERE empresa_id=$1 AND estado IN ('enviado','incerto','confirmado_manual') AND processado_em>now()-interval '24 hours'`,[job.empresa_id]);
   if(Number(quota.rows[0]?.total||0)>=30)continue;
   picked=job;break;
  }
  if(!picked){await db.query('COMMIT');return NextResponse.json({ok:true,processados:0});}
  id=picked.id;leadId=picked.lead_id;empresaId=picked.empresa_id;campanhaId=picked.campanha_id;conteudo=picked.texto;
  mediaPath=picked.media_path;mediaMime=picked.media_mime;mediaNome=picked.media_nome;
  await db.query(`UPDATE public.aurox_followup_envios SET estado='processando' WHERE id=$1`,[id]);
  await db.query(`UPDATE public.aurox_followup_cadencia SET ultima_reserva_em=now() WHERE empresa_id=$1`,[empresaId]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[followup fila]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha ao consultar fila'},{status:503});}
 finally{db.release();}
 // Revalidar consentimento imediatamente antes de iniciar qualquer contato.
 try{
  // AUROX_FIX_REVALIDACAO_COLETIVO_20261110
  // A origem deve pertencer ao JOIN visivel nesta consulta, nunca a um alias dentro do EXISTS.
  const chk=await query<{telefone:string|null}>(`SELECT l.telefone FROM public.leads l
   JOIN public.vendedores v ON v.id=l.vendedor_id AND v.empresa_id=$2
   JOIN public.aurox_followup_envios e ON e.id=$3 AND e.empresa_id=$2 AND e.lead_id=l.id AND e.estado='processando'
   JOIN public.aurox_followup_campanhas c ON c.id=e.campanha_id AND c.empresa_id=e.empresa_id AND c.estado='ativa'
   WHERE l.id=$1 AND (l.empresa_id=$2 OR l.empresa_id IS NULL)
     AND l.followup_optin=TRUE AND l.followup_optout_em IS NULL
     AND EXISTS (SELECT 1 FROM public.aurox_followup_permissoes cp
       WHERE cp.empresa_id=$2 AND cp.lead_id=l.id AND cp.finalidade=c.finalidade AND cp.revogado_em IS NULL)
     AND (c.origem='coletivo' OR l.followup_status IN ('followup','recusado') OR
       (l.followup_status IS NULL AND EXISTS (SELECT 1 FROM public.fichas_credito f
        WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
          AND LOWER(COALESCE(f.status_geral,''))~'^(negad|recus|reprov)')))`,[leadId,empresaId,id]);
  if(!chk.rows.length){
   await query(`UPDATE public.aurox_followup_envios SET estado='ignorado',processado_em=now(),erro='Consentimento ou vínculo removido' WHERE id=$1 AND estado='processando'`,[id]);
   await concluirCampanhas(empresaId,campanhaId);
   return NextResponse.json({ok:true,processados:1,ignorados:1});
  }
  let attachment:AuroxAttachment|undefined;
  if(mediaPath){
   if(!mediaMime||!(mediaMime in MIDIAS)||
      !new RegExp(`^coletivo/${empresaId}/[0-9a-f-]{36}\\.(jpg|png|mp4)$`,'i').test(mediaPath))
     throw new Error('Midia da campanha invalida antes de transmitir');
   const {data,error}=await supabaseAdmin.storage.from(BUCKET_COLETIVO).download(mediaPath);
   if(error||!data)throw new Error('Midia da campanha indisponivel no Storage');
   const bytes=Buffer.from(await data.arrayBuffer());
   if(bytes.length<100||bytes.length>MIDIAS[mediaMime].max||!validaMidia(bytes,mediaMime))
     throw new Error('Midia nao passou pela validacao de tamanho e formato');
   attachment={mime:mediaMime,base64:bytes.toString('base64'),filename:mediaNome||'campanha'};
  }
  iniciouEnvio=true;
  const result=await sendAuroxMessage(empresaId,leadId,conteudo,chk.rows[0].telefone,attachment);
  // A resposta HTTP do worker é a única confirmação técnica. Se ela não chegou,
  // o WhatsApp pode ter aceitado a mensagem: estado 'incerto', NUNCA reenviar automaticamente.
  const estado=result.ok?'enviado':result.status==='provider_error'?'incerto':'erro';
  await query(`UPDATE public.aurox_followup_envios SET estado=$2,processado_em=now(),erro=$3
    WHERE id=$1 AND estado='processando'`,
   [id,estado,result.ok?null:String(result.status||'falha').slice(0,120)]);
  await concluirCampanhas(empresaId,campanhaId);
  return NextResponse.json({ok:true,processados:1,enviados:Number(result.ok),
    incertos:Number(estado==='incerto'),erros:Number(estado==='erro')});
 }catch(e){console.error('[followup envio]',e instanceof Error?e.message:'erro');
  await query(`UPDATE public.aurox_followup_envios SET estado=$2,processado_em=now(),
    erro=$3 WHERE id=$1 AND estado='processando'`,
    [id,iniciouEnvio?'incerto':'erro',iniciouEnvio?'Confirmação não recebida: confira WhatsApp':'Falha antes do envio: banco, elegibilidade ou mídia; confira logs']).catch(()=>{});
  await concluirCampanhas(empresaId,campanhaId).catch(()=>{});
  return NextResponse.json({error:iniciouEnvio?'Envio incerto, sem nova tentativa automática':'Falha antes do envio; verifique a mídia'},{status:503});}
}
