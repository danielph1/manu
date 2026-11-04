import { query } from '@/lib/db';
import { phoneToZapi } from '@/lib/zapi';

/** Usa somente uma instância ativa, exclusiva e validada desta empresa. */
export async function enviarWhatsAppDaEmpresa(empresaId: number, telefone: string, texto: string) {
  if (!empresaId) return { ok: false, status: 'not_configured', message: 'Lead sem empresa definida.' };
  const { rows } = await query<{ empresa_id: number; external_id: string; access_token_enc: string; meta: any }>(
    `SELECT empresa_id, external_id, access_token_enc, meta FROM public.manu_conexoes_oauth
      WHERE empresa_id=$1 AND provedor='whatsapp_qr' AND status='conectado'
        AND COALESCE(meta->>'webhook_registered', 'false')='true'
      ORDER BY atualizado_em DESC LIMIT 2`, [empresaId],
  );
  if (rows.length !== 1) return { ok: false, status: 'not_configured', message: 'Nenhuma instância Z-API validada para esta empresa.' };
  const conn = rows[0];
  const instanceId = String(conn.external_id || '');
  const token = conn.access_token_enc;
  if (!instanceId || !token) return { ok: false, status: 'not_configured', message: 'Credenciais da instância incompletas.' };
  const owner = await query<{ empresa_id: number }>(
    `SELECT DISTINCT empresa_id FROM public.manu_conexoes_oauth
      WHERE provedor='whatsapp_qr' AND external_id=$1 AND status='conectado'`, [instanceId],
  );
  if (owner.rows.length !== 1 || Number(owner.rows[0].empresa_id) !== empresaId) {
    return { ok: false, status: 'configuration_conflict', message: 'Instância compartilhada por empresas diferentes. Reconecte uma instância exclusiva.' };
  }
  const phone = phoneToZapi(telefone);
  if (!/^\d{12,15}$/.test(phone)) return { ok: false, status: 'invalid_phone', message: 'Telefone do lead inválido para WhatsApp.' };
  try {
    const url = `https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}/send-text`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (conn.meta?.client_token) headers['Client-Token'] = String(conn.meta.client_token);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ phone, message: texto }),
      signal: AbortSignal.timeout(14000), cache: 'no-store' });
    if (!res.ok) return { ok: false, status: 'provider_error', message: `WhatsApp não enviou (Z-API HTTP ${res.status}).` };
    return { ok: true, status: 'sent_to_provider', message: 'Mensagem encaminhada à Z-API.' };
  } catch {
    return { ok: false, status: 'provider_error', message: 'Z-API indisponível. A mensagem foi salva no MANU.' };
  }
}
