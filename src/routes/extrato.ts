/** Rotas de upload de extrato da Caixa: arquivo OFX ou extrato em PDF/imagem. */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { importarOfx, inserirTransacoes } from '../services/ofx';
import { extrairExtratoPdf } from '../services/gemini';
import { reconciliarSeguro } from '../services/reconciliacao';
import { pool } from '../db/pool';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // PDF/foto de extrato pode ter alguns MB
});

export const extratoRouter = Router();

async function resolverContaId(bodyContaId: unknown): Promise<number> {
  const contaId = bodyContaId ? parseInt(String(bodyContaId), 10) : NaN;
  if (!isNaN(contaId)) return contaId;
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM contas_bancarias WHERE nome = 'Caixa Econômica' LIMIT 1`
  );
  if (rows.length === 0) {
    throw new AppError("Conta 'Caixa Econômica' não encontrada e conta_id não informado.", 400);
  }
  return rows[0].id;
}

/** Decide se o arquivo é um OFX (texto) analisando mime, extensão e conteúdo. */
function pareceOfx(mimetype: string, nome: string, buffer: Buffer): boolean {
  if (/ofx/i.test(mimetype)) return true;
  if (/\.ofx$/i.test(nome)) return true;
  const head = buffer.subarray(0, 400).toString('latin1');
  return /<OFX>|OFXHEADER/i.test(head);
}

/**
 * POST /api/extrato/upload-ofx
 * multipart/form-data: arquivo=<.ofx | .pdf | imagem> [conta_id]
 * - OFX: parser local + dedup por hash.
 * - PDF/imagem: extração via Gemini + mesma dedup por hash.
 */
extratoRouter.post(
  '/upload-ofx',
  upload.single('arquivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("Nenhum arquivo enviado. Use o campo multipart 'arquivo'.", 400);
    }

    const contaId = await resolverContaId(req.body.conta_id);
    const { buffer, mimetype, originalname } = req.file;

    let resultado;
    let via: 'ofx' | 'pdf';
    if (pareceOfx(mimetype, originalname ?? '', buffer)) {
      // OFX 1.x da Caixa costuma vir em latin-1; detecta pelo header CHARSET.
      const head = buffer.subarray(0, 400).toString('ascii');
      const encoding: BufferEncoding = /CHARSET:\s*1252|ENCODING:\s*USASCII/i.test(head) ? 'latin1' : 'utf8';
      resultado = await importarOfx(buffer.toString(encoding), contaId);
      via = 'ofx';
    } else if (mimetype === 'application/pdf' || mimetype.startsWith('image/')) {
      const transacoes = await extrairExtratoPdf(buffer, mimetype);
      resultado = await inserirTransacoes(transacoes, contaId);
      via = 'pdf';
    } else {
      throw new AppError(
        `Formato não suportado (${mimetype}). Envie um arquivo OFX, um PDF ou uma foto do extrato.`,
        415
      );
    }

    const matches = await reconciliarSeguro('upload extrato');
    res.status(201).json({
      mensagem: via === 'ofx' ? 'Extrato OFX processado.' : 'Extrato (PDF/imagem) processado via IA.',
      ...resultado,
      reconciliacoesEfetuadas: matches.length,
    });
  })
);
