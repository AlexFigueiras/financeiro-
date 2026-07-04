/** MÓDULO PURO — validação de consistência do cupom extraído pela IA. Zero I/O. */
import { AppError } from '../../../shared/errors/app-error';
import { CupomGemini } from '../types';

export function validarCupom(dados: CupomGemini): void {
  if (!dados.estabelecimento || typeof dados.estabelecimento !== 'string') {
    throw new AppError('Extração incompleta: estabelecimento ausente.', 422, dados);
  }
  if (typeof dados.valor_total !== 'number' || dados.valor_total <= 0) {
    throw new AppError('Extração incompleta: valor_total inválido.', 422, dados);
  }
  if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
    throw new AppError('Extração incompleta: nenhum item identificado no cupom.', 422, dados);
  }
  const dataEmissao = new Date(dados.data);
  if (isNaN(dataEmissao.getTime())) {
    throw new AppError(`Extração incompleta: data inválida ("${dados.data}").`, 422, dados);
  }
  // Consistência exigida pelo prompt: soma dos itens deve bater com o total.
  // Tolerância de R$ 0,05 para arredondamentos de balança/quantidade fracionada.
  const soma = dados.itens.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);
  if (Math.abs(soma - dados.valor_total) > 0.05) {
    throw new AppError(
      `Inconsistência na extração: soma dos itens (R$ ${soma.toFixed(2)}) difere do total (R$ ${dados.valor_total.toFixed(2)}). ` +
        'Reenvie uma foto mais nítida do cupom.',
      422,
      dados
    );
  }
}

/** Interpreta a data extraída como horário de Brasília quando não houver fuso explícito. */
export function normalizarDataEmissao(raw: string): string {
  const temFuso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim());
  const base = raw.trim().replace(' ', 'T');
  return temFuso ? new Date(base).toISOString() : new Date(`${base}-03:00`).toISOString();
}
