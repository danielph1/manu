import crypto from 'crypto';

/**
 * Compatível com o Streamlit Manu:
 *   pbkdf2_sha256$ITER$SALT_HEX$HASH_HEX
 * Também aceita formato Django (hash em base64) e texto puro legado.
 */
export function verifyPassword(input: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const s = String(stored);

  // Texto puro (legado / testes)
  if (!s.includes('$')) {
    return input === s;
  }

  const parts = s.split('$');
  if (parts.length !== 4) return false;
  const [algo, iterStr, saltPart, hashPart] = parts;
  if (!algo.toLowerCase().startsWith('pbkdf2')) return false;

  const iterations = parseInt(iterStr, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  // Streamlit Manu: salt e hash em HEX
  if (/^[0-9a-f]+$/i.test(saltPart) && /^[0-9a-f]+$/i.test(hashPart)) {
    try {
      const salt = Buffer.from(saltPart, 'hex');
      const expected = Buffer.from(hashPart, 'hex');
      const derived = crypto.pbkdf2Sync(input, salt, iterations, expected.length, 'sha256');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  // Django: salt string + hash base64
  try {
    const expected = Buffer.from(hashPart, 'base64');
    const derived = crypto.pbkdf2Sync(input, saltPart, iterations, expected.length, 'sha256');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function hashPassword(password: string, iterations = 310_000): string {
  // Mesmo formato do Streamlit (hex)
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt.toString('hex')}$${derived.toString('hex')}`;
}
