/** Rotas do domínio cupons: upload para OCR via Gemini + edição de categoria. */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../../../shared/errors/app-error';
import { cupomService } from '../index';
import { reconciliacaoService } from '../../reconciliacao';
import { categoriasService } from '../../categorias';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // fotos de celular chegam a alguns MB
});

export const cuponsRouter = Router();

/** GET /api/cupons/categorias — lista todas as categorias do tenant. */
cuponsRouter.get(
  '/categorias',
  asyncHandler(async (req, res) => {
    res.json(await categoriasService.listar(req.tenantId!));
  })
);

/** PATCH /api/cupons/itens/:id/categoria — atualiza a categoria de um item de cupom. */
cuponsRouter.patch(
  '/itens/:id/categoria',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de item inválido.', 400);
    await cupomService.atualizarCategoriaItem(req.tenantId!, id, req.body?.categoria);
    res.json({ mensagem: 'Categoria atualizada com sucesso e aprendida para compras futuras.' });
  })
);

/**
 * POST /api/cupons/upload
 * multipart/form-data: arquivo=<foto ou PDF do cupom>
 */
cuponsRouter.post(
  '/upload',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("Nenhum arquivo enviado. Use o campo multipart 'arquivo'.", 400);
    }
    const tenantId = req.tenantId!;
    const resultado = await cupomService.processar(tenantId, req.file.buffer, req.file.mimetype);
    const matches = await reconciliacaoService.reconciliarSeguro(tenantId, 'upload de cupom');
    const vinculado = matches.some((m) => m.cupomFiscalId === resultado.cupomId);

    res.status(201).json({
      mensagem: vinculado
        ? 'Cupom processado e reconciliado automaticamente com uma transação bancária.'
        : 'Cupom processado. Nenhuma transação correspondente encontrada ainda.',
      ...resultado,
      reconciliadoAutomaticamente: vinculado,
    });
  })
);

/** GET /api/cupons/:id — cupom com itens desmembrados. */
cuponsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de cupom inválido.', 400);
    res.json(await cupomService.obterComItens(req.tenantId!, id));
  })
);
