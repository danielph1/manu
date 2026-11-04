import { createHmac, timingSafeEqual } from 'node:crypto';

export function workerSecret(): string {
  const s = process.env.AUROX_WA_WORKER_SECRET || '';
  if (s.length < 32) throw new Error('AUROX_WA_WORKER_SECRET precisa de 32+ caracteres');
  return s;
}
export function authorizedWorker(header: string | null): boolean {
  const secret = workerSecret();
  const received = (header || '').replace(/^Bearer\s+/i, '');
  if (Buffer.byteLength(received) !== Buffer.byteLength(secret)) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(secret));
}
export function validateWorkerSignature(raw: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature || !/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > 300_000) return false;
  const expected = createHmac('sha256', workerSecret()).update(`${timestamp}.${raw}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}
export function workerUrl(path: string): string {
  const raw = process.env.AUROX_WA_WORKER_URL || '';
  if (!raw) throw new Error('Configure AUROX_WA_WORKER_URL no servidor');
  const u = new URL(raw);
  if (u.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(u.hostname))) {
    throw new Error('A URL do worker precisa usar HTTPS');
  }
  return `${u.origin}${path}`;
}
export async function workerRequest(path: string, method: 'GET'|'POST', payload?: object) {
  const r = await fetch(workerUrl(path), {
    method,
    headers: { Authorization: `Bearer ${workerSecret()}`, 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(payload || {}) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(data.error || `Worker HTTP ${r.status}`).slice(0, 220));
  return data;
}
