import { NextFunction, Request, Response } from 'express';

/** Erro de domínio com status HTTP explícito. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Envolve handlers async para propagar rejeições ao errorHandler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ erro: err.message, detalhes: err.details ?? null });
    return;
  }
  // Violação de unicidade do Postgres (ex.: hash_ofx duplicado fora do fluxo normal)
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
    res.status(409).json({ erro: 'Registro duplicado.', detalhes: (err as Error).message });
    return;
  }
  console.error('[erro não tratado]', err);
  res.status(500).json({ erro: 'Erro interno do servidor.', detalhes: null });
}
