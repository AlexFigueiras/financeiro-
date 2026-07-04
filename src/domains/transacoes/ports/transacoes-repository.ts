import { FiltroTransacoes, ListaTransacoes } from '../types';

export interface TransacoesRepository {
  listar(tenantId: string, filtro: FiltroTransacoes): Promise<ListaTransacoes>;
  atualizarCategoria(tenantId: string, transacaoId: number, categoriaChave: string): Promise<void>;
}
