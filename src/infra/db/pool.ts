import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../../shared/config/env';
import { loggerDe } from '../../shared/observability/logger';

const log = loggerDe('db');

/**
 * Pool preguiçoso: só é criado na PRIMEIRA query, nunca no import do módulo.
 * Em ambiente serverless (Vercel) isso evita que a função quebre logo na
 * inicialização caso alguma variável de ambiente esteja ausente — o erro passa
 * a ser tratável no handler, em vez de virar FUNCTION_INVOCATION_FAILED.
 */
let _pool: Pool | null = null;

function configurarSsl(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!env.databaseSsl) return false;
  if (!env.databaseSslRejectUnauthorized) {
    // Lei 7 (fail-secure): validar o certificado é o padrão. Desligar é uma
    // decisão explícita do operador — deixa rastro no log toda vez que o pool nasce.
    log.warn(
      'DATABASE_SSL_REJECT_UNAUTHORIZED=false — conexão TLS SEM validação de certificado. ' +
        'Baixe o CA do Supabase (Settings → Database → SSL) e configure DATABASE_CA_CERT.'
    );
    return { rejectUnauthorized: false };
  }

  let ca = env.databaseCaCert;
  if (ca) {
    ca = ca.trim();
    if (ca.startsWith('"') && ca.endsWith('"')) {
      ca = ca.slice(1, -1);
    }
    ca = ca.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  }

  return { rejectUnauthorized: true, ca };
}

function getPool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: configurarSsl() || undefined,
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
    log.error({ err: err.message }, 'erro em conexão ociosa do pool');
  });
  return _pool;
}

/** Fachada compatível (`pool.query`, `pool.connect`, `pool.end`). */
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

/**
 * Transação com contexto de tenant no banco (defesa em profundidade da Lei 7.2):
 * `set_config('app.tenant_id', ...)` faz as policies de RLS baseadas em
 * current_setting valerem quando a aplicação conecta com um role sem BYPASSRLS
 * (ver docs/RUNBOOK.md). O filtro explícito por tenant_id nas queries continua
 * obrigatório — RLS aqui é a segunda tranca, não a primeira.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    return fn(client);
  });
}
