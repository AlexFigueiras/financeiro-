import { NextFunction, Request, Response } from 'express';
import { AppError } from './app-error';
import { logger } from '../observability/logger';
import { incrementar } from '../observability/metrics';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    incrementar('http_erros_total', { status: String(err.status) });
    res.status(err.status).json({ erro: err.message, detalhes: err.details ?? null });
    return;
  }
  // Violação de unicidade do Postgres (ex.: hash_ofx duplicado fora do fluxo normal)
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
    incrementar('http_erros_total', { status: '409' });
    res.status(409).json({ erro: 'Registro duplicado.', detalhes: (err as Error).message });
    return;
  }
  incrementar('http_erros_total', { status: '500' });
  logger.error({ err }, 'erro não tratado');
  res.status(500).json({ erro: 'Erro interno do servidor.', detalhes: null });
}
