/** API pública do domínio reconciliacao. */
import { reconciliacaoRepositoryPg } from './adapters/reconciliacao-repository-pg';
import { criarReconciliacaoService } from './services/reconciliacao-service';

export const reconciliacaoService = criarReconciliacaoService(reconciliacaoRepositoryPg);
export type { MatchReconciliacao } from './types';
export { reconciliacaoRouter } from './actions/reconciliacao-actions';
