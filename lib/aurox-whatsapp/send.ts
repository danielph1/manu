import { query, queryOne } from '@/lib/db';
import { workerRequest } from './security';

/** Uma resposta pode sair só pelo WhatsApp exato que originou o lead.
 *  routed=false significa que o lead não pertence ao Aurox-WhatsApp.
 */
export async function sendAuroxMessage(empresaId: number, leadId: number, message: string) {
  let row: {id:number;chat_id:string;instancia_id:string;numero:string|null} | null;
  try { row = await queryOne<{id:number;chat_id:string;instancia_id:string;numero:string|null}>(`
    SELECT c.id,c.chat_id,i.instancia_id,i.numero
      FROM public.aurox_wa_contatos c
      JOIN public.aurox_wa_instancias i ON i.empresa_id=c.empresa_id
      LEFT JOIN public.triagem t ON t.id=c.triagem_id AND t.empresa_id=c.empresa_id
     WHERE c.empresa_id=$1 AND (c.lead_id=$2 OR t.lead_id=$2)
     ORDER BY c.id DESC LIMIT 1`,[empresaId,leadId]); } catch (e) {
    // Não quebrar chat antigo se a nova migration ainda não estiver aplicada.
    console.warn('[Aurox-WhatsApp] tabelas não disponíveis para envio');
    return {routed:false,ok:false,status:'not_configured',message:'Aurox-WhatsApp não configurado'};
  }
  if(!row) return {routed:false,ok:false,status:'not_aurox_whatsapp',message:'Lead de outro canal'};
  const alive = await queryOne<{habilitada:boolean}>(`
    SELECT habilitada FROM public.aurox_wa_instancias
      WHERE empresa_id=$1 AND instancia_id=$2`,[empresaId,row.instancia_id]);
  if(!alive?.habilitada) return {routed:true,ok:false,status:'not_configured',message:'Conexão Aurox-WhatsApp desta empresa desativada'};
  try {
    const result=await workerRequest(`/v1/sessions/${empresaId}/send`,'POST',{chat_id:row.chat_id,message});
    if(result.ok && result.message_id) {
      try {
        await query(`INSERT INTO public.aurox_wa_mensagens
          (empresa_id,contato_id,mensagem_id,direcao,corpo)
          VALUES($1,$2,$3,'enviada',$4)
          ON CONFLICT(empresa_id,mensagem_id) DO NOTHING`,
          [empresaId,row.id,result.message_id,message.slice(0,4000)]);
      } catch(e) { console.warn('[Aurox-WhatsApp] Enviada, mas falhou o log da mensagem.'); }
    }
    return {routed:true,ok:true,status:'sent_to_provider',message:'Enviada pelo Aurox-WhatsApp da empresa'};
  }catch {
    return {routed:true,ok:false,status:'provider_error',message:'Mensagem salva no MANU, mas não enviada: verifique a conexão Aurox-WhatsApp'};
  }
}
