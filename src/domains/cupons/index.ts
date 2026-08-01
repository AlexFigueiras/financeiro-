/** API pública do domínio cupons. */
import { cupomOcrGemini } from './adapters/cupom-ocr-gemini';
import { cupomRepositoryPg } from './adapters/cupom-repository-pg';
import { nfceSefazGemini } from './adapters/nfce-sefaz-gemini';
import { criarCupomService } from './services/cupom-service';

export const cupomService = criarCupomService(cupomOcrGemini, cupomRepositoryPg, nfceSefazGemini);
export type { ResultadoCupom, CupomComItens, ItemCupom } from './types';
export { cuponsRouter } from './actions/cupons-actions';
