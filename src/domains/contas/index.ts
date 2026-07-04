/** API pública do domínio contas. */
import { contasRepositoryPg } from './adapters/contas-repository-pg';
import { criarContasService } from './services/contas-service';

export const contasService = criarContasService(contasRepositoryPg);
export type { ContaBancaria, TipoConta } from './types';
export { contasRouter } from './actions/contas-actions';
