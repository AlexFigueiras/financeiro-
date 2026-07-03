/**
 * MÓDULO C — OCR inteligente de cupons fiscais/NFC-e com Gemini API.
 * Envia a imagem/PDF ao modelo gemini-1.5-flash, valida o JSON retornado
 * (inclusive a soma dos itens vs. valor total) e persiste em
 * cupons_fiscais + itens_cupom.
 */
import { pool, withTransaction } from '../db/pool';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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

interface ItemGemini {
  produto: string;
  qtd: number;
  valor_uni: number;
  subtotal: number;
  categoria?: string;
}

interface CupomGemini {
  estabelecimento: string;
  data: string;
  valor_total: number;
  itens: ItemGemini[];
}

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);

async function chamarGemini(arquivo: Buffer, mimeType: string): Promise<CupomGemini> {
  if (!MIME_PERMITIDOS.has(mimeType)) {
    throw new AppError(`Tipo de arquivo não suportado: ${mimeType}. Envie JPG, PNG, WEBP, HEIC ou PDF.`, 415);
  }

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: arquivo.toString('base64') } },
          { text: 'Extraia os dados deste cupom fiscal conforme instruído.' },
        ],
      },
    ],
    generation_config: { temperature: 0, response_mime_type: 'application/json' },
  };

  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_BASE}/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      }
    );
  } catch (err) {
    throw new AppError(`Falha de rede ao chamar a API do Gemini: ${(err as Error).message}`, 502);
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new AppError('Gemini recusou a requisição (chave inválida?). Verifique GEMINI_API_KEY no .env.', 502);
  }
  if (response.status === 429) {
    throw new AppError('Rate limit da API do Gemini atingido. Tente novamente em instantes.', 503);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new AppError(`API do Gemini retornou ${response.status}: ${text.slice(0, 300)}`, 502);
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texto = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new AppError('Gemini não retornou conteúdo extraível para este arquivo.', 502);

  // Remove eventual cerca de markdown, apesar do response_mime_type
  const jsonLimpo = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let dados: CupomGemini;
  try {
    dados = JSON.parse(jsonLimpo) as CupomGemini;
  } catch {
    throw new AppError('Gemini retornou um JSON inválido. Tente uma foto mais nítida do cupom.', 422, {
      retorno_bruto: jsonLimpo.slice(0, 500),
    });
  }
  return dados;
}

function validarCupom(dados: CupomGemini): void {
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
function normalizarDataEmissao(raw: string): string {
  const temFuso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim());
  const base = raw.trim().replace(' ', 'T');
  return temFuso ? new Date(base).toISOString() : new Date(`${base}-03:00`).toISOString();
}

export interface ResultadoCupom {
  cupomId: number;
  estabelecimento: string;
  dataEmissao: string;
  valorTotal: number;
  itens: number;
}

/** Processa o arquivo do cupom: OCR via Gemini + persistência transacional. */
export async function processarCupom(arquivo: Buffer, mimeType: string): Promise<ResultadoCupom> {
  const dados = await chamarGemini(arquivo, mimeType);
  validarCupom(dados);
  const dataEmissao = normalizarDataEmissao(dados.data);

  return withTransaction(async (client) => {
    const cupom = await client.query<{ id: number }>(
      `INSERT INTO cupons_fiscais (data_emissao, valor_total, estabelecimento, json_bruto_ia)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [dataEmissao, dados.valor_total, dados.estabelecimento.trim(), JSON.stringify(dados)]
    );
    const cupomId = cupom.rows[0].id;

    for (const item of dados.itens) {
      await client.query(
        `INSERT INTO itens_cupom (cupom_id, nome_produto, quantidade, preco_unitario, valor_total, categoria)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          cupomId,
          String(item.produto ?? 'Item sem descrição').trim(),
          Number(item.qtd) > 0 ? Number(item.qtd) : 1,
          Number(item.valor_uni) || 0,
          Number(item.subtotal) || 0,
          (item.categoria ?? 'outros').toLowerCase().trim() || 'outros',
        ]
      );
    }

    return {
      cupomId,
      estabelecimento: dados.estabelecimento,
      dataEmissao,
      valorTotal: dados.valor_total,
      itens: dados.itens.length,
    };
  });
}

/** Retorna um cupom com seus itens (usado pelo frontend no accordion). */
export async function obterCupomComItens(cupomId: number) {
  const cupom = await pool.query('SELECT * FROM cupons_fiscais WHERE id = $1', [cupomId]);
  if (cupom.rowCount === 0) throw new AppError(`Cupom ${cupomId} não encontrado.`, 404);
  const itens = await pool.query('SELECT * FROM itens_cupom WHERE cupom_id = $1 ORDER BY id', [cupomId]);
  return { ...cupom.rows[0], itens: itens.rows };
}
