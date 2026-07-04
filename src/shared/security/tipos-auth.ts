/** Identidade autenticada anexada à requisição pelo authMiddleware. */
export interface IdentidadeAutenticada {
  userId: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: IdentidadeAutenticada;
      tenantId?: string;
    }
  }
}

export {};
