/** Rotas do Módulo C: upload de cupom fiscal para OCR via Gemini. */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { processarCupom, obterCupomComItens } from '../services/gemini';
import { reconciliarSeguro } from '../services/reconciliacao';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // fotos de celular chegam a alguns MB
});

export const cuponsRouter = Router();

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
    const resultado = await processarCupom(req.file.buffer, req.file.mimetype);
    const matches = await reconciliarSeguro('upload de cupom');
    const vinculado = matches.some((m) => m.cupom_fiscal_id === resultado.cupomId);

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
    res.json(await obterCupomComItens(id));
  })
);
