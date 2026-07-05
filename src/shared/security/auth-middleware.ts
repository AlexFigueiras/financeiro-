/**
 * Lei 7.5 (menor privilégio, fail-closed): toda rota /api exige Bearer JWT do
 * Supabase Auth quando AUTH_MODE=supabase (padrão). AUTH_MODE=off existe só
 * para desenvolvimento local single-user e loga warning alto no boot.
 */
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/app-error';
import { avisarModoSemAuth } from '../observability/logger';
import { enriquecerContexto } from '../observability/tracing';
import { extrairAlgKid, PayloadJwt, verificarJwtEs256, verificarJwtHs256 } from './jwt';
import { obterChavePublica } from './jwks';
import './tipos-auth';

const USUARIO_DEV = 'usuario-dev-local';

/**
 * O Supabase assina tokens com ES256 (JWT Signing Keys — projetos novos, chave
 * pública via JWKS) ou HS256 (segredo compartilhado legado). Qualquer outro
 * algoritmo é rejeitado.
 */
async function verificarToken(token: string): Promise<PayloadJwt> {
  const { alg, kid } = extrairAlgKid(token);
  if (alg === 'HS256') return verificarJwtHs256(token, env.supabaseJwtSecret);
  if (alg === 'ES256') return verificarJwtEs256(token, await obterChavePublica(kid));
  throw new AppError('Algoritmo de token não suportado.', 401);
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (env.authMode === 'off') {
    avisarModoSemAuth();
    req.auth = { userId: USUARIO_DEV, email: null };
    enriquecerContexto({ userId: USUARIO_DEV });
    next();
    return;
  }

  const header = req.header('authorization') ?? '';
  const [esquema, token] = header.split(' ');
  if (!token || esquema.toLowerCase() !== 'bearer') {
    next(new AppError('Autenticação necessária. Envie Authorization: Bearer <token>.', 401));
    return;
  }

  try {
    const payload = await verificarToken(token);
    req.auth = {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
    };
    enriquecerContexto({ userId: payload.sub });
    next();
  } catch (err) {
    next(err);
  }
}
