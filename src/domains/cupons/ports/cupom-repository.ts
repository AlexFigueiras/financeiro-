import { ArquivoImportado, CupomGemini, CupomComItens, DadosItemCupom, DadosCriarCupomManual, DadosNovoItemCupom } from '../types';

export interface CupomRepository {
  salvar(tenantId: string, dados: CupomGemini, dataEmissaoIso: string, chaveAcesso?: string): Promise<number>;
  criarManual(tenantId: string, dados: DadosCriarCupomManual): Promise<number>;

  /** Retorna o cupom já importado com esta chave de acesso (dedup por NFC-e), se existir. */
  buscarPorChaveAcesso(tenantId: string, chaveAcesso: string): Promise<{ id: number; criadoEm: Date } | null>;

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
  adicionarItem(tenantId: string, cupomId: number, item: DadosNovoItemCupom): Promise<void>;
  excluirItem(tenantId: string, itemId: number): Promise<void>;
  excluirCupom(tenantId: string, cupomId: number): Promise<void>;
  listarPendentes(tenantId: string): Promise<Array<{ id: number; dataEmissao: string; valorTotal: number; estabelecimento: string }>>;
}
