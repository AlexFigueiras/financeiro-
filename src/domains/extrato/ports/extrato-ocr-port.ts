import { TransacaoOfx } from '../types';

export interface ExtratoOcrPort {
  extrairTransacoes(arquivo: Buffer, mimeType: string): Promise<TransacaoOfx[]>;
}
