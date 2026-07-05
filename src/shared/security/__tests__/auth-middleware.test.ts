import { createHmac, generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

const SEGREDO = 'segredo-de-teste-com-mais-de-vinte-chars';

const envMock = vi.hoisted(() => ({ authMode: 'supabase' as 'supabase' | 'off', supabaseJwtSecret: '' }));
envMock.supabaseJwtSecret = SEGREDO;

const jwksMock = vi.hoisted(() => ({ obterChavePublica: vi.fn() }));

vi.mock('../../config/env', () => ({ env: envMock }));
vi.mock('../jwks', () => jwksMock);

import { authMiddleware } from '../auth-middleware';

function fakeReq(header?: string) {
  return { header: (_nome: string) => header } as unknown as Parameters<typeof authMiddleware>[0];
}

function base64Url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function assinar(payload: Record<string, unknown>): string {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url(payload);
  const assinatura = createHmac('sha256', SEGREDO).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${assinatura}`;
}

describe('authMiddleware (AUTH_MODE=supabase)', () => {
  it('rejeita requisição sem header Authorization', async () => {
    envMock.authMode = 'supabase';
    const next = vi.fn();
    await authMiddleware(fakeReq(undefined), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejeita esquema diferente de Bearer', async () => {
    const next = vi.fn();
    await authMiddleware(fakeReq('Basic abc123'), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejeita token com assinatura inválida', async () => {
    const tokenForjado = assinar({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }) + 'x';
    const next = vi.fn();
    await authMiddleware(fakeReq(`Bearer ${tokenForjado}`), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('aceita um token HS256 válido e popula req.auth', async () => {
    const token = assinar({ sub: 'user-42', email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = fakeReq(`Bearer ${token}`);
    const next = vi.fn();
    await authMiddleware(req, {} as never, next);
    expect(req.auth).toEqual({ userId: 'user-42', email: 'a@b.com' });
    expect(next).toHaveBeenCalledWith();
  });

  it('aceita um token ES256 válido usando a chave pública do JWKS', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    jwksMock.obterChavePublica.mockResolvedValueOnce(publicKey);

    const header = base64Url({ alg: 'ES256', typ: 'JWT', kid: 'kid-1' });
    const body = base64Url({ sub: 'user-77', email: 'e@f.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const assinatura = sign('sha256', Buffer.from(`${header}.${body}`), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');

    const req = fakeReq(`Bearer ${header}.${body}.${assinatura}`);
    const next = vi.fn();
    await authMiddleware(req, {} as never, next);
    expect(jwksMock.obterChavePublica).toHaveBeenCalledWith('kid-1');
    expect(req.auth).toEqual({ userId: 'user-77', email: 'e@f.com' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejeita algoritmo desconhecido sem consultar o JWKS', async () => {
    jwksMock.obterChavePublica.mockClear();
    const header = base64Url({ alg: 'RS256', typ: 'JWT' });
    const body = base64Url({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const next = vi.fn();
    await authMiddleware(fakeReq(`Bearer ${header}.${body}.abc`), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(jwksMock.obterChavePublica).not.toHaveBeenCalled();
  });
});

describe('authMiddleware (AUTH_MODE=off)', () => {
  it('não exige token e usa o usuário de desenvolvimento', async () => {
    envMock.authMode = 'off';
    const req = fakeReq(undefined);
    const next = vi.fn();
    await authMiddleware(req, {} as never, next);
    expect(req.auth).toEqual({ userId: 'usuario-dev-local', email: null });
    expect(next).toHaveBeenCalledWith();
    envMock.authMode = 'supabase';
  });
});
