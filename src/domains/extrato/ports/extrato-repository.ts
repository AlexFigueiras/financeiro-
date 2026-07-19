import { ArquivoImportado, ResultadoImportExtrato, TransacaoOfx } from '../types';

export interface ExtratoRepository {
  inserirTransacoes(
    tenantId: string,
    contaId: number,
    transacoes: TransacaoOfx[]
  ): Promise<ResultadoImportExtrato>;

  /** Retorna o registro do arquivo (por hash de conteúdo) se ele já foi importado antes. */
  buscarArquivoImportado(tenantId: string, hashArquivo: string): Promise<ArquivoImportado | null>;

  /** Registra o arquivo importado com sucesso (idempotente — reenvio forçado não duplica). */
  registrarArquivoImportado(
    tenantId: string,
    arquivo: { hashArquivo: string; nomeArquivo: string; tamanhoBytes: number }
  ): Promise<void>;
}
