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
};
