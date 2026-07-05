/**
 * Verificação de JWT do Supabase Auth usando apenas o crypto nativo do Node —
 * decisão registrada em docs/DECISIONS.md: evita dependência de runtime extra
 * (§2.4). Os algoritmos aceitos são FIXADOS: ES256 (JWT Signing Keys, padrão
 * dos projetos novos) e HS256 (segredo compartilhado legado). Tokens
 * "alg: none" ou de qualquer outro algoritmo são rejeitados (previne confusão
 * de algoritmo).
 */
import { createHmac, timingSafeEqual, verify, KeyObject } from 'crypto';
import { AppError } from '../errors/app-error';

export interface PayloadJwt {
  sub: string;
  email?: string;
  exp: number;
  aud?: string | string[];
  role?: string;
  [claim: string]: unknown;
}

interface HeaderJwt {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface PartesJwt {
  headerB64: string;
  payloadB64: string;
  assinatura: Buffer;
  header: HeaderJwt;
  payload: PayloadJwt;
}

function base64UrlDecode(parte: string): Buffer {
  return Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const LEEWAY_SEGUNDOS = 30;

function dividirToken(token: string): PartesJwt {
  const partes = token.split('.');
  if (partes.length !== 3) throw new AppError('Token malformado.', 401);
  const [headerB64, payloadB64, assinaturaB64] = partes;
  try {
    return {
      headerB64,
      payloadB64,
      assinatura: base64UrlDecode(assinaturaB64),
      header: JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as HeaderJwt,
      payload: JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as PayloadJwt,
    };
  } catch {
    throw new AppError('Token ilegível.', 401);
  }
}

function validarPayload(payload: PayloadJwt): PayloadJwt {
  const agora = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_SEGUNDOS < agora) {
    throw new AppError('Sessão expirada. Entre novamente.', 401);
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new AppError('Token sem identificação de usuário.', 401);
  }
  return payload;
}

/** Lê alg/kid do header SEM validar nada — só para escolher o verificador. */
export function extrairAlgKid(token: string): { alg?: string; kid?: string } {
  const { header } = dividirToken(token);
  return { alg: header.alg, kid: header.kid };
}

/** Verifica assinatura HS256 + expiração e retorna o payload. Lança AppError 401. */
export function verificarJwtHs256(token: string, segredo: string): PayloadJwt {
  const { headerB64, payloadB64, assinatura, header, payload } = dividirToken(token);

  if (header.alg !== 'HS256') {
    throw new AppError('Algoritmo de token não suportado.', 401);
  }

  const esperada = createHmac('sha256', segredo)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  if (esperada.length !== assinatura.length || !timingSafeEqual(esperada, assinatura)) {
    throw new AppError('Assinatura do token inválida.', 401);
  }

  return validarPayload(payload);
}

/**
 * Verifica assinatura ES256 (ECDSA P-256/SHA-256) com a chave pública do JWKS
 * do projeto Supabase (ver `jwks.ts`). A assinatura de JWT vem no formato cru
 * r||s (IEEE P1363), por isso o `dsaEncoding` explícito.
 */
export function verificarJwtEs256(token: string, chavePublica: KeyObject): PayloadJwt {
  const { headerB64, payloadB64, assinatura, header, payload } = dividirToken(token);

  if (header.alg !== 'ES256') {
    throw new AppError('Algoritmo de token não suportado.', 401);
  }

  const valida = verify(
    'sha256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    { key: chavePublica, dsaEncoding: 'ieee-p1363' },
    assinatura
  );
  if (!valida) {
    throw new AppError('Assinatura do token inválida.', 401);
  }

  return validarPayload(payload);
}
