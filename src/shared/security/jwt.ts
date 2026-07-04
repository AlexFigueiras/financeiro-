/**
 * Verificação de JWT HS256 (tokens do Supabase Auth) usando apenas o crypto
 * nativo do Node — decisão registrada em docs/DECISIONS.md: evita dependência
 * de runtime extra (§2.4). O algoritmo é FIXADO em HS256; tokens "alg: none"
 * ou assimétricos são rejeitados (previne confusão de algoritmo).
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '../errors/app-error';

export interface PayloadJwt {
  sub: string;
  email?: string;
  exp: number;
  aud?: string | string[];
  role?: string;
  [claim: string]: unknown;
}

function base64UrlDecode(parte: string): Buffer {
  return Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const LEEWAY_SEGUNDOS = 30;

/** Verifica assinatura + expiração e retorna o payload. Lança AppError 401. */
export function verificarJwtHs256(token: string, segredo: string): PayloadJwt {
  const partes = token.split('.');
  if (partes.length !== 3) throw new AppError('Token malformado.', 401);
  const [headerB64, payloadB64, assinaturaB64] = partes;

  let header: { alg?: string; typ?: string };
  let payload: PayloadJwt;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new AppError('Token ilegível.', 401);
  }

  if (header.alg !== 'HS256') {
    throw new AppError('Algoritmo de token não suportado.', 401);
  }

  const esperada = createHmac('sha256', segredo)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const recebida = base64UrlDecode(assinaturaB64);
  if (
    esperada.length !== recebida.length ||
    !timingSafeEqual(esperada, recebida)
  ) {
    throw new AppError('Assinatura do token inválida.', 401);
  }

  const agora = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_SEGUNDOS < agora) {
    throw new AppError('Sessão expirada. Entre novamente.', 401);
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new AppError('Token sem identificação de usuário.', 401);
  }
  return payload;
}
