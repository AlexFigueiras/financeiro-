/** API pública do domínio cupons. */
import { cupomOcrGemini } from './adapters/cupom-ocr-gemini';
import { cupomRepositoryPg } from './adapters/cupom-repository-pg';
import { criarCupomService } from './services/cupom-service';

export const cupomService = criarCupomService(cupomOcrGemini, cupomRepositoryPg);
export type { ResultadoCupom, CupomComItens, ItemCupom } from './types';
export { cuponsRouter } from './actions/cupons-actions';
