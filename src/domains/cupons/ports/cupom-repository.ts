import { CupomGemini, CupomComItens } from '../types';

export interface CupomRepository {
  salvar(tenantId: string, dados: CupomGemini, dataEmissaoIso: string): Promise<number>;
  buscarComItens(tenantId: string, cupomId: number): Promise<CupomComItens | null>;
  atualizarCategoriaItem(tenantId: string, itemId: number, categoriaChave: string): Promise<void>;
  categoriaExiste(tenantId: string, categoriaChave: string): Promise<boolean>;
}
