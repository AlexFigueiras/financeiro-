import { Router } from 'express';
import { asyncHandler } from '../../../shared/errors/app-error';
import { contasService } from '../index';

export const contasRouter = Router();

contasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await contasService.listar(req.tenantId!));
  })
);

contasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nome, tipo } = req.body as { nome?: unknown; tipo?: unknown };
    const conta = await contasService.criar(req.tenantId!, nome, tipo);
    res.status(201).json(conta);
  })
);
