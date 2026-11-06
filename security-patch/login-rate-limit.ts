/** Rate limiting durável em Postgres; funciona entre instâncias serverless do Vercel. */
import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { query } from '@/lib/db';

function chave(v: string) {
  const segredo = process.env.AUTH_RATE_LIMIT_SECRET || process.env.JWT_SECRET;
  if (!segredo || segredo.length < 24) throw new Error('AUTH_RATE_LIMIT_SECRET/JWT_SECRET precisa ter pelo menos 24 caracteres');
  return createHmac('sha256', segredo).update(v).digest('hex');
}
function chaves(req: NextRequest, login: string) {
  const addr = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ks = [{ k: chave('account:' + login.toLowerCase()), max: 8 }];
  if (addr && addr.length <= 64) ks.push({ k: chave('ip:' + addr), max: 40 });
  return ks;
}
export async function bloqueioLogin(req: NextRequest, login: string): Promise<boolean> {
  const ks = chaves(req, login);
  const {rows}=await query<{bloqueado:boolean}>(
    `SELECT (bloqueado_ate > now()) AS bloqueado FROM public.aurox_auth_tentativas WHERE chave = ANY($1::text[])`,
    [ks.map(x=>x.k)]);
  return rows.some(x=>x.bloqueado);
}
export async function registrarFalhaLogin(req: NextRequest, login: string) {
  for(const {k,max} of chaves(req,login)) {
    await query(`INSERT INTO public.aurox_auth_tentativas(chave,tentativas,inicio_janela,bloqueado_ate)
      VALUES($1,1,now(),NULL)
      ON CONFLICT(chave) DO UPDATE SET
      tentativas=CASE WHEN aurox_auth_tentativas.inicio_janela < now()-interval '15 minutes'
        THEN 1 ELSE aurox_auth_tentativas.tentativas+1 END,
      inicio_janela=CASE WHEN aurox_auth_tentativas.inicio_janela < now()-interval '15 minutes'
        THEN now() ELSE aurox_auth_tentativas.inicio_janela END,
      bloqueado_ate=CASE WHEN aurox_auth_tentativas.inicio_janela < now()-interval '15 minutes' THEN NULL
        WHEN aurox_auth_tentativas.tentativas+1 >= $2 THEN now()+interval '15 minutes'
        ELSE aurox_auth_tentativas.bloqueado_ate END`, [k,max]);
  }
}
export async function limparFalhasLogin(_req: NextRequest, login: string) {
  // Reset apenas do usuário, não do IP (evita contornar limite global com sucessos sucessivos).
  await query('DELETE FROM public.aurox_auth_tentativas WHERE chave=$1', [chave('account:'+login.toLowerCase())]);
}
