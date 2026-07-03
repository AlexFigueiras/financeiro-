/** Rotas do Módulo B: upload de OFX da Caixa. */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { importarOfx } from '../services/ofx';
import { reconciliarSeguro } from '../services/reconciliacao';
import { pool } from '../db/pool';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // OFX de extrato raramente passa de alguns KB
});

export const extratoRouter = Router();

/**
 * POST /api/extrato/upload-ofx
 * multipart/form-data: arquivo=<.ofx> [conta_id=<id>] (padrão: conta 'Caixa Econômica')
 */
extratoRouter.post(
  '/upload-ofx',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("Nenhum arquivo enviado. Use o campo multipart 'arquivo'.", 400);
    }

    let contaId = req.body.conta_id ? parseInt(String(req.body.conta_id), 10) : NaN;
    if (isNaN(contaId)) {
      const { rows } = await pool.query<{ id: number }>(
        `SELECT id FROM contas_bancarias WHERE nome = 'Caixa Econômica' LIMIT 1`
      );
      if (rows.length === 0) {
        throw new AppError("Conta 'Caixa Econômica' não encontrada e conta_id não informado.", 400);
      }
      contaId = rows[0].id;
    }

    // OFX 1.x da Caixa costuma vir em latin-1; detecta pelo header CHARSET.
    const head = req.file.buffer.subarray(0, 400).toString('ascii');
    const encoding: BufferEncoding = /CHARSET:\s*1252|ENCODING:\s*USASCII/i.test(head) ? 'latin1' : 'utf8';
    const conteudo = req.file.buffer.toString(encoding);

    const resultado = await importarOfx(conteudo, contaId);
    const matches = await reconciliarSeguro('upload OFX');

    res.status(201).json({
      mensagem: 'Extrato OFX processado.',
      ...resultado,
      reconciliacoesEfetuadas: matches.length,
    });
  })
);
