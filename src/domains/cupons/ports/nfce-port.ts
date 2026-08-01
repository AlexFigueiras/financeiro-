import { CupomGemini } from '../types';

export interface NfcePort {
  /** Busca a página pública da SEFAZ e extrai o cupom (via IA, a partir do texto do HTML). */
  extrair(url: string): Promise<CupomGemini>;
}
