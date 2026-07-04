import { Router } from 'express';
import { asyncHandler } from '../../../shared/errors/app-error';
import { dashboardService } from '../index';

export const dashboardRouter = Router();

/** GET /api/dashboard/resumo?mes=YYYY-MM — KPIs: saldo, ganhos, gastos, balanço. */
dashboardRouter.get(
  '/resumo',
  asyncHandler(async (req, res) => {
    res.json(await dashboardService.resumo(req.tenantId!, req.query.mes));
  })
);

/** GET /api/dashboard/fluxo-diario?mes=YYYY-MM — série diária ganhos vs gastos. */
dashboardRouter.get(
  '/fluxo-diario',
  asyncHandler(async (req, res) => {
    res.json(await dashboardService.fluxoDiario(req.tenantId!, req.query.mes));
  })
);

/** GET /api/dashboard/gastos-por-categoria?mes=YYYY-MM — distribuição por categoria. */
dashboardRouter.get(
  '/gastos-por-categoria',
  asyncHandler(async (req, res) => {
    res.json(await dashboardService.gastosPorCategoria(req.tenantId!, req.query.mes));
  })
);
