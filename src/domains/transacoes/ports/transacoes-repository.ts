import { DadosTransacao, FiltroTransacoes, ListaTransacoes, TransacaoListada } from '../types';

export interface TransacoesRepository {
  listar(tenantId: string, filtro: FiltroTransacoes): Promise<ListaTransacoes>;
  atualizarCategoria(tenantId: string, transacaoId: number, categoriaChave: string): Promise<void>;
  criar(tenantId: string, dados: DadosTransacao): Promise<TransacaoListada>;
  atualizar(tenantId: string, transacaoId: number, dados: Partial<DadosTransacao>): Promise<TransacaoListada>;
  excluir(tenantId: string, transacaoId: number): Promise<void>;
  recategorizarTodas(tenantId: string): Promise<number>;
}
