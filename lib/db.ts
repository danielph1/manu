/**
 * Pool PostgreSQL do MANU em ambiente serverless.
 * - Na Vercel exige Supavisor Transaction (porta 6543).
 * - Reutiliza um pool pequeno por instância, NÃO um cliente por usuário/logado.
 * - Fecha conexões ociosas e avisa Vercel Fluid Compute do ciclo de vida.
 * - Nunca expõe URLs/credenciais em erros.
 */
import { Pool, type QueryResultRow } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

type PgGlobal = typeof globalThis & { __manuPool?: Pool };
const globalForPg = globalThis as PgGlobal;

function boundedEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`Configuração inválida: ${name} deve estar entre ${min} e ${max}.`);
  }
  return n;
}

function connectionString(): string {
  const production = process.env.NODE_ENV === 'production';
  // Em produção, não permitir fallback silencioso para DATABASE_URL em modo sessão.
  const raw = process.env.DATABASE_POOLER_URL?.trim()
    || (!production ? process.env.DATABASE_URL?.trim() : '');
  if (!raw) throw new Error(production
    ? 'DATABASE_POOLER_URL ausente no servidor. Copie Transaction pooler (6543) do Supabase e faça Redeploy.'
    : 'Configure DATABASE_POOLER_URL ou DATABASE_URL no .env.local.');
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new Error('A URL de conexão PostgreSQL está malformada.'); }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error('A URL do banco deve começar por postgresql://.');
  }
  if (production && (parsed.port !== '6543' || !parsed.hostname.endsWith('.pooler.supabase.com'))) {
    throw new Error('Use Supabase Transaction pooler (host *.pooler.supabase.com, porta 6543) em produção; Session 5432 esgota conexões.');
  }
  return raw;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: connectionString(),
    // Mantém o comportamento TLS preexistente; configurar CA/validação em etapa própria.
    ssl: { rejectUnauthorized: false },
    max: boundedEnv('PG_POOL_MAX', 1, 1, 4),
    min: 0,
    idleTimeoutMillis: boundedEnv('PG_IDLE_TIMEOUT_MS', 5_000, 1_000, 30_000),
    connectionTimeoutMillis: boundedEnv('PG_CONNECT_TIMEOUT_MS', 5_000, 1_000, 15_000),
    statement_timeout: boundedEnv('PG_STATEMENT_TIMEOUT_MS', 20_000, 5_000, 60_000),
    query_timeout: boundedEnv('PG_QUERY_TIMEOUT_MS', 25_000, 5_000, 65_000),
    maxLifetimeSeconds: boundedEnv('PG_MAX_LIFETIME_SECONDS', 120, 30, 600),
  });
  // Erros de clientes ociosos não podem encerrar o processo Node.
  pool.on('error', (e) => console.error('[MANU PostgreSQL] conexão ociosa encerrada:', e.message));
  // Permite ao Vercel Fluid Compute liberar conexões antes de suspender a instância.
  if (process.env.VERCEL === '1') attachDatabasePool(pool);
  return pool;
}

export function getPool(): Pool {
  if (!globalForPg.__manuPool) globalForPg.__manuPool = createPool();
  return globalForPg.__manuPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await getPool().query<T>(text, params);
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] ?? null;
}
