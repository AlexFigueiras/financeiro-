import { assinar } from '../../../events/bus';
import { seedCategoriasPadrao } from '../adapters/categorias-seed';

/** Registra o assinante que dá seed no catálogo padrão de categorias para todo tenant novo. */
export function registrarListenerSeedCategorias(): void {
  assinar('tenant.criado.v1', async ({ tenantId }) => {
    await seedCategoriasPadrao(tenantId);
  });
}
