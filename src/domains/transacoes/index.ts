/** API pública do domínio transacoes. */
import { transacoesRepositoryPg } from './adapters/transacoes-repository-pg';
import { categoriasService } from '../categorias';
import { contasService } from '../contas';
import { criarTransacoesService } from './services/transacoes-service';

export const transacoesService = criarTransacoesService(transacoesRepositoryPg, categoriasService, contasService);
export type { TransacaoListada, ListaTransacoes } from './types';
export { transacoesRouter } from './actions/transacoes-actions';
