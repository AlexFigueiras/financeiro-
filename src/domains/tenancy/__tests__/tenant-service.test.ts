import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/observability/audit', () => ({ auditar: vi.fn().mockResolvedValue(undefined) }));

import { criarTenantService } from '../services/tenant-service';
import { TenantRepository } from '../ports/tenant-repository';
import { Tenant } from '../types';

function fakeRepo(tenantsPorUsuario: Record<string, string> = {}): {
  repo: TenantRepository;
  criados: Array<{ userId: string; nome: string }>;
} {
  const criados: Array<{ userId: string; nome: string }> = [];
  const repo: TenantRepository = {
    async buscarTenantIdDoUsuario(userId) {
      return tenantsPorUsuario[userId] ?? null;
    },
    async criarTenantComOwner(userId, nome): Promise<Tenant> {
      criados.push({ userId, nome });
      return { id: '22222222-2222-4222-8222-222222222222', nome, criadoEm: new Date().toISOString() };
    },
  };
  return { repo, criados };
}

describe('tenantService.resolverOuProvisionar', () => {
  it('retorna o tenant existente sem criar um novo', async () => {
    const { repo, criados } = fakeRepo({ 'user-1': 'tenant-existente' });
    const service = criarTenantService(repo);
    await expect(service.resolverOuProvisionar('user-1', 'a@b.com')).resolves.toBe('tenant-existente');
    expect(criados).toHaveLength(0);
  });

  it('provisiona um tenant novo no primeiro acesso, nomeado pelo e-mail', async () => {
    const { repo, criados } = fakeRepo();
    const service = criarTenantService(repo);
    const tenantId = await service.resolverOuProvisionar('user-2', 'novo@ex.com');
    expect(tenantId).toBe('22222222-2222-4222-8222-222222222222');
    expect(criados).toEqual([{ userId: 'user-2', nome: 'Conta de novo@ex.com' }]);
  });

  it('usa nome genérico quando não há e-mail', async () => {
    const { repo, criados } = fakeRepo();
    const service = criarTenantService(repo);
    await service.resolverOuProvisionar('user-3', null);
    expect(criados[0].nome).toBe('Nova conta');
  });
});
