import { describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({ authMode: 'supabase' as 'supabase' | 'off', devTenantId: 'dev-tenant-fixo' }));
const tenantServiceMock = vi.hoisted(() => ({ resolverOuProvisionar: vi.fn() }));

vi.mock('../../config/env', () => ({ env: envMock }));
vi.mock('../../../domains/tenancy', () => ({ tenantService: tenantServiceMock }));

import { tenantMiddleware } from '../tenant-middleware';

function fakeReq(auth?: { userId: string; email: string | null }) {
  return { auth } as unknown as Parameters<typeof tenantMiddleware>[0];
}

describe('tenantMiddleware (AUTH_MODE=off)', () => {
  it('usa o tenant de desenvolvimento fixo, sem chamar o domínio tenancy', async () => {
    envMock.authMode = 'off';
    const req = fakeReq();
    const next = vi.fn();
    await tenantMiddleware(req, {} as never, next);
    expect(req.tenantId).toBe('dev-tenant-fixo');
    expect(next).toHaveBeenCalledWith();
    expect(tenantServiceMock.resolverOuProvisionar).not.toHaveBeenCalled();
    envMock.authMode = 'supabase';
  });
});

describe('tenantMiddleware (AUTH_MODE=supabase)', () => {
  it('rejeita quando não há req.auth (authMiddleware não rodou antes)', async () => {
    const next = vi.fn();
    await tenantMiddleware(fakeReq(undefined), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('resolve o tenant via tenantService e popula req.tenantId', async () => {
    tenantServiceMock.resolverOuProvisionar.mockResolvedValueOnce('tenant-resolvido');
    const req = fakeReq({ userId: 'user-1', email: 'a@b.com' });
    const next = vi.fn();
    await tenantMiddleware(req, {} as never, next);
    expect(req.tenantId).toBe('tenant-resolvido');
    expect(tenantServiceMock.resolverOuProvisionar).toHaveBeenCalledWith('user-1', 'a@b.com');
    expect(next).toHaveBeenCalledWith();
  });

  it('propaga erro do tenantService para o next', async () => {
    tenantServiceMock.resolverOuProvisionar.mockRejectedValueOnce(new Error('falha ao provisionar'));
    const req = fakeReq({ userId: 'user-2', email: null });
    const next = vi.fn();
    await tenantMiddleware(req, {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
