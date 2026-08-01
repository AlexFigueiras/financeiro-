/**
 * Busca a página pública de consulta da NFC-e na SEFAZ e extrai os dados do cupom via Gemini
 * (texto, não imagem) — espelha o estilo de cupom-ocr-gemini.ts (prompt + delegação ao client).
 */
import { requisitarGeminiTextoJson } from '../../../shared/ia/gemini-client';
import { AppError } from '../../../shared/errors/app-error';
import { NfcePort } from '../ports/nfce-port';
import { CupomGemini } from '../types';
import { htmlParaTexto } from '../domain/html-para-texto';
import { hostPermitidoNfce } from '../domain/nfce-url';

const TIMEOUT_MS = 15_000;
const LIMITE_BYTES = 2 * 1024 * 1024;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const MENSAGEM_FALLBACK =
  'Não foi possível consultar a nota na SEFAZ (site fora do ar, CAPTCHA ou nota ainda não ' +
  'processada). Fotografe o cupom ou crie o lançamento manualmente.';

const SYSTEM_PROMPT =
  'Atue como um extrator de dados fiscais estruturados a partir do texto (já convertido de HTML) ' +
  'da página pública de consulta de uma NFC-e (Nota Fiscal de Consumidor Eletrônica) brasileira. ' +
  'Extraia: Nome do Estabelecimento (razão social ou nome fantasia do emitente), Data e hora de ' +
  'emissão, Valor Total OBRIGATORIAMENTE batendo com a soma dos itens (tolerância de R$ 0,05), e a ' +
  'lista de itens contendo: descrição do produto, quantidade, valor unitário e subtotal. Para cada ' +
  'item, classifique também uma categoria em português (ex: alimentacao, bebidas, limpeza, higiene, ' +
  'hortifruti, padaria, carnes, farmacia, transporte, outros). ' +
  'Retorne estritamente um JSON limpo no formato: ' +
  '{"estabelecimento": string, "data": "YYYY-MM-DD HH:MM:SS", "valor_total": float, ' +
  '"itens": [{"produto": string, "qtd": float, "valor_uni": float, "subtotal": float, "categoria": string}]} ' +
  'Sem markdown, sem comentários, sem texto fora do JSON.';

/** Heurística de bloqueio: CAPTCHA/challenge conhecidos ou ausência de qualquer indício de nota fiscal. */
function pareceBloqueado(html: string): boolean {
  const lower = html.toLowerCase();
  if (lower.includes('recaptcha') || lower.includes('g-recaptcha') || lower.includes('cf-challenge')) {
    return true;
  }
  return !lower.includes('nfc-e') && !lower.includes('nfce') && !lower.includes('danfe');
}

export const nfceSefazGemini: NfcePort = {
  async extrair(url: string): Promise<CupomGemini> {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError') {
        throw new AppError(MENSAGEM_FALLBACK, 504);
      }
      throw new AppError(MENSAGEM_FALLBACK, 502);
    }

    // Revalida o host final (a allowlist vale para toda a cadeia de redirects, não só a URL original).
    const hostFinal = new URL(response.url).hostname;
    if (!hostPermitidoNfce(hostFinal)) {
      throw new AppError(
        `Redirecionamento para host fora da allowlist ("${hostFinal}") — requisição bloqueada.`,
        400
      );
    }

    if (!response.ok) {
      throw new AppError(MENSAGEM_FALLBACK, 502);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > LIMITE_BYTES) {
      throw new AppError(MENSAGEM_FALLBACK, 422);
    }

    const html = Buffer.from(buffer).toString('utf8');
    if (pareceBloqueado(html)) {
      throw new AppError(MENSAGEM_FALLBACK, 422);
    }

    const texto = htmlParaTexto(html);
    return requisitarGeminiTextoJson<CupomGemini>(SYSTEM_PROMPT, texto);
  },
};
