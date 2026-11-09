/**
 * Teste de 20 operações SQL concorrentes usando um pequeno pool LOCAL.
 * Execute somente em homologação. NÃO representa 20 conexões físicas ao Postgres:
 * a fila do pg.Pool e o Supavisor compartilham conexões reais.
 * Não registra URLs, logins nem senhas.
 */
import pg from 'pg';
const url = process.env.DATABASE_POOLER_URL;
if (!url) {
  console.error('Defina DATABASE_POOLER_URL no .env.local de homologação (Supavisor Transaction :6543).');
  process.exit(2);
}
const u = new URL(url);
if (u.port !== '6543' || !u.hostname.endsWith('.pooler.supabase.com')) {
  console.error('Teste exige Supavisor compartilhado em modo Transaction (porta 6543).');
  process.exit(2);
}
const max = Number(process.env.PG_POOL_MAX || 2);
if (!Number.isSafeInteger(max) || max < 1 || max > 4) {
  console.error('PG_POOL_MAX precisa estar entre 1 e 4 para este teste.');
  process.exit(2);
}
const pool = new pg.Pool({
  connectionString: url, ssl: { rejectUnauthorized: true },
  max, min: 0, idleTimeoutMillis: 1_000,
  connectionTimeoutMillis: 5_000, query_timeout: 10_000,
  allowExitOnIdle: true,
});
pool.on('error', e => console.warn('[pool] Conexão ociosa encerrada:', e.code || 'erro'));
let success = 0, failed = 0;
const start = performance.now();
try {
  const tasks = Array.from({ length: 20 }, () => pool.query('SELECT 1 AS ok')
    .then(result => { if (Number(result.rows[0]?.ok) !== 1) throw Error('SELECT não respondeu 1'); success++; })
    .catch(e => { failed++; console.error('Operação SQL falhou:', e.code || 'erro'); }));
  await Promise.all(tasks);
  console.log(`Resultado: ${success}/20 operações concluídas; falhas: ${failed}; tempo: ${Math.round(performance.now()-start)}ms; máximo local: ${max} conexões por processo.`);
  console.log('Isto valida concorrência de chamadas, NÃO 20 conexões físicas nem capacidade de 20 usuários reais. Para isso, medir HTTP e métricas do Supabase.');
  if (failed) process.exitCode=1;
} finally {
  await pool.end();
}
