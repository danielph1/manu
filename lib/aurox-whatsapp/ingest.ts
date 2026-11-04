import { getPool } from '@/lib/db';

export type IncomingEvent = {
  type: 'message'; empresa_id:number; instancia_id:string;
  message_id:string; chat_id:string; phone?:string|null;
  name?:string|null; body?:string; message_type?:string;
  media_path?:string|null; media_mime?:string|null; media_size?:number|null;
};
export function isDirectChat(chatId:string):boolean {
  return /^\d{5,22}@(c\.us|lid)$/.test(chatId);
}
export function cleanPhone(value:string|null|undefined):string|null {
  const phone=(value||'').replace(/\D/g,'');
  return phone.length>=10 && phone.length<=15 ? phone : null;
}
function normalizeBrazilPhone(phone:string):string {
  const digits=phone.replace(/\D/g,'');
  return digits.startsWith('55') && [12,13].includes(digits.length) ? digits.slice(2) : digits;
}

/** Retorna a ID somente quando um UNICO lead da empresa possui esse telefone. */
async function existingLead(client:any,empresaId:number,phone:string|null):Promise<number|null> {
  if (!phone) return null;
  const clean=normalizeBrazilPhone(phone);
  if (clean.length<10 || clean.length>11) return null;
  const result=await client.query(`
    SELECT l.id FROM public.leads l
    LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
    WHERE COALESCE(l.empresa_id,v.empresa_id)=$1
      AND (CASE WHEN LEFT(REGEXP_REPLACE(COALESCE(l.telefone,''),'[^0-9]','','g'),2)='55'
                  AND LENGTH(REGEXP_REPLACE(COALESCE(l.telefone,''),'[^0-9]','','g')) IN (12,13)
            THEN SUBSTRING(REGEXP_REPLACE(COALESCE(l.telefone,''),'[^0-9]','','g') FROM 3)
            ELSE REGEXP_REPLACE(COALESCE(l.telefone,''),'[^0-9]','','g') END)=$2
    ORDER BY l.id DESC LIMIT 2`,[empresaId,clean]);
  return result.rows.length===1 ? Number(result.rows[0].id) : null;
}

