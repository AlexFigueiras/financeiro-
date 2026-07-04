/** API pública do domínio tenancy — única porta de entrada para outros módulos. */
import { tenantRepositoryPg } from './adapters/tenant-repository-pg';
import { criarTenantService } from './services/tenant-service';

export const tenantService = criarTenantService(tenantRepositoryPg);
export type { Tenant, MembroTenant } from './types';
