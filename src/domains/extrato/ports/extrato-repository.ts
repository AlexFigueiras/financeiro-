import { ResultadoImportExtrato, TransacaoOfx } from '../types';

export interface ExtratoRepository {
  inserirTransacoes(
    tenantId: string,
    contaId: number,
    transacoes: TransacaoOfx[]
  ): Promise<ResultadoImportExtrato>;
}
