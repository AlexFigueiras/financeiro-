/**
 * Client HTTP do Google Gemini (infra transversal — SEM regra de negócio).
 * Os prompts e a interpretação do resultado pertencem aos adapters de cada
 * domínio (cupons, extrato); aqui mora só o transporte: montagem da request
 * multimodal, timeouts, mapeamento de erros HTTP e parse defensivo do JSON.
 */
import { env } from '../config/env';
import { AppError } from '../errors/app-error';
import { incrementar, observarDuracao } from '../observability/metrics';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const MIME_PERMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

export async function requisitarGeminiJson<T>(
  arquivo: Buffer,
  mimeType: string,
  systemPrompt: string,
  userText: string
): Promise<T> {
  if (!MIME_PERMITIDOS.has(mimeType)) {
    throw new AppError(
      `Tipo de arquivo não suportado: ${mimeType}. Envie JPG, PNG, WEBP, HEIC ou PDF.`,
      415
    );
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: arquivo.toString('base64') } },
          { text: userText },
        ],
      },
    ],
    generation_config: { temperature: 0, response_mime_type: 'application/json' },
  };

  const inicio = Date.now();
  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_BASE}/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // 55s: precisa retornar antes do limite de 60s da função no Vercel,
        // para virar um erro tratado em vez de a função ser morta (504).
        signal: AbortSignal.timeout(55_000),
      }
    );
  } catch (err) {
    incrementar('gemini_chamadas_total', { resultado: 'falha_rede' });
    if ((err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError') {
      throw new AppError(
        'A leitura pela IA demorou demais (arquivo grande ou muitas páginas). ' +
          'Tente um PDF menor/mais nítido, ou use o arquivo OFX do extrato.',
        504
      );
    }
    throw new AppError(`Falha de rede ao chamar a API do Gemini: ${(err as Error).message}`, 502);
  } finally {
    observarDuracao('gemini_duracao_ms', Date.now() - inicio);
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    incrementar('gemini_chamadas_total', { resultado: 'recusada' });
    throw new AppError('Gemini recusou a requisição (chave inválida?). Verifique GEMINI_API_KEY no .env.', 502);
  }
  if (response.status === 429) {
    incrementar('gemini_chamadas_total', { resultado: 'rate_limit' });
    throw new AppError('Rate limit da API do Gemini atingido. Tente novamente em instantes.', 503);
  }
  if (!response.ok) {
    incrementar('gemini_chamadas_total', { resultado: 'erro_http' });
    const text = await response.text().catch(() => '');
    throw new AppError(`API do Gemini retornou ${response.status}: ${text.slice(0, 300)}`, 502);
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texto = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) {
    incrementar('gemini_chamadas_total', { resultado: 'sem_conteudo' });
    throw new AppError('Gemini não retornou conteúdo extraível para este arquivo.', 502);
  }

  // Remove eventual cerca de markdown, apesar do response_mime_type
  const jsonLimpo = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const parsed = JSON.parse(jsonLimpo) as T;
    incrementar('gemini_chamadas_total', { resultado: 'ok' });
    return parsed;
  } catch {
    incrementar('gemini_chamadas_total', { resultado: 'json_invalido' });
    throw new AppError('Gemini retornou um JSON inválido. Tente um arquivo mais nítido.', 422, {
      retorno_bruto: jsonLimpo.slice(0, 500),
    });
  }
}
