/**
 * PostgreSQL para Next.js serverless (Vercel) + Supabase Supavisor.
 *
 * Dois níveis de pooling:
 *   - pg.Pool: reuso local APENAS na instância Node.js atual;
 *   - Supavisor transaction pooler (:6543): compartilha conexões reais do
 *     PostgreSQL entre instâncias serverless. Evite db.*:5432 em produção.
 *
 * Configure DATABASE_POOLER_URL no servidor (não usar NEXT_PUBLIC_).
 * Consultas sem "name" (prepared statements nomeados) são compatíveis com
 * o pooler compartilhado em modo Transaction.
 */
import { Pool, type QueryResultRow } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

type GlobalPg = typeof globalThis & { __manuPool?: Pool };
const globalPg = globalThis as GlobalPg;

function limite(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}`);
  }
  return n;
}

function connectionString(): string {
  const url = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Configure DATABASE_POOLER_URL (Supabase Connect > Transaction pooler, porta 6543).');
  }
  let u: URL;
  try { u = new URL(url); }
  catch { throw new Error('URL do banco inválida. Copie a string completa do Supabase Connect.'); }
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') {
    throw new Error('Banco deve utilizar uma URL postgresql:// ou postgres://.');
  }

  if (process.env.NODE_ENV === 'production') {
    const hostname = u.hostname.toLowerCase();
    const pooled = u.port === '6543' && (
      hostname.endsWith('.pooler.supabase.com') ||
      /^db\.[a-z0-9-]+\.supabase\.co$/.test(hostname)
    );
    if (!pooled) {
      throw new Error(
        'Conexão direta bloqueada em produção. Configure DATABASE_POOLER_URL com a URL Transaction pooler (:6543) do Supabase, não a db.*:5432.',
      );
    }
    if (u.searchParams.get('sslmode') === 'disable') {
      throw new Error('SSL não pode ser desabilitado em produção.');
    }
  }
  return url;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: connectionString(),
    // Autenticação TLS do pooler. Se precisar CA customizada, instale-a no servidor.
    ssl: { rejectUnauthorized: true },
    max: limite('PG_POOL_MAX', 2, 1, 4),
    min: 0,
    idleTimeoutMillis: limite('PG_IDLE_TIMEOUT_MS', 5_000, 1_000, 20_000),
    connectionTimeoutMillis: limite('PG_CONNECT_TIMEOUT_MS', 5_000, 1_000, 20_000),
    query_timeout: limite('PG_QUERY_TIMEOUT_MS', 25_000, 1_000, 60_000),
    statement_timeout: limite('PG_STATEMENT_TIMEOUT_MS', 20_000, 1_000, 60_000),
    idle_in_transaction_session_timeout: limite('PG_IDLE_TX_TIMEOUT_MS', 30_000, 1_000, 120_000),
    maxLifetimeSeconds: limite('PG_CONNECTION_LIFETIME_S', 120, 20, 600),
    allowExitOnIdle: true,
    keepAlive: true,
  });
  // Na Vercel Fluid Compute, fecha conexões ociosas ANTES da função suspender.
  // Em desenvolvimento local o hook não é registrado.
  if (process.env.VERCEL === '1') attachDatabasePool(pool);
  // Evita "unhandled error" de sockets ociosos encerrados pelo NAT/pooler.
  pool.on('error', (error: Error) => {
    console.error('[PostgreSQL] conexão ociosa encerrada:', error.message);
  });
  return pool;
}

export function getPool(): Pool {
  if (!globalPg.__manuPool) globalPg.__manuPool = createPool();
  return globalPg.__manuPool;
}

/** Para encerramento explícito em testes e workers Node de longa duração. */
export async function closePool(): Promise<void> {
  const pool = globalPg.__manuPool;
  if (!pool) return;
  globalPg.__manuPool = undefined;
  await pool.end();
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  // pool.query pega uma conexão e a devolve automaticamente após cada consulta.
  // Não passar "name": prepared statements nomeados não funcionam no Supavisor Transaction.
  const res = await getPool().query<T>(text, params);
  return { rows: res.rows, rowCount: res.rowCount ?? 0 };
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] ?? null;
}
