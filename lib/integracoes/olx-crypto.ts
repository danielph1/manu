import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getKey(): Buffer {
  const value = process.env.MANU_OAUTH_ENCRYPTION_KEY || '';
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('MANU_OAUTH_ENCRYPTION_KEY: configure 32 bytes em base64 no servidor');
  return key;
}

/** Criptografia autenticada das credenciais: nunca armazenar senha da loja. */
export function encryptOlxToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',getKey(),iv);
  const ct = Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ct.toString('base64url')}`;
}
export function decryptOlxToken(encoded: string): string {
  const [ver,iv,tag,ct] = encoded.split(':');
  if (ver!=='v1' || !iv || !tag || !ct) throw new Error('Token OLX armazenado fora do formato atual');
  const decipher = createDecipheriv('aes-256-gcm',getKey(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct,'base64url')),decipher.final()]).toString('utf8');
}
