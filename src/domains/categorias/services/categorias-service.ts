import { CategoriasRepository } from '../ports/categorias-repository';

export function criarCategoriasService(repo: CategoriasRepository) {
  return {
    listar: (tenantId: string) => repo.listar(tenantId),
    existe: (tenantId: string, chave: string) => repo.existe(tenantId, chave),
  };
}
