import { query, queryOne } from '@/lib/db';
import { phoneToZapi } from '@/lib/zapi';
import { workerRequest } from './security';

type Delivery = { routed: boolean; ok: boolean; status: string; message: string };
export type AuroxAttachment = { base64: string; mime: string; filename?: string };
type Instance = { instancia_id: string; habilitada: boolean };
type Contact = { id: number; chat_id: string; lead_id: number | null; triagem_lead_id: number | null };

/**
 * Saída multiempresa: prioriza a sessão Aurox-WhatsApp ativa da empresa também
 * para leads MANUAIS (não é necessário que tenham chegado pelo WhatsApp).
 *
 * routed=false: não há instância Aurox habilitada; o chamador pode usar o
 * provedor legado. routed=true: NUNCA tentar Z-API como fallback automático.
 */
export async function sendAuroxMessage(
  empresaId: number, leadId: number, message: string, telefone?: string | null, media?: AuroxAttachment,
): Promise<Delivery> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || !Number.isSafeInteger(leadId) || leadId <= 0) {
    return { routed: true, ok: false, status: 'invalid_scope', message: 'Lead sem vínculo empresarial válido.' };
  }

  let instance: Instance | null;
  try {
    instance = await queryOne<Instance>(`
      SELECT i.instancia_id, i.habilitada
        FROM public.aurox_wa_instancias i
        JOIN public.empresas e ON e.id=i.empresa_id AND e.ativo=TRUE
       WHERE i.empresa_id=$1`, [empresaId]);
  } catch (error) {
    console.error('[Aurox-WhatsApp] falha ao consultar instância', error instanceof Error ? error.message : 'erro');
    // Falha do banco NÃO é autorização para tentar outro provedor.
    return { routed: true, ok: false, status: 'provider_error', message: 'Não foi possível verificar a conexão Aurox-WhatsApp da empresa.' };
  }
  if (!instance?.habilitada) {
    return { routed: false, ok: false, status: 'not_configured', message: 'Aurox-WhatsApp não habilitado nesta empresa.' };
  }

  let linked: Contact | null;
  try {
    linked = await queryOne<Contact>(`
      SELECT c.id, c.chat_id, c.lead_id, t.lead_id AS triagem_lead_id
        FROM public.aurox_wa_contatos c
        LEFT JOIN public.triagem t ON t.id=c.triagem_id AND t.empresa_id=c.empresa_id
       WHERE c.empresa_id=$1 AND (c.lead_id=$2 OR t.lead_id=$2)
       ORDER BY c.id DESC LIMIT 1`, [empresaId, leadId]);
  } catch (error) {
    console.error('[Aurox-WhatsApp] falha ao identificar contato', error instanceof Error ? error.message : 'erro');
    return { routed: true, ok: false, status: 'provider_error', message: 'Falha ao conferir o destinatário do WhatsApp.' };
  }

  let payload: { chat_id: string; message: string } | { phone: string; message: string };
  if (linked) {
    if (!/^\d{5,22}@(c\.us|lid)$/.test(linked.chat_id)) {
      return { routed: true, ok: false, status: 'invalid_phone', message: 'O contato vinculado ao lead não possui identificador WhatsApp válido.' };
    }
    payload = { chat_id: linked.chat_id, message };
  } else {
    const phone = phoneToZapi(telefone);
    if (!/^\d{12,15}$/.test(phone)) {
      return { routed: true, ok: false, status: 'invalid_phone', message: 'Cadastre um telefone válido com DDD no lead antes de enviar pelo Aurox-WhatsApp.' };
    }
    // Se o número já estiver vinculado a OUTRO lead nesta empresa, não
    // redirecionar silenciosamente a conversa para um cadastro diferente.
    let existing: {rows: Contact[]};
    try {
      existing = await query<Contact>(`
        SELECT c.id,c.chat_id,c.lead_id,t.lead_id AS triagem_lead_id
          FROM public.aurox_wa_contatos c
          LEFT JOIN public.triagem t ON t.id=c.triagem_id AND t.empresa_id=c.empresa_id
         WHERE c.empresa_id=$1 AND (c.telefone=$2 OR c.chat_id=$3)
         LIMIT 3`, [empresaId, phone, `${phone}@c.us`]);
    } catch {
      return { routed: true, ok: false, status: 'provider_error',
        message: 'Não foi possível conferir outros contatos com o mesmo número.' };
    }
    if (existing.rows.some(c => (c.lead_id && Number(c.lead_id) !== leadId)
        || (c.triagem_lead_id && Number(c.triagem_lead_id) !== leadId))) {
      return { routed: true, ok: false, status: 'contact_conflict',
        message: 'Este número já está associado a outro lead da empresa. Confira os cadastros antes de enviar.' };
    }
    payload = { phone, message };
  }

  try {
    const result = await workerRequest(`/v1/sessions/${empresaId}/send`, 'POST', {...payload,...(media?{media}:{})});
    if (!result?.ok || !result?.message_id) {
      return { routed: true, ok: false, status: 'provider_error', message: 'O Aurox-WhatsApp não confirmou o envio.' };
    }
    // O worker informa o ID resolvido pelo WhatsApp; útil quando o lead foi
    // cadastrado manualmente e nunca teve conversa recebida no MANU.
    const chatId = String(result.chat_id || (linked ? linked.chat_id : ''));
    if (/^\d{5,22}@(c\.us|lid)$/.test(chatId)) {
      try {
        const phone = 'phone' in payload ? payload.phone : (chatId.endsWith('@c.us') ? chatId.split('@')[0] : null);
        const contact = await queryOne<{id:number}>(`
          INSERT INTO public.aurox_wa_contatos (empresa_id,chat_id,telefone,nome,lead_id)
          VALUES ($1,$2,$3,'Contato WhatsApp',$4)
          ON CONFLICT (empresa_id,chat_id) DO UPDATE SET
            telefone=COALESCE(aurox_wa_contatos.telefone,EXCLUDED.telefone),
            lead_id=COALESCE(aurox_wa_contatos.lead_id,EXCLUDED.lead_id),
            ultima_mensagem_em=now()
          WHERE aurox_wa_contatos.lead_id IS NULL OR aurox_wa_contatos.lead_id=EXCLUDED.lead_id
          RETURNING id`, [empresaId,chatId,phone,leadId]);
        if (contact?.id) {
          await query(`INSERT INTO public.aurox_wa_mensagens
            (empresa_id,contato_id,mensagem_id,direcao,tipo,corpo)
            VALUES($1,$2,$3,'enviada',$5,$4)
            ON CONFLICT(empresa_id,mensagem_id) DO NOTHING`,
          [empresaId, contact.id, String(result.message_id), (message || (media?.mime.startsWith('audio/')?'[Áudio]':'[Foto]')).slice(0,4000), media?.mime.startsWith('audio/')?'audio':media?'image':'chat']);
        }
      } catch (error) {
        // O WhatsApp já aceitou o envio; falha de auditoria não deve ser
        // apresentada como falha de entrega para evitar retransmissão duplicada.
        console.warn('[Aurox-WhatsApp] mensagem aceita, mas histórico externo não gravado:',
          error instanceof Error ? error.message : 'erro');
      }
    }
    return { routed: true, ok: true, status: 'sent_to_provider',
      message: 'Mensagem enviada pelo Aurox-WhatsApp da empresa (entrega ao destinatário ainda não confirmada).' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    console.warn('[Aurox-WhatsApp] envio não concluído:', reason);
    return { routed: true, ok: false, status: 'provider_error',
      message: `Mensagem salva no MANU, mas não enviada pelo Aurox-WhatsApp: ${reason || 'verifique a conexão'}.` };
  }
}
