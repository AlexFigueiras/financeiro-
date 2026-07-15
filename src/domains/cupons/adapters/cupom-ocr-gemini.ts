import { requisitarGeminiJson } from '../../../shared/ia/gemini-client';
import { CupomOcrPort } from '../ports/cupom-ocr-port';
import { CupomGemini } from '../types';

const SYSTEM_PROMPT =
  'Atue como um extrator de dados fiscais estruturados. Você receberá uma ou mais imagens ' +
  'que correspondem a partes fatiadas (em sequência) de um mesmo cupom fiscal longo. ' +
  'Como pode haver sobreposição de conteúdo nas áreas de corte entre as fotos, analise ' +
  'o contexto visual e semântico e remova itens duplicados que apareçam nas transições das imagens, ' +
  'consolidando tudo em uma única lista de itens unificada e contínua. ' +
  'Ignore falhas de impressão e extraia: Nome do Estabelecimento, Data da Compra, ' +
  'Valor Total OBRIGATORIAMENTE batendo com a soma dos itens consolidados. Extraia a lista de ' +
  'itens contendo: descrição do produto, quantidade, valor unitário e subtotal. ' +
  'Para cada item, classifique também uma categoria em português (ex: alimentacao, ' +
  'bebidas, limpeza, higiene, hortifruti, padaria, carnes, farmacia, transporte, outros). ' +
  'Retorne estritamente um JSON limpo no formato: ' +
  '{"estabelecimento": string, "data": "YYYY-MM-DD HH:MM:SS", "valor_total": float, ' +
  '"itens": [{"produto": string, "qtd": float, "valor_uni": float, "subtotal": float, "categoria": string}]} ' +
  'Sem markdown, sem comentários, sem texto fora do JSON.';

export const cupomOcrGemini: CupomOcrPort = {
  extrairCupom(arquivos): Promise<CupomGemini> {
    return requisitarGeminiJson<CupomGemini>(
      arquivos,
      '',
      SYSTEM_PROMPT,
      'Extraia e consolide os dados deste cupom fiscal a partir das imagens fornecidas.'
    );
  },
};
