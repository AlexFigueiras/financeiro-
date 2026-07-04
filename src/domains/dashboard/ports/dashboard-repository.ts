import { FluxoDiario, GastosPorCategoria, ResumoMensal } from '../types';

/**
 * Read model cross-domain: agrega dados de contas/transações/cupons para os
 * KPIs. Não executa regra de negócio de outros domínios (só projeta dados já
 * persistidos) — aceito como exceção de leitura pura, documentada em CONTEXT.md.
 */
export interface DashboardRepository {
  resumo(tenantId: string, mes: string): Promise<ResumoMensal>;
  fluxoDiario(tenantId: string, mes: string): Promise<FluxoDiario>;
  gastosPorCategoria(tenantId: string, mes: string): Promise<GastosPorCategoria>;
}
