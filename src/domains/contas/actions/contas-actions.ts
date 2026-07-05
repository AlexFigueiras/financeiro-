import { Router } from 'express';
import { asyncHandler, AppError } from '../../../shared/errors/app-error';
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

contasRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de conta inválido.', 400);
    const { nome, tipo } = req.body as { nome?: unknown; tipo?: unknown };
    const conta = await contasService.atualizar(req.tenantId!, id, nome, tipo);
    res.json(conta);
  })
);

contasRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de conta inválido.', 400);
    await contasService.excluir(req.tenantId!, id);
    res.json({ mensagem: 'Conta excluída com sucesso.' });
  })
);
