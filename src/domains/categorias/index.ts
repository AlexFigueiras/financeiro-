/** API pública do domínio categorias. */
import { categoriasRepositoryPg } from './adapters/categorias-repository-pg';
import { criarCategoriasService } from './services/categorias-service';
import { seedCategoriasPadrao } from './adapters/categorias-seed';

const serviceBase = criarCategoriasService(categoriasRepositoryPg);

export const categoriasService = {
  ...serviceBase,
  seed: seedCategoriasPadrao,
};
export type { Categoria } from './types';
export { registrarListenerSeedCategorias } from './listeners/seed-categorias-listener';
