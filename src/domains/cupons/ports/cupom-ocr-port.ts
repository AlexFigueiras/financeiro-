import { CupomGemini } from '../types';

export interface CupomOcrPort {
  extrairCupom(arquivo: Buffer, mimeType: string): Promise<CupomGemini>;
}
