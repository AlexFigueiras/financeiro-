import { CupomGemini } from '../types';

export interface ArquivoOcr {
  buffer: Buffer;
  mimeType: string;
}

export interface CupomOcrPort {
  extrairCupom(arquivos: ArquivoOcr[]): Promise<CupomGemini>;
}
