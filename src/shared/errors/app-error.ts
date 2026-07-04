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
