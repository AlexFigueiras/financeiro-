import { Tenant } from '../types';

/** Contrato de persistência do domínio tenancy — implementado em adapters/. */
export interface TenantRepository {
  buscarTenantIdDoUsuario(userId: string): Promise<string | null>;
  criarTenantComOwner(userId: string, nome: string): Promise<Tenant>;
}
