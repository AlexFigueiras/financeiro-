export interface Tenant {
  id: string;
  nome: string;
  criadoEm: string;
}

export interface MembroTenant {
  tenantId: string;
  userId: string;
  papel: 'owner' | 'member';
}
