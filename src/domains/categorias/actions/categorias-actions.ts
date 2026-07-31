import { Router } from 'express';
import { asyncHandler, AppError } from '../../../shared/errors/app-error';
import { categoriasService } from '../index';

export const categoriasRouter = Router();

/** Listar categorias do tenant. */
categoriasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await categoriasService.listar(req.tenantId!));
  })
);

/** Criar nova categoria. */
categoriasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nome, cor, chave } = req.body as { nome?: unknown; cor?: unknown; chave?: unknown };
    const categoria = await categoriasService.criar(req.tenantId!, nome, cor, chave);
    res.status(201).json(categoria);
  })
);

/** Atualizar nome e/ou cor de uma categoria. */
categoriasRouter.patch(
  '/:chave',
  asyncHandler(async (req, res) => {
    const { chave } = req.params;
    if (!chave) throw new AppError('Chave da categoria inválida.', 400);
    const { nome, cor } = req.body as { nome?: unknown; cor?: unknown };
    const categoria = await categoriasService.atualizar(req.tenantId!, chave, nome, cor);
    res.json(categoria);
  })
);

/** Excluir categoria. */
categoriasRouter.delete(
  '/:chave',
  asyncHandler(async (req, res) => {
    const { chave } = req.params;
    if (!chave) throw new AppError('Chave da categoria inválida.', 400);
    await categoriasService.excluir(req.tenantId!, chave);
    res.json({ mensagem: 'Categoria excluída com sucesso.' });
  })
);
