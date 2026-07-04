import { withTenantTransaction } from '../../../infra/db/pool';
import { ReconciliacaoRepository } from '../ports/reconciliacao-repository';

/**
 * A lógica de match vive no banco (fn_reconciliar, em infra/db/migrations):
 *   1. valor da saída bancária == valor_total do cupom (centavo por centavo);
 *   2. data_transacao dentro de ±48h da data_emissao (janela de compensação);
 *   3. em empate, vence a transação mais próxima no tempo;
 *   4. vínculo 1:1 garantido por índice único parcial em cupom_id;
 *   5. escopo estrito ao tenant (parâmetro p_tenant_id).
 */
export const reconciliacaoRepositoryPg: ReconciliacaoRepository = {
  async executarMotor(tenantId) {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query<{ transacao_id: number; cupom_fiscal_id: number }>(
        'SELECT * FROM fn_reconciliar($1)',
        [tenantId]
      );
      return rows.map((r) => ({ transacaoId: r.transacao_id, cupomFiscalId: r.cupom_fiscal_id }));
    });
  },
};
