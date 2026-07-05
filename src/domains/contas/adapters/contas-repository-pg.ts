import { PoolClient, QueryResultRow } from 'pg';
import { pool, withTenantTransaction } from '../../../infra/db/pool';
import { ContasRepository } from '../ports/contas-repository';
import { ContaBancaria, TipoConta } from '../types';

function paraDominio(row: {
  id: number;
  nome: string;
  tipo: string;
  saldo_atual: string;
  atualizado_em: string;
}): ContaBancaria {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo as TipoConta,
    saldoAtual: Number(row.saldo_atual),
    atualizadoEm: row.atualizado_em,
  };
}

async function query<T extends QueryResultRow>(
  client: PoolClient | undefined,
  text: string,
  params: unknown[]
) {
  return client ? client.query<T>(text, params) : pool.query<T>(text, params);
}

export const contasRepositoryPg: ContasRepository = {
  async listar(tenantId) {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query(
        'SELECT id, nome, tipo, saldo_atual, atualizado_em FROM contas_bancarias WHERE tenant_id = $1 ORDER BY id',
        [tenantId]
      );
      return rows.map(paraDominio);
    });
  },

  async criar(tenantId, nome, tipo) {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO contas_bancarias (tenant_id, nome, tipo) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, nome) DO NOTHING
         RETURNING id, nome, tipo, saldo_atual, atualizado_em`,
        [tenantId, nome, tipo]
      );
      return rows.length > 0 ? paraDominio(rows[0]) : null;
    });
  },

  async existe(tenantId, contaId, client) {
    const { rows } = await query<{ id: number }>(
      client,
      'SELECT id FROM contas_bancarias WHERE id = $1 AND tenant_id = $2',
      [contaId, tenantId]
    );
    return rows.length > 0;
  },

  async buscarIdPorNome(tenantId, nome) {
    const { rows } = await pool.query<{ id: number }>(
      'SELECT id FROM contas_bancarias WHERE tenant_id = $1 AND nome = $2 LIMIT 1',
      [tenantId, nome]
    );
    return rows[0]?.id ?? null;
  },

  async atualizar(tenantId, contaId, nome, tipo) {
    return withTenantTransaction(tenantId, async (client) => {
      try {
        const { rows } = await client.query(
          `UPDATE contas_bancarias SET nome = $1, tipo = $2, atualizado_em = now()
            WHERE id = $3 AND tenant_id = $4
           RETURNING id, nome, tipo, saldo_atual, atualizado_em`,
          [nome, tipo, contaId, tenantId]
        );
        return rows.length > 0 ? paraDominio(rows[0]) : null;
      } catch (err) {
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
          return null; // nome duplicado no tenant (uq_contas_tenant_nome)
        }
        throw err;
      }
    });
  },

  async contarTransacoes(tenantId, contaId) {
    const { rows } = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM transacoes_banco WHERE conta_id = $1 AND tenant_id = $2',
      [contaId, tenantId]
    );
    return rows[0]?.total ?? 0;
  },

  async excluir(tenantId, contaId) {
    await pool.query('DELETE FROM contas_bancarias WHERE id = $1 AND tenant_id = $2', [contaId, tenantId]);
  },
};
