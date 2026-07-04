import { describe, expect, it } from 'vitest';
import { criarDashboardService } from '../services/dashboard-service';
import { DashboardRepository } from '../ports/dashboard-repository';

const REPO_FAKE: DashboardRepository = {
  async resumo(_t, mes) {
    return { mes, saldoConsolidado: 0, totalGanhosMes: 0, totalGastosMes: 0, balancoLiquidoMes: 0 };
  },
  async fluxoDiario(_t, mes) {
    return { mes, dias: [] };
  },
  async gastosPorCategoria(_t, mes) {
    return { mes, categorias: [], gastosNaoDetalhados: 0 };
  },
};

describe('dashboardService', () => {
  const service = criarDashboardService(REPO_FAKE);

  it('rejeita mes ausente/mal formatado em todos os métodos', async () => {
    await expect(service.resumo('t1', undefined)).rejects.toThrow('formato YYYY-MM');
    await expect(service.fluxoDiario('t1', '2026-1')).rejects.toThrow('formato YYYY-MM');
    await expect(service.gastosPorCategoria('t1', 'jan/2026')).rejects.toThrow('formato YYYY-MM');
  });

  it('repassa mes válido ao repositório', async () => {
    await expect(service.resumo('t1', '2026-01')).resolves.toMatchObject({ mes: '2026-01' });
  });
});
