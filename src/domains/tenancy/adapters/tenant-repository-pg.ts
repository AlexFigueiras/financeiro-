import { pool, withTransaction } from '../../../infra/db/pool';
import { TenantRepository } from '../ports/tenant-repository';
import { Tenant } from '../types';

/**
 * Implementação Postgres. Roda FORA do contexto de tenant (o próprio
 * objetivo aqui é descobrir/criar o tenant), por isso usa `pool` direto em
 * vez de `withTenantTransaction` — as policies de RLS destas duas tabelas
 * (tenants, tenant_members) restringem por auth.uid()/tenant_id da linha, não
 * exigem app.tenant_id previamente setado.
 */
export const tenantRepositoryPg: TenantRepository = {
  async buscarTenantIdDoUsuario(userId: string): Promise<string | null> {
    const { rows } = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM tenant_members WHERE user_id = $1 ORDER BY criado_em ASC LIMIT 1',
      [userId]
    );
    return rows[0]?.tenant_id ?? null;
  },

  async criarTenantComOwner(userId: string, nome: string): Promise<Tenant> {
    return withTransaction(async (client) => {
      const tenant = await client.query<{ id: string; nome: string; criado_em: string }>(
        'INSERT INTO tenants (nome) VALUES ($1) RETURNING id, nome, criado_em',
        [nome]
      );
      await client.query(
        `INSERT INTO tenant_members (tenant_id, user_id, papel) VALUES ($1, $2, 'owner')`,
        [tenant.rows[0].id, userId]
      );
      return {
        id: tenant.rows[0].id,
        nome: tenant.rows[0].nome,
        criadoEm: tenant.rows[0].criado_em,
      };
    });
  },
};
