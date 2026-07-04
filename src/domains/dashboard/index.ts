/** API pública do domínio dashboard. */
import { dashboardRepositoryPg } from './adapters/dashboard-repository-pg';
import { criarDashboardService } from './services/dashboard-service';

export const dashboardService = criarDashboardService(dashboardRepositoryPg);
export type { ResumoMensal, FluxoDiario, GastosPorCategoria } from './types';
export { dashboardRouter } from './actions/dashboard-actions';
