import { Categoria } from '../types';

export interface CategoriasRepository {
  listar(tenantId: string): Promise<Categoria[]>;
  existe(tenantId: string, chave: string): Promise<boolean>;
}
