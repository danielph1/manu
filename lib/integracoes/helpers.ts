import { createHash, randomBytes } from 'node:crypto';

export function gerarToken(): string {
  return randomBytes(32).toString('hex');
}
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function urlWebhook(id: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(base.replace(/\/$/, ''))) {
    throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL para gerar URLs da Edge Function');
  }
  return `${base.replace(/\/$/, '')}/functions/v1/manu-webhook/${id}/${token}`;
}
export function validarMapeamento(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const permitido = new Set(['nome','telefone','email','interesse','mensagem','id_externo']);
  const o: Record<string, string> = {};
  for (const [k, item] of Object.entries(v)) {
    if (!permitido.has(k) || typeof item !== 'string') return null;
    const path = item.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*){0,5}$/.test(path)) return null;
    o[k] = path;
  }
  return o;
}
