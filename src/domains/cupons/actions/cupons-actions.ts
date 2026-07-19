/** Rotas do domínio cupons: upload para OCR via Gemini + edição de categoria. */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../../../shared/errors/app-error';
import { cupomService } from '../index';
import { reconciliacaoService } from '../../reconciliacao';
import { categoriasService } from '../../categorias';

const upload = multer({
  storage: multer.memoryStorage(),
  // Vercel rejeita o corpo da requisição acima de 4.5 MB (FUNCTION_PAYLOAD_TOO_LARGE,
  // antes mesmo do multer rodar) — o limite fica abaixo disso para o multer barrar
  // primeiro, com uma mensagem tratada em vez do erro cru da plataforma.
  limits: { fileSize: 4 * 1024 * 1024 },
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

/** PATCH /api/cupons/itens/:id — edita nome/quantidade/preço/valor de um item de cupom. */
cuponsRouter.patch(
  '/itens/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de item inválido.', 400);
    await cupomService.atualizarItem(req.tenantId!, id, req.body ?? {});
    res.json({ mensagem: 'Item atualizado com sucesso.' });
  })
);

/** DELETE /api/cupons/itens/:id — exclui um item de cupom. */
cuponsRouter.delete(
  '/itens/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de item inválido.', 400);
    await cupomService.excluirItem(req.tenantId!, id);
    res.json({ mensagem: 'Item excluído com sucesso.' });
  })
);

/**
 * POST /api/cupons/upload
 * multipart/form-data: arquivo=<fotos ou PDF do cupom> (aceita múltiplos arquivos)
 */
cuponsRouter.post(
  '/upload',
  upload.array('arquivo', 10),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new AppError("Nenhum arquivo enviado. Use o campo multipart 'arquivo'.", 400);
    }
    const tenantId = req.tenantId!;
    const forcar = req.body.forcar === 'true' || req.body.forcar === true;
    const arquivosOcr = files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype, nome: f.originalname }));
    const resultado = await cupomService.processar(tenantId, arquivosOcr, { forcar });
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

/** GET /api/cupons — lista cupons pendentes de reconciliação. */
cuponsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await cupomService.listarPendentes(req.tenantId!));
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
