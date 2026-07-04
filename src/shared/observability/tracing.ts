/**
 * Rastreabilidade por request: um correlation id (request_id) gerado (ou
 * propagado via header x-request-id) acompanha logs e auditoria da requisição
 * inteira via AsyncLocalStorage. Vendor-neutral: é o mesmo modelo de contexto
 * do OpenTelemetry — quando um APM for plugado, este módulo vira a costura
 * (troca-se o store por spans OTel sem tocar nos domínios).
 */
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export interface ContextoRequisicao {
  requestId: string;
  userId?: string;
  tenantId?: string;
}

const storage = new AsyncLocalStorage<ContextoRequisicao>();

export function contextoAtual(): ContextoRequisicao | undefined {
  return storage.getStore();
}

/** Enriquece o contexto corrente (ex.: depois que auth resolve user/tenant). */
export function enriquecerContexto(dados: Partial<ContextoRequisicao>): void {
  const atual = storage.getStore();
  if (atual) Object.assign(atual, dados);
}

/** Middleware: abre o contexto de rastreio e devolve o id no response header. */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.header('x-request-id') ?? randomUUID()).slice(0, 64);
  res.setHeader('x-request-id', requestId);
  storage.run({ requestId }, () => next());
}
