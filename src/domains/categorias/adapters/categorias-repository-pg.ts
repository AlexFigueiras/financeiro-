import { pool } from '../../../infra/db/pool';
import { CategoriasRepository } from '../ports/categorias-repository';

export const categoriasRepositoryPg: CategoriasRepository = {
  async listar(tenantId) {
    const { rows } = await pool.query<{ chave: string; nome: string; cor: string }>(
      'SELECT chave, nome, cor FROM categorias WHERE tenant_id = $1 ORDER BY nome',
      [tenantId]
    );
    return rows;
  },

  async existe(tenantId, chave) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM categorias WHERE tenant_id = $1 AND chave = $2',
      [tenantId, chave]
    );
    return (rowCount ?? 0) > 0;
  },

  async criar(tenantId, { chave, nome, cor }) {
    const { rows } = await pool.query<{ chave: string; nome: string; cor: string }>(
      'INSERT INTO categorias (tenant_id, chave, nome, cor) VALUES ($1, $2, $3, $4) RETURNING chave, nome, cor',
      [tenantId, chave, nome, cor]
    );
    return rows[0];
  },

  async atualizar(tenantId, chave, dados) {
    const { rows } = await pool.query<{ chave: string; nome: string; cor: string }>(
      `UPDATE categorias
          SET nome = COALESCE($3, nome),
              cor = COALESCE($4, cor)
        WHERE tenant_id = $1 AND chave = $2
       RETURNING chave, nome, cor`,
      [tenantId, chave, dados.nome ?? null, dados.cor ?? null]
    );
    return rows[0];
  },

  async excluir(tenantId, chave) {
    await pool.query(
      'DELETE FROM categorias WHERE tenant_id = $1 AND chave = $2',
      [tenantId, chave]
    );
  },
};
