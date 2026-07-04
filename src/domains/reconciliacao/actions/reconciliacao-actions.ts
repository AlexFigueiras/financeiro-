import { Router } from 'express';
import { asyncHandler } from '../../../shared/errors/app-error';
import { reconciliacaoService } from '../index';

export const reconciliacaoRouter = Router();

/** POST /api/transacoes/reconciliar — dispara o motor manualmente. */
reconciliacaoRouter.post(
  '/reconciliar',
  asyncHandler(async (req, res) => {
    const matches = await reconciliacaoService.reconciliar(req.tenantId!, 'manual');
    res.json({ mensagem: 'Motor de reconciliação executado.', matches });
  })
);
