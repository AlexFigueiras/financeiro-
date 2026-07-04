/**
 * MÓDULO C — OCR inteligente de cupons fiscais/NFC-e com Gemini API.
 * Envia a imagem/PDF ao modelo gemini-1.5-flash, valida o JSON retornado
 * (inclusive a soma dos itens vs. valor total) e persiste em
 * cupons_fiscais + itens_cupom.
 */
import { pool, withTransaction } from '../db/pool';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import type { TransacaoOfx } from './ofx';

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

/**
 * Núcleo compartilhado: envia arquivo + prompt ao Gemini e devolve o JSON já
 * parseado (com tratamento explícito de erros de rede/HTTP/JSON). É usado tanto
 * pela extração de cupons quanto pela de extratos bancários.
 */
async function requisitarGeminiJson<T>(
  arquivo: Buffer,
  mimeType: string,
  systemPrompt: string,
  userText: string
): Promise<T> {
  if (!MIME_PERMITIDOS.has(mimeType)) {
    throw new AppError(`Tipo de arquivo não suportado: ${mimeType}. Envie JPG, PNG, WEBP, HEIC ou PDF.`, 415);
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

  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_BASE}/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
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
  try {
    return JSON.parse(jsonLimpo) as T;
  } catch {
    throw new AppError('Gemini retornou um JSON inválido. Tente um arquivo mais nítido.', 422, {
      retorno_bruto: jsonLimpo.slice(0, 500),
    });
  }
}

function chamarGemini(arquivo: Buffer, mimeType: string): Promise<CupomGemini> {
  return requisitarGeminiJson<CupomGemini>(
    arquivo,
    mimeType,
    SYSTEM_PROMPT,
    'Extraia os dados deste cupom fiscal conforme instruído.'
  );
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

// ============================================================================
// EXTRATO BANCÁRIO EM PDF/IMAGEM (alternativa ao arquivo OFX)
// ============================================================================

const SYSTEM_PROMPT_EXTRATO =
  'Atue como um extrator de extratos bancários. Analise o extrato (PDF ou imagem) ' +
  'e extraia TODOS os lançamentos/transações. Para cada lançamento extraia: a data ' +
  '(formato YYYY-MM-DD), a descrição/histórico e o valor. REGRA DE SINAL OBRIGATÓRIA: ' +
  'valor NEGATIVO para débitos/saídas/pagamentos/compras/saques/transferências enviadas; ' +
  'valor POSITIVO para créditos/entradas/depósitos/recebimentos/transferências recebidas. ' +
  'IGNORE linhas de saldo (SALDO ANTERIOR, SALDO DO DIA, SALDO ATUAL, SALDO FINAL, ' +
  'SALDO DISPONÍVEL, SALDO BLOQUEADO) — não são transações. Ignore cabeçalhos e rodapés. ' +
  'Retorne estritamente um JSON limpo no formato: ' +
  '{"transacoes": [{"data": "YYYY-MM-DD", "descricao": string, "valor": float}]} ' +
  'Sem markdown, sem comentários, sem texto fora do JSON.';

interface LancamentoGemini {
  data: string;
  descricao: string;
  valor: number;
}

interface ExtratoGemini {
  transacoes: LancamentoGemini[];
}

/**
 * Extrai as transações de um extrato em PDF/imagem via Gemini, normaliza e
 * valida. Datas sem hora são fixadas ao meio-dia de Brasília (evita virada de
 * dia por fuso). Retorna no formato TransacaoOfx para reusar hash e importador.
 */
export async function extrairExtratoPdf(arquivo: Buffer, mimeType: string): Promise<TransacaoOfx[]> {
  const dados = await requisitarGeminiJson<ExtratoGemini>(
    arquivo,
    mimeType,
    SYSTEM_PROMPT_EXTRATO,
    'Extraia todos os lançamentos deste extrato bancário conforme instruído.'
  );

  if (!dados || !Array.isArray(dados.transacoes)) {
    throw new AppError(
      'Não foi possível ler lançamentos neste arquivo. Confirme que é um extrato bancário legível.',
      422,
      dados
    );
  }

  // Reforço no código: descarta linhas de saldo mesmo que o modelo as inclua.
  const ehLinhaSaldo = (desc: string) => /\bsaldo\b/i.test(desc);

  const transacoes: TransacaoOfx[] = [];
  for (const l of dados.transacoes) {
    const valor = Number(l.valor);
    if (!l.data || typeof l.data !== 'string' || isNaN(valor) || valor === 0) continue;
    if (typeof l.descricao === 'string' && ehLinhaSaldo(l.descricao)) continue;
    const iso = /[T ]/.test(l.data) ? l.data.trim().replace(' ', 'T') : `${l.data.trim()}T12:00:00-03:00`;
    const data = new Date(/[zZ]|[+-]\d{2}:?\d{2}/.test(iso) ? iso : `${iso}-03:00`);
    if (isNaN(data.getTime())) continue;
    transacoes.push({
      data,
      valor: Math.round(valor * 100) / 100,
      descricao: String(l.descricao ?? 'Lançamento sem descrição').trim() || 'Lançamento sem descrição',
      fitid: null,
    });
  }

  if (transacoes.length === 0) {
    throw new AppError(
      'Nenhum lançamento válido foi identificado no extrato. Tente um PDF/foto mais nítido ou use o arquivo OFX.',
      422
    );
  }
  return transacoes;
}

/** Retorna um cupom com seus itens (usado pelo frontend no accordion). */
export async function obterCupomComItens(cupomId: number) {
  const cupom = await pool.query('SELECT * FROM cupons_fiscais WHERE id = $1', [cupomId]);
  if (cupom.rowCount === 0) throw new AppError(`Cupom ${cupomId} não encontrado.`, 404);
  const itens = await pool.query('SELECT * FROM itens_cupom WHERE cupom_id = $1 ORDER BY id', [cupomId]);
  return { ...cupom.rows[0], itens: itens.rows };
}
