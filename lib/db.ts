/**
 * Conexão direta com Postgres (Supabase).
 * Usa DATABASE_URL do .env — mesma base do Streamlit.
 * Preferível para testar; depois pode migrar trechos para API/RLS.
 */
import { Pool, QueryResultRow } from 'pg';

const globalForPg = globalThis as unknown as { __manuPool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL ausente no .env (postgresql://postgres:...@db.xxx.supabase.co:5432/postgres)',
    );
  }
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30_000,
  });
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
  const pool = getPool();
  const res = await pool.query<T>(text, params);
  return { rows: res.rows, rowCount: res.rowCount ?? 0 };
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] ?? null;
}
