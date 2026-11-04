import { createHmac, timingSafeEqual } from 'node:crypto';

function chave() { const s = process.env.MANU_WEBHOOK_SIGNING_SECRET || ''; return s.length >= 32 ? s : null; }
export function zapiAssinatura(conexaoId: string, instancia: string) {
  const secret = chave();
  if (!secret) throw new Error('MANU_WEBHOOK_SIGNING_SECRET (mínimo 32 caracteres) não configurado');
  return createHmac('sha256', secret).update(`zapi:${conexaoId}:${instancia}`).digest('hex');
}
export function validarZapiAssinatura(conexaoId: string, instancia: string, received: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  let expected: string;
  try { expected = zapiAssinatura(conexaoId, instancia); } catch { return false; }
  return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
