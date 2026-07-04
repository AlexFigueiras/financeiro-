import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  // Baixo de propósito: em ambiente serverless (Vercel) cada instância da
  // função mantém seu próprio pool, e muitas instâncias concorrentes podem
  // esgotar o limite de conexões do Postgres. Se estiver no Supabase, use a
  // connection string do "Transaction pooler" (porta 6543) em DATABASE_URL.
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // Erro em conexão ociosa do pool — loga sem derrubar o processo.
  console.error('[pg] erro em conexão ociosa do pool:', err.message);
});

/** Executa uma função dentro de uma transação com commit/rollback automáticos. */
export async function withTransaction<T>(
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
