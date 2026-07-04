import { requisitarGeminiJson } from '../../../shared/ia/gemini-client';
import { CupomOcrPort } from '../ports/cupom-ocr-port';
import { CupomGemini } from '../types';

const SYSTEM_PROMPT =
  'Atue como um extrator de dados fiscais estruturados. Analise a imagem do cupom, ' +
  'ignore falhas de impressão e extraia: Nome do Estabelecimento, Data da Compra, ' +
  'Valor Total OBRIGATORIAMENTE batendo com a soma dos itens. Extraia uma lista de ' +
  'itens contendo: descrição do produto, quantidade, valor unitário e subtotal. ' +
  'Para cada item, classifique também uma categoria em português (ex: alimentacao, ' +
  'bebidas, limpeza, higiene, hortifruti, padaria, carnes, farmacia, transporte, outros). ' +
  'Retorne estritamente um JSON limpo no formato: ' +
  '{"estabelecimento": string, "data": "YYYY-MM-DD HH:MM:SS", "valor_total": float, ' +
  '"itens": [{"produto": string, "qtd": float, "valor_uni": float, "subtotal": float, "categoria": string}]} ' +
  'Sem markdown, sem comentários, sem texto fora do JSON.';

export const cupomOcrGemini: CupomOcrPort = {
  extrairCupom(arquivo: Buffer, mimeType: string): Promise<CupomGemini> {
    return requisitarGeminiJson<CupomGemini>(
      arquivo,
      mimeType,
      SYSTEM_PROMPT,
      'Extraia os dados deste cupom fiscal conforme instruído.'
    );
  },
};
