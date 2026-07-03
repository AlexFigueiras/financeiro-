/**
 * MÓDULO A — Integração oficial Mercado Pago (API nativa).
 * Autentica com o Access Token de produção (.env) e importa o histórico de
 * pagamentos via GET /v1/payments/search para a tabela transacoes_banco.
 */
import { createHash } from 'crypto';
import { pool } from '../db/pool';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

const MP_BASE_URL = 'https://api.mercadopago.com';
const PAGE_SIZE = 50;
const MAX_PAGES = 40; // trava de segurança: no máx. 2000 transações por sincronização

interface MpPayment {
  id: number;
  status: string;
  date_approved: string | null;
  date_created: string;
  description: string | null;
  transaction_amount: number;
  operation_type?: string;
  payment_method_id?: string;
  payer?: { email?: string };
  collector_id?: number;
}

interface MpSearchResponse {
  results: MpPayment[];
  paging: { total: number; limit: number; offset: number };
}

async function mpFetch(path: string): Promise<MpSearchResponse> {
  let response: Response;
  try {
    response = await fetch(`${MP_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${env.mpAccessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new AppError(
      `Falha de rede ao consultar a API do Mercado Pago: ${(err as Error).message}`,
      502
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      'Mercado Pago recusou o Access Token (401/403). Verifique MP_ACCESS_TOKEN no .env.',
      502
    );
  }
  if (response.status === 429) {
    throw new AppError('Rate limit da API do Mercado Pago atingido. Tente novamente em instantes.', 503);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AppError(`API do Mercado Pago retornou ${response.status}: ${body.slice(0, 300)}`, 502);
  }
  return (await response.json()) as MpSearchResponse;
}

/**
 * Sinal da transação sob a ótica da conta do usuário:
 * pagamentos em que o usuário é o COLETOR são entradas (+); demais, saídas (-).
 */
function normalizarValor(p: MpPayment, meuCollectorId: number | null): number {
  const entrada = meuCollectorId !== null && p.collector_id === meuCollectorId;
  const bruto = Math.abs(p.transaction_amount);
  return entrada ? bruto : -bruto;
}

function hashTransacao(dataIso: string, valor: number, descricao: string, contaId: number): string {
  return createHash('sha256')
    .update(`${dataIso}|${valor.toFixed(2)}|${descricao}|conta:${contaId}`)
    .digest('hex');
}

async function obterContaMercadoPago(): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM contas_bancarias WHERE nome = 'Mercado Pago' LIMIT 1`
  );
  if (rows.length === 0) {
    throw new AppError("Conta 'Mercado Pago' não encontrada. Rode a migração do schema (seed).", 500);
  }
  return rows[0].id;
}

async function descobrirCollectorId(): Promise<number | null> {
  try {
    const response = await fetch(`${MP_BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${env.mpAccessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const me = (await response.json()) as { id?: number };
    return typeof me.id === 'number' ? me.id : null;
  } catch {
    return null;
  }
}

export interface ResultadoSync {
  importadas: number;
  ignoradasDuplicadas: number;
  paginasLidas: number;
}

/**
 * Busca pagamentos aprovados dos últimos `dias` e insere em transacoes_banco.
 * Idempotente: o hash único descarta o que já foi importado.
 */
export async function sincronizarMercadoPago(dias = 90): Promise<ResultadoSync> {
  const contaId = await obterContaMercadoPago();
  const meuCollectorId = await descobrirCollectorId();

  const inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const fim = new Date().toISOString();

  let importadas = 0;
  let ignoradasDuplicadas = 0;
  let paginasLidas = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const query = new URLSearchParams({
      sort: 'date_created',
      criteria: 'desc',
      range: 'date_created',
      begin_date: inicio,
      end_date: fim,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    const data = await mpFetch(`/v1/payments/search?${query.toString()}`);
    paginasLidas++;

    for (const p of data.results) {
      // Só transações efetivadas entram no extrato
      if (p.status !== 'approved') continue;

      const dataIso = p.date_approved ?? p.date_created;
      const valor = normalizarValor(p, meuCollectorId);
      const descricao =
        (p.description && p.description.trim()) ||
        `Mercado Pago ${p.operation_type ?? 'pagamento'} #${p.id}`;
      // O id do pagamento MP já é único — entra no hash para robustez extra
      const hash = hashTransacao(dataIso, valor, `mp:${p.id}:${descricao}`, contaId);

      const result = await pool.query(
        `INSERT INTO transacoes_banco (conta_id, data_transacao, descricao_bruta, valor, hash_ofx, origem)
         VALUES ($1, $2, $3, $4, $5, 'mercadopago')
         ON CONFLICT (hash_ofx) DO NOTHING`,
        [contaId, dataIso, descricao, valor, hash]
      );
      if (result.rowCount === 1) importadas++;
      else ignoradasDuplicadas++;
    }

    if (offset + PAGE_SIZE >= data.paging.total || data.results.length === 0) break;
  }

  return { importadas, ignoradasDuplicadas, paginasLidas };
}
