import { Categoria } from '../types';

export interface CategoriasRepository {
  listar(tenantId: string): Promise<Categoria[]>;
  existe(tenantId: string, chave: string): Promise<boolean>;
  criar(tenantId: string, categoria: Categoria): Promise<Categoria>;
  atualizar(tenantId: string, chave: string, dados: Partial<Omit<Categoria, 'chave'>>): Promise<Categoria>;
  excluir(tenantId: string, chave: string): Promise<void>;
}
