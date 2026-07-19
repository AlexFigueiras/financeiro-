import { CupomGemini } from '../types';

export interface ArquivoOcr {
  buffer: Buffer;
  mimeType: string;
  /** Nome original do upload — usado só no aviso de arquivo duplicado, não no OCR. */
  nome?: string;
}

export interface CupomOcrPort {
  extrairCupom(arquivos: ArquivoOcr[]): Promise<CupomGemini>;
}
