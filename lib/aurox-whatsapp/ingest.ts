import { getPool } from '@/lib/db';

export type IncomingEvent = {
  type: 'message'; empresa_id: number; instancia_id: string;
  message_id: string; chat_id: string; phone?: string | null;
  name?: string | null; body?: string; message_type?: string;
};
export function isDirectChat(chatId: string): boolean {
  return /^\d{5,22}@(c\.us|lid)$/.test(chatId);
}
export function cleanPhone(value: string | null | undefined): string | null {
  const p = (value || '').replace(/\D/g, '');
  return p.length >= 10 && p.length <= 15 ? p : null;
}

/** Uma transacao: mensagem deduplicada, contato unico e triagem inicial por EMPRESA. */
export async function processIncoming(ev: IncomingEvent) {
  if (!isDirectChat(ev.chat_id)) return { ok: true, ignored: true };
  if (!ev.message_id || ev.message_id.length > 170) throw new Error('message_id inválido');
  if (typeof ev.body !== 'string' || ev.body.length > 4000) throw new Error('mensagem inválida');
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    // Bloqueia qualquer envio quando a instancia perdeu vinculo ou empresa foi desativada.
    const owner = await db.query(
      `SELECT i.empresa_id, i.saudacao_ativa, i.saudacao
        FROM public.aurox_wa_instancias i JOIN public.empresas e ON e.id=i.empresa_id
       WHERE i.empresa_id=$1 AND i.instancia_id=$2 AND i.habilitada AND e.ativo=TRUE
       FOR UPDATE OF i`, [ev.empresa_id, ev.instancia_id],
    );
    if (!owner.rowCount) { await db.query('ROLLBACK'); return { ok:false, error:'Instância não pertence à empresa ativa' }; }

    const name = String(ev.name || '').trim().slice(0, 150) || 'Contato WhatsApp';
    const phone = cleanPhone(ev.phone) || (ev.chat_id.endsWith('@c.us') ? cleanPhone(ev.chat_id.split('@')[0]) : null);
    const contact = await db.query(
      `INSERT INTO public.aurox_wa_contatos(empresa_id, chat_id, telefone, nome)
       VALUES ($1,$2,$3,$4) ON CONFLICT(empresa_id,chat_id) DO UPDATE
       SET nome=CASE WHEN EXCLUDED.nome<>'Contato WhatsApp' THEN EXCLUDED.nome ELSE aurox_wa_contatos.nome END,
           telefone=COALESCE(aurox_wa_contatos.telefone,EXCLUDED.telefone),ultima_mensagem_em=now()
       RETURNING id,triagem_id,lead_id`, [ev.empresa_id, ev.chat_id, phone, name],
    );
    const cid = Number(contact.rows[0].id);
    const saved = await db.query(
      `INSERT INTO public.aurox_wa_mensagens (empresa_id,contato_id,mensagem_id,tipo,corpo)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (empresa_id,mensagem_id) DO NOTHING RETURNING id`,
      [ev.empresa_id,cid,ev.message_id,String(ev.message_type || 'chat').slice(0,40),ev.body],
    );
    if (!saved.rowCount) { await db.query('COMMIT'); return { ok:true, duplicate:true, welcome:null }; }

    let triagemId: number | null = contact.rows[0].triagem_id ? Number(contact.rows[0].triagem_id) : null;
    let leadId: number | null = contact.rows[0].lead_id ? Number(contact.rows[0].lead_id) : null;
    let firstContact = false;
    if (triagemId && !leadId) {
      const tri = await db.query(`SELECT status,lead_id FROM public.triagem WHERE id=$1 AND empresa_id=$2`,[triagemId,ev.empresa_id]);
      if (tri.rows[0]?.lead_id) leadId = Number(tri.rows[0].lead_id);
    }
    if (!triagemId && !leadId) {
      // Nunca busca contatos de outra empresa. Novo chat gera 1 lead de triagem.
      const tri = await db.query(
        `INSERT INTO public.triagem(empresa_id,nome,telefone,origem,mensagem,status)
         VALUES ($1,$2,$3,'aurox-whatsapp',$4,'aguardando') RETURNING id`,
        [ev.empresa_id,name,phone,String(ev.body || '[Mensagem recebida]').slice(0,2000)],
      );
      triagemId = Number(tri.rows[0].id);
      firstContact = true;
    } else if (triagemId && !leadId) {
      // Preserva o texto inicial, sem criar outra linha na triagem.
      await db.query(`UPDATE public.triagem SET mensagem=LEFT(CONCAT_WS(E'\n',NULLIF(mensagem,''),$1),8000)
        WHERE id=$2 AND empresa_id=$3 AND status='aguardando'`,[String(ev.body || '[Mensagem]').slice(0,2000),triagemId,ev.empresa_id]);
    }
    if (leadId) {
      await db.query(`INSERT INTO public.chat_geral_mensagens(remetente_id,lead_id,mensagem)
        VALUES(NULL,$1,$2)`,[leadId,`[Aurox-WhatsApp] ${String(ev.body || '[Mídia]').slice(0,2000)}`]);
    }
    await db.query(`UPDATE public.aurox_wa_contatos SET triagem_id=$1,lead_id=$2 WHERE id=$3 AND empresa_id=$4`,
      [triagemId,leadId,cid,ev.empresa_id]);
    await db.query(`UPDATE public.aurox_wa_instancias SET ultima_mensagem_em=now(), atualizado_em=now()
      WHERE empresa_id=$1 AND instancia_id=$2`,[ev.empresa_id,ev.instancia_id]);
    await db.query('COMMIT');
    return {ok:true, triagem_id:triagemId, lead_id:leadId, new_contact:firstContact,
      welcome:firstContact && owner.rows[0].saudacao_ativa ? owner.rows[0].saudacao : null};
  } catch(e) { await db.query('ROLLBACK').catch(()=>{}); throw e; }
  finally {db.release();}
}
