import { ArquivoImportado, CupomGemini, CupomComItens, DadosItemCupom } from '../types';

export interface CupomRepository {
  salvar(tenantId: string, dados: CupomGemini, dataEmissaoIso: string): Promise<number>;

  /** Retorna o registro do envio (por hash do conjunto de arquivos) se ele já aconteceu antes. */
  buscarArquivoImportado(tenantId: string, hashArquivo: string): Promise<ArquivoImportado | null>;

  /** Registra o envio processado com sucesso (idempotente — reenvio forçado não duplica). */
  registrarArquivoImportado(
    tenantId: string,
    arquivo: { hashArquivo: string; nomeArquivo: string; tamanhoBytes: number }
  ): Promise<void>;
  buscarComItens(tenantId: string, cupomId: number): Promise<CupomComItens | null>;
  atualizarCategoriaItem(tenantId: string, itemId: number, categoriaChave: string): Promise<void>;
  categoriaExiste(tenantId: string, categoriaChave: string): Promise<boolean>;
  atualizarItem(tenantId: string, itemId: number, dados: DadosItemCupom): Promise<void>;
  excluirItem(tenantId: string, itemId: number): Promise<void>;
  listarPendentes(tenantId: string): Promise<Array<{ id: number; dataEmissao: string; valorTotal: number; estabelecimento: string }>>;
}
