/** API pública do domínio categorias. */
import { categoriasRepositoryPg } from './adapters/categorias-repository-pg';
import { criarCategoriasService } from './services/categorias-service';

export const categoriasService = criarCategoriasService(categoriasRepositoryPg);
export type { Categoria } from './types';
export { registrarListenerSeedCategorias } from './listeners/seed-categorias-listener';
