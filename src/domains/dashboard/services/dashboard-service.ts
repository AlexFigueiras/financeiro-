import { DashboardRepository } from '../ports/dashboard-repository';
import { AppError } from '../../../shared/errors/app-error';

function validarMes(raw: unknown): string {
  const mes = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new AppError('Parâmetro mes é obrigatório no formato YYYY-MM.', 400);
  }
  return mes;
}

export function criarDashboardService(repo: DashboardRepository) {
  return {
    resumo: async (tenantId: string, mesRaw: unknown) => repo.resumo(tenantId, validarMes(mesRaw)),
    fluxoDiario: async (tenantId: string, mesRaw: unknown) => repo.fluxoDiario(tenantId, validarMes(mesRaw)),
    gastosPorCategoria: async (tenantId: string, mesRaw: unknown) => repo.gastosPorCategoria(tenantId, validarMes(mesRaw)),
  };
}
