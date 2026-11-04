/**
 * Conexão PostgreSQL reutilizada por instância de execução.
 *
 * Vercel / Supabase:
 *   DATABASE_URL deve apontar para Transaction pooler (Supavisor:6543).
 *   DB_POOL_MAX é opcional; por padrão, uma conexão por instância na Vercel.
 *
 * Nunca exponha DATABASE_URL no frontend / NEXT_PUBLIC_*. 
 */
import { Pool, QueryResultRow } from 'pg';

const globalForPg = globalThis as unknown as { __manuPool?: Pool };

function poolLimit(): number {
  const fallback = process.env.VERCEL ? 1 : 3;
  const configured = Number.parseInt(process.env.DB_POOL_MAX || '', 10);
  const requested = Number.isFinite(configured) && configured > 0 ? configured : fallback;
  return Math.min(Math.max(requested, 1), 4);
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL ausente no ambiente do servidor.');
  }

  const pool = new Pool({
    connectionString: url,
    // Mantido por compatibilidade com a configuração atual do MANU.
    // Idealmente, use o certificado CA oficial do Supabase em produção.
    ssl: { rejectUnauthorized: false },
    max: poolLimit(),
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  // Evita que um fechamento inesperado de conexão ociosa encerre o processo.
  pool.on('error', (err) => {
    console.error('[MANU DB] Erro em conexão ociosa:', err.message);
  });
  return pool;
}

export function getPool(): Pool {
  if (!globalForPg.__manuPool) {
    globalForPg.__manuPool = createPool();
  }
  return globalForPg.__manuPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
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
