/** Rotas de upload de extrato bancário: arquivo OFX ou extrato em PDF/imagem. */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../../../shared/errors/app-error';
import { extratoService } from '../index';
import { contasService } from '../../contas';
import { reconciliacaoService } from '../../reconciliacao';

const upload = multer({
  storage: multer.memoryStorage(),
  // Vercel rejeita o corpo da requisição acima de 4.5 MB (FUNCTION_PAYLOAD_TOO_LARGE,
  // antes mesmo do multer rodar) — o limite fica abaixo disso para o multer barrar
  // primeiro, com uma mensagem tratada em vez do erro cru da plataforma.
  limits: { fileSize: 4 * 1024 * 1024 },
});

export const extratoRouter = Router();

/**
 * POST /api/extrato/upload-ofx
 * multipart/form-data: arquivo=<.ofx | .pdf | imagem> [conta_id]
 */
extratoRouter.post(
  '/upload-ofx',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("Nenhum arquivo enviado. Use o campo multipart 'arquivo'.", 400);
    }
    const tenantId = req.tenantId!;
    const contaId = await contasService.resolverContaId(tenantId, req.body.conta_id);

    const { resultado, via } = await extratoService.importarArquivo(
      tenantId,
      contaId,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname ?? ''
    );

    const matches = await reconciliacaoService.reconciliarSeguro(tenantId, 'upload extrato');
    res.status(201).json({
      mensagem: via === 'ofx' ? 'Extrato OFX processado.' : 'Extrato (PDF/imagem) processado via IA.',
      ...resultado,
      reconciliacoesEfetuadas: matches.length,
    });
  })
);
