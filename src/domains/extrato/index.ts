/** API pública do domínio extrato. */
import { extratoRepositoryPg } from './adapters/extrato-repository-pg';
import { extratoOcrGemini } from './adapters/extrato-ocr-gemini';
import { criarExtratoService } from './services/extrato-service';

export const extratoService = criarExtratoService(extratoRepositoryPg, extratoOcrGemini);
export type { TransacaoOfx, ResultadoImportExtrato } from './types';
export { extratoRouter } from './actions/extrato-actions';
