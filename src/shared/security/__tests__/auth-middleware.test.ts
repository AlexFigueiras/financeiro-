import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

const SEGREDO = 'segredo-de-teste-com-mais-de-vinte-chars';

const envMock = vi.hoisted(() => ({ authMode: 'supabase' as 'supabase' | 'off', supabaseJwtSecret: '' }));
envMock.supabaseJwtSecret = SEGREDO;

vi.mock('../../config/env', () => ({ env: envMock }));

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
  it('rejeita requisição sem header Authorization', () => {
    envMock.authMode = 'supabase';
    const next = vi.fn();
    authMiddleware(fakeReq(undefined), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejeita esquema diferente de Bearer', () => {
    const next = vi.fn();
    authMiddleware(fakeReq('Basic abc123'), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejeita token com assinatura inválida', () => {
    const tokenForjado = assinar({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }) + 'x';
    const next = vi.fn();
    authMiddleware(fakeReq(`Bearer ${tokenForjado}`), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('aceita um token válido e popula req.auth', () => {
    const token = assinar({ sub: 'user-42', email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = fakeReq(`Bearer ${token}`);
    const next = vi.fn();
    authMiddleware(req, {} as never, next);
    expect(req.auth).toEqual({ userId: 'user-42', email: 'a@b.com' });
    expect(next).toHaveBeenCalledWith();
  });
});

describe('authMiddleware (AUTH_MODE=off)', () => {
  it('não exige token e usa o usuário de desenvolvimento', () => {
    envMock.authMode = 'off';
    const req = fakeReq(undefined);
    const next = vi.fn();
    authMiddleware(req, {} as never, next);
    expect(req.auth).toEqual({ userId: 'usuario-dev-local', email: null });
    expect(next).toHaveBeenCalledWith();
    envMock.authMode = 'supabase';
  });
});