/** Empresa, contato, evento e primeira triagem gravados na mesma transacao. */
export async function processIncoming(ev:IncomingEvent) {
  if (!isDirectChat(ev.chat_id)) return {ok:true,ignored:true};
  if (!/^[a-f0-9]{64}$/i.test(ev.message_id)) throw new Error('message_id inválido');
  if (typeof ev.body!=='string' || ev.body.length>4000) throw new Error('mensagem inválida');
  const msgType=String(ev.message_type||'chat').toLowerCase();
  if (msgType==='video') return {ok:true,ignored:true};
  const allowedMime=/^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|aac|webm))$/;
  const mediaMime=String(ev.media_mime||'').toLowerCase();
  const hasMedia=Boolean(ev.media_path && allowedMime.test(mediaMime)
    && Number.isSafeInteger(ev.media_size) && Number(ev.media_size)>0
    && Number(ev.media_size)<=8*1024*1024
    && String(ev.media_path).startsWith(`${ev.empresa_id}/${ev.instancia_id}/${ev.message_id}.`)
    && ['image','audio','ptt'].includes(msgType));
  const body=ev.body.trim() || (msgType==='image'?'[Foto recebida]':
    ['audio','ptt'].includes(msgType)?'[Áudio recebido]':'[Mensagem recebida]');
  const db=await getPool().connect();
  try {
    await db.query('BEGIN');
    const owner=await db.query(`SELECT i.empresa_id,i.saudacao_ativa,i.saudacao
      FROM public.aurox_wa_instancias i JOIN public.empresas e ON e.id=i.empresa_id
      WHERE i.empresa_id=$1 AND i.instancia_id=$2 AND i.habilitada AND e.ativo=TRUE
      FOR UPDATE OF i`,[ev.empresa_id,ev.instancia_id]);
    if (!owner.rowCount) {await db.query('ROLLBACK');return {ok:false,error:'Instância não pertence à empresa ativa'};}
    const name=String(ev.name||'').trim().slice(0,150)||'Contato WhatsApp';
    const phone=cleanPhone(ev.phone)||(ev.chat_id.endsWith('@c.us')?cleanPhone(ev.chat_id.split('@')[0]):null);
    const contact=await db.query(`
      INSERT INTO public.aurox_wa_contatos(empresa_id,chat_id,telefone,nome)
      VALUES($1,$2,$3,$4)
      ON CONFLICT(empresa_id,chat_id) DO UPDATE SET
        nome=CASE WHEN EXCLUDED.nome<>'Contato WhatsApp' THEN EXCLUDED.nome ELSE aurox_wa_contatos.nome END,
        telefone=COALESCE(aurox_wa_contatos.telefone,EXCLUDED.telefone),
        ultima_mensagem_em=now()
      RETURNING id,triagem_id,lead_id`,[ev.empresa_id,ev.chat_id,phone,name]);
    const contactId=Number(contact.rows[0].id);
    const saved=await db.query(`
      INSERT INTO public.aurox_wa_mensagens
        (empresa_id,contato_id,mensagem_id,tipo,corpo,media_path,media_mime,media_size)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(empresa_id,mensagem_id) DO NOTHING RETURNING id`,
      [ev.empresa_id,contactId,ev.message_id,msgType.slice(0,40),body,
       hasMedia?ev.media_path:null,hasMedia?mediaMime:null,hasMedia?ev.media_size:null]);
    if (!saved.rowCount) {await db.query('COMMIT');return {ok:true,duplicate:true,welcome:null};}
    let triagemId=contact.rows[0].triagem_id?Number(contact.rows[0].triagem_id):null;
    let leadId=contact.rows[0].lead_id?Number(contact.rows[0].lead_id):null;
    // Um ID de lead antigo/corrompido nunca pode cruzar empresas.
    if (leadId) {
      const validated=await db.query(`SELECT l.id FROM public.leads l
        LEFT JOIN public.vendedores v ON v.id=l.vendedor_id
        WHERE l.id=$1 AND COALESCE(l.empresa_id,v.empresa_id)=$2`,[leadId,ev.empresa_id]);
      if (!validated.rows.length) leadId=null;
    }
    if (triagemId && !leadId) {
      const tri=await db.query(`SELECT status,lead_id FROM public.triagem
        WHERE id=$1 AND empresa_id=$2`,[triagemId,ev.empresa_id]);
      if (!tri.rows.length) triagemId=null;
      else if (tri.rows[0].lead_id) leadId=Number(tri.rows[0].lead_id);
      else if (tri.rows[0].status!=='aguardando') triagemId=null;
    }
    // O contato pode existir no WhatsApp ha anos: o criterio e existir ou nao no MANU.
    if (!leadId && phone) leadId=await existingLead(db,ev.empresa_id,phone);
    if (!leadId && !triagemId && phone) {
      const norm=normalizeBrazilPhone(phone);
      const candidates=await db.query(`SELECT id FROM public.triagem
        WHERE empresa_id=$1 AND status='aguardando'
          AND (CASE WHEN LEFT(REGEXP_REPLACE(COALESCE(telefone,''),'[^0-9]','','g'),2)='55'
                    AND LENGTH(REGEXP_REPLACE(COALESCE(telefone,''),'[^0-9]','','g')) IN (12,13)
                THEN SUBSTRING(REGEXP_REPLACE(COALESCE(telefone,''),'[^0-9]','','g') FROM 3)
                ELSE REGEXP_REPLACE(COALESCE(telefone,''),'[^0-9]','','g') END)=$2
        LIMIT 2`,[ev.empresa_id,norm]);
      if(candidates.rows.length===1)triagemId=Number(candidates.rows[0].id);
    }
    let firstContact=false;
    if (!leadId && !triagemId) {
      const tri=await db.query(`INSERT INTO public.triagem
        (empresa_id,nome,telefone,origem,mensagem,status)
        VALUES($1,$2,$3,'aurox-whatsapp',$4,'aguardando') RETURNING id`,
        [ev.empresa_id,name,phone,body.slice(0,2000)]);
      triagemId=Number(tri.rows[0].id);
      firstContact=true;
    } else if (triagemId && !leadId) {
      await db.query(`UPDATE public.triagem SET
        mensagem=LEFT(CONCAT_WS(E'\n',NULLIF(mensagem,''),$1),8000),
        nome=CASE WHEN (nome IS NULL OR nome='Contato WhatsApp') AND $2<>'Contato WhatsApp' THEN $2 ELSE nome END,
        telefone=COALESCE(telefone,$3)
        WHERE id=$4 AND empresa_id=$5 AND status='aguardando'`,
        [body.slice(0,2000),name,phone,triagemId,ev.empresa_id]);
    }
    if (leadId && triagemId) {
      // Se o contato ja era lead, nao deixar uma triagem antiga pendurada.
      await db.query(`UPDATE public.triagem SET status='atribuido',lead_id=$1,
        vendedor_id=(SELECT vendedor_id FROM public.leads WHERE id=$1)
        WHERE id=$2 AND empresa_id=$3 AND status='aguardando'`,
        [leadId,triagemId,ev.empresa_id]);
    }
    if (leadId) {
      // Um erro no chat nao pode impedir o processamento do evento nem gerar duplicidade.
      await db.query('SAVEPOINT chat_optional');
      try {
        await db.query(`INSERT INTO public.chat_geral_mensagens(remetente_id,lead_id,mensagem)
          VALUES(NULL,$1,$2)`,[leadId,`[Aurox-WhatsApp] ${body.slice(0,2000)}`]);
      }catch {await db.query('ROLLBACK TO SAVEPOINT chat_optional');}
      await db.query('RELEASE SAVEPOINT chat_optional');
    }
    await db.query(`UPDATE public.aurox_wa_contatos SET triagem_id=$1,lead_id=$2
      WHERE id=$3 AND empresa_id=$4`,[triagemId,leadId,contactId,ev.empresa_id]);
    await db.query(`UPDATE public.aurox_wa_instancias SET ultima_mensagem_em=now(),atualizado_em=now()
      WHERE empresa_id=$1 AND instancia_id=$2`,[ev.empresa_id,ev.instancia_id]);
    await db.query('COMMIT');
    return {ok:true,triagem_id:triagemId,lead_id:leadId,new_contact:firstContact,
      welcome:firstContact && owner.rows[0].saudacao_ativa?owner.rows[0].saudacao:null};
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{db.release();}
}
