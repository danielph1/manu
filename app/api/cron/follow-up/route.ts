import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {getPool,query} from '@/lib/db';
import {sendAuroxMessage} from '@/lib/aurox-whatsapp/send';
export const runtime='nodejs';export const dynamic='force-dynamic';
const equal=(a:string,b:string)=>!!a&&!!b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function businessTime(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const day=p.find(v=>v.type==='weekday')?.value||'';const hour=Number(p.find(v=>v.type==='hour')?.value||-1);
 return !['Sat','Sun'].includes(day)&&hour>=9&&hour<18;
}
export async function GET(req:NextRequest){
 const supplied=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
 const expected=process.env.FOLLOWUP_DISPATCH_SECRET||process.env.PUSH_DISPATCH_SECRET||'';
 if(expected.length<32||!equal(supplied,expected))return NextResponse.json({error:'Não autorizado'},{status:401});
 if(!businessTime())return NextResponse.json({ok:true,pausado:'fora do horário comercial'});
 const pool=getPool(),db=await pool.connect();let id=0,leadId=0,empresaId=0,conteudo='';
 try{
  await db.query('BEGIN');
  const {rows}=await db.query<{id:number;empresa_id:number;lead_id:number;texto:string}>(`
    SELECT e.id,e.empresa_id,e.lead_id,e.texto
    FROM public.aurox_followup_envios e
    JOIN public.aurox_followup_campanhas c ON c.id=e.campanha_id AND c.empresa_id=e.empresa_id AND c.estado='ativa'
    JOIN public.leads l ON l.id=e.lead_id AND l.empresa_id=e.empresa_id AND l.followup_optin=TRUE AND l.followup_optout_em IS NULL
      AND (l.followup_status IN ('followup','recusado') OR
        (l.followup_status IS NULL AND EXISTS (SELECT 1 FROM public.fichas_credito f
          WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
          AND LOWER(COALESCE(f.status_geral,''))~'^(negad|recus|reprov)')))
    JOIN public.empresas emp ON emp.id=e.empresa_id AND emp.ativo=TRUE
    -- Envio de resposta apenas enquanto há conversa recente; novos contatos exigem modelo aprovado na API oficial.
    WHERE e.estado='pendente' AND e.agendado_em<=now()
      AND EXISTS (SELECT 1 FROM public.aurox_wa_contatos cont JOIN public.aurox_wa_mensagens msg
        ON msg.contato_id=cont.id AND msg.empresa_id=cont.empresa_id
        WHERE cont.empresa_id=e.empresa_id AND cont.lead_id=e.lead_id AND msg.direcao='recebida' AND msg.recebida_em>=now()-interval '24 hours')
      AND NOT EXISTS(SELECT 1 FROM public.aurox_followup_envios recent
        WHERE recent.empresa_id=e.empresa_id AND recent.estado='enviado' AND recent.processado_em>now()-interval '2 minutes')
    ORDER BY e.agendado_em,e.id LIMIT 12 FOR UPDATE OF e SKIP LOCKED`);
  let picked:typeof rows[number]|undefined;
  for(const job of rows){
   await db.query(`INSERT INTO public.aurox_followup_cadencia(empresa_id,ultima_reserva_em) VALUES($1,NULL) ON CONFLICT DO NOTHING`,[job.empresa_id]);
   const last=await db.query<{ultima_reserva_em:string|null}>(`SELECT ultima_reserva_em FROM public.aurox_followup_cadencia WHERE empresa_id=$1 FOR UPDATE`,[job.empresa_id]);
   const ts=last.rows[0]?.ultima_reserva_em?new Date(last.rows[0].ultima_reserva_em).getTime():0;
   if(ts&&Date.now()-ts<120000)continue;
   const quota=await db.query<{total:number}>(`SELECT COUNT(*)::int AS total FROM public.aurox_followup_envios WHERE empresa_id=$1 AND estado='enviado' AND processado_em>now()-interval '24 hours'`,[job.empresa_id]);
   if(Number(quota.rows[0]?.total||0)>=30)continue;
   picked=job;break;
  }
  if(!picked){await db.query('COMMIT');return NextResponse.json({ok:true,processados:0});}
  id=picked.id;leadId=picked.lead_id;empresaId=picked.empresa_id;conteudo=picked.texto;
  await db.query(`UPDATE public.aurox_followup_envios SET estado='processando' WHERE id=$1`,[id]);
  await db.query(`UPDATE public.aurox_followup_cadencia SET ultima_reserva_em=now() WHERE empresa_id=$1`,[empresaId]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('[followup fila]',e instanceof Error?e.message:'erro');return NextResponse.json({error:'Falha ao consultar fila'},{status:503});}
 finally{db.release();}
 // Revalidar consentimento imediatamente antes de iniciar qualquer contato.
 try{
  const chk=await query<{telefone:string|null}>(`SELECT l.telefone FROM public.leads l JOIN public.vendedores v ON v.id=l.vendedor_id
   WHERE l.id=$1 AND l.empresa_id=$2 AND v.empresa_id=$2 AND l.followup_optin=TRUE AND l.followup_optout_em IS NULL
     AND EXISTS (SELECT 1 FROM public.aurox_wa_contatos c JOIN public.aurox_wa_mensagens m
       ON m.contato_id=c.id AND m.empresa_id=c.empresa_id WHERE c.empresa_id=$2 AND c.lead_id=l.id
       AND m.direcao='recebida' AND m.recebida_em>=now()-interval '24 hours')
     AND (l.followup_status IN ('followup','recusado') OR (l.followup_status IS NULL AND EXISTS (
      SELECT 1 FROM public.fichas_credito f WHERE f.id=(SELECT MAX(f2.id) FROM public.fichas_credito f2 WHERE f2.lead_id=l.id)
      AND LOWER(COALESCE(f.status_geral,''))~'^(negad|recus|reprov)')))`,[leadId,empresaId]);
  if(!chk.rows.length){await query(`UPDATE public.aurox_followup_envios SET estado='ignorado',processado_em=now(),erro='Consentimento ou vínculo removido' WHERE id=$1`,[id]);return NextResponse.json({ok:true,processados:1,ignorados:1});}
  const result=await sendAuroxMessage(empresaId,leadId,conteudo,chk.rows[0].telefone);
  // Qualquer falha fica para revisão MANUAL. Não retentar automaticamente mensagens cujo envio possa ter sido aceito.
  await query(`UPDATE public.aurox_followup_envios SET estado=$2,processado_em=now(),erro=$3 WHERE id=$1`,
   [id,result.ok?'enviado':'erro',result.ok?null:String(result.status||'falha').slice(0,120)]);
  return NextResponse.json({ok:true,processados:1,enviados:Number(result.ok),erros:Number(!result.ok)});
 }catch(e){console.error('[followup envio]',e instanceof Error?e.message:'erro');
  await query(`UPDATE public.aurox_followup_envios SET estado='erro',processado_em=now(),erro='Falha incerta: confira histórico antes de reenviar' WHERE id=$1`,[id]).catch(()=>{});
  return NextResponse.json({error:'Envio incerto, sem nova tentativa automática'},{status:503});}
}
