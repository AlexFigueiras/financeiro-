import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

/**
 * Pool preguiçoso: só é criado na PRIMEIRA query, nunca no import do módulo.
 * Em ambiente serverless (Vercel) isso evita que a função quebre logo na
 * inicialização caso alguma variável de ambiente esteja ausente — o erro passa
 * a ser tratável no handler, em vez de virar FUNCTION_INVOCATION_FAILED.
 */
let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
    // Baixo de propósito: em serverless cada instância mantém seu próprio pool,
    // e muitas instâncias concorrentes podem esgotar o limite de conexões do
    // Postgres. Com Supabase, use a connection string do "Transaction pooler"
    // (porta 6543) em DATABASE_URL.
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  _pool.on('error', (err) => {
    // Erro em conexão ociosa do pool — loga sem derrubar o processo.
    console.error('[pg] erro em conexão ociosa do pool:', err.message);
  });
  return _pool;
}

/** Fachada compatível com o uso anterior (`pool.query`, `pool.connect`). */
export const pool = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return getPool().query<T>(text, params as never);
  },
  connect(): Promise<PoolClient> {
    return getPool().connect();
  },
  /** Encerra o pool (usado por scripts de vida curta, como a migração). */
  async end(): Promise<void> {
    if (_pool) {
      await _pool.end();
      _pool = null;
    }
  },
};

/** Executa uma função dentro de uma transação com commit/rollback automáticos. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
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
