/**
 * Cache das chaves públicas (JWKS) do Supabase Auth, usadas para validar
 * tokens ES256 (JWT Signing Keys — padrão dos projetos novos). O endpoint
 * `/auth/v1/.well-known/jwks.json` é público; o cache em memória sobrevive
 * entre invocações "quentes" no serverless, então a busca por rede é rara.
 * Fail-closed: sem JWKS acessível, nenhum token ES256 é aceito.
 */
import { createPublicKey, JsonWebKey, KeyObject } from 'crypto';
import { env } from '../config/env';
import { AppError } from '../errors/app-error';

const TTL_CACHE_MS = 10 * 60_000;
/** Evita marretar o endpoint quando chegam tokens com `kid` desconhecido em série. */
const INTERVALO_MINIMO_ENTRE_BUSCAS_MS = 30_000;
const TIMEOUT_BUSCA_MS = 5_000;

type JwkComMetadados = JsonWebKey & { kid?: string; use?: string };

let chavesPorKid = new Map<string, KeyObject>();
let cacheExpiraEm = 0;
let ultimaBuscaEm = 0;

async function buscarJwks(): Promise<void> {
  ultimaBuscaEm = Date.now();
  const url = `${env.supabaseUrl}/auth/v1/.well-known/jwks.json`;

  let corpo: { keys?: JwkComMetadados[] };
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_BUSCA_MS) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    corpo = (await resposta.json()) as { keys?: JwkComMetadados[] };
  } catch {
    throw new AppError('Não foi possível validar a sessão agora. Tente novamente.', 503);
  }

  const novas = new Map<string, KeyObject>();
  for (const jwk of corpo.keys ?? []) {
    if (!jwk.kid || (jwk.use && jwk.use !== 'sig')) continue;
    // Só ES256 (EC P-256) — único algoritmo assimétrico aceito por `jwt.ts`.
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') continue;
    try {
      novas.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
    } catch {
      // uma entrada corrompida no JWKS não pode invalidar as demais
    }
  }
  chavesPorKid = novas;
  cacheExpiraEm = Date.now() + TTL_CACHE_MS;
}

/** Chave pública do `kid` informado, buscando/renovando o JWKS quando preciso. */
export async function obterChavePublica(kid: string | undefined): Promise<KeyObject> {
  if (!kid) throw new AppError('Token sem identificação da chave (kid).', 401);

  if (Date.now() >= cacheExpiraEm) await buscarJwks();

  let chave = chavesPorKid.get(kid);
  if (!chave && Date.now() - ultimaBuscaEm >= INTERVALO_MINIMO_ENTRE_BUSCAS_MS) {
    // `kid` desconhecido pode indicar rotação de chave recém-feita no Supabase.
    await buscarJwks();
    chave = chavesPorKid.get(kid);
  }
  if (!chave) throw new AppError('Assinatura do token inválida.', 401);
  return chave;
}

/** Zera o cache — usado nos testes. */
export function limparCacheJwks(): void {
  chavesPorKid = new Map();
  cacheExpiraEm = 0;
  ultimaBuscaEm = 0;
}
