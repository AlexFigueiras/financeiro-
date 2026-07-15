import { CupomGemini, CupomComItens, DadosItemCupom } from '../types';

export interface CupomRepository {
  salvar(tenantId: string, dados: CupomGemini, dataEmissaoIso: string): Promise<number>;
  buscarComItens(tenantId: string, cupomId: number): Promise<CupomComItens | null>;
  atualizarCategoriaItem(tenantId: string, itemId: number, categoriaChave: string): Promise<void>;
  categoriaExiste(tenantId: string, categoriaChave: string): Promise<boolean>;
  atualizarItem(tenantId: string, itemId: number, dados: DadosItemCupom): Promise<void>;
  excluirItem(tenantId: string, itemId: number): Promise<void>;
  listarPendentes(tenantId: string): Promise<Array<{ id: number; dataEmissao: string; valorTotal: number; estabelecimento: string }>>;
}
