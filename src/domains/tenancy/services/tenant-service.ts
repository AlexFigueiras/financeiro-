import { TenantRepository } from '../ports/tenant-repository';
import { auditar } from '../../../shared/observability/audit';
import { publicar } from '../../../events/bus';

/**
 * Resolve o tenant do usuário autenticado, provisionando um tenant novo no
 * primeiro acesso (self-service signup: login → tenant próprio, sem passo
 * manual de admin). Idempotente sob corrida leve: se dois requests concorrerem
 * na primeira chamada, o segundo simplesmente cria um tenant extra — cenário
 * raríssimo (mesmo usuário, dois logins simultâneos) e sem risco de dado
 * cruzado; documentado em CONTEXT.md.
 */
export function criarTenantService(repo: TenantRepository) {
  return {
    async resolverOuProvisionar(userId: string, email: string | null): Promise<string> {
      const existente = await repo.buscarTenantIdDoUsuario(userId);
      if (existente) return existente;

      const nome = email ? `Conta de ${email}` : 'Nova conta';
      const tenant = await repo.criarTenantComOwner(userId, nome);
      await auditar({ acao: 'tenant.provisionado', recurso: `tenant:${tenant.id}`, detalhes: { userId } });
      await publicar('tenant.criado.v1', { tenantId: tenant.id, nome: tenant.nome });
      return tenant.id;
    },
  };
}
