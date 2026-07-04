/** Rotas do Módulo C: upload de cupom fiscal para OCR via Gemini. */
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { processarCupom, obterCupomComItens } from '../services/gemini';
import { reconciliarSeguro } from '../services/reconciliacao';
import { pool, withTransaction } from '../db/pool';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // fotos de celular chegam a alguns MB
});

export const cuponsRouter = Router();

/** GET /api/cupons/categorias — lista todas as categorias. */
cuponsRouter.get(
  '/categorias',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT chave, nome, cor FROM categorias ORDER BY nome'
    );
    res.json(rows);
  })
);

/** PATCH /api/cupons/itens/:id/categoria — atualiza a categoria de um item de cupom. */
cuponsRouter.patch(
  '/itens/:id/categoria',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de item inválido.', 400);

    const { categoria } = req.body;
    if (!categoria || typeof categoria !== 'string') {
      throw new AppError('O campo categoria é obrigatório.', 400);
    }

    const categoriaChave = categoria.toLowerCase().trim();

    // Valida se a categoria existe no banco
    const catValida = await pool.query('SELECT 1 FROM categorias WHERE chave = $1', [categoriaChave]);
    if (catValida.rowCount === 0) {
      throw new AppError(`A categoria "${categoriaChave}" não é válida.`, 400);
    }

    // Usando transação para garantir consistência
    await withTransaction(async (client) => {
      // 1. Obtém o nome_produto do item atual
      const itemRes = await client.query<{ nome_produto: string }>(
        'SELECT nome_produto FROM itens_cupom WHERE id = $1',
        [id]
      );
      if (itemRes.rowCount === 0) {
        throw new AppError('Item de cupom não encontrado.', 404);
      }
      const nomeProduto = itemRes.rows[0].nome_produto;
      const nomeProdutoLower = nomeProduto.toLowerCase();

      // 2. Atualiza a categoria do item específico
      await client.query(
        'UPDATE itens_cupom SET categoria = $1 WHERE id = $2',
        [categoriaChave, id]
      );

      // 3. Upsert na regra de categorização para futuros relacionamentos automáticos
      await client.query(
        `INSERT INTO regras_categorizacao (termo, categoria_chave)
         VALUES ($1, $2)
         ON CONFLICT (termo) DO UPDATE SET categoria_chave = EXCLUDED.categoria_chave`,
        [nomeProdutoLower, categoriaChave]
      );

      // 4. Retroativamente atualiza todos os outros itens com o mesmo nome
      await client.query(
        'UPDATE itens_cupom SET categoria = $1 WHERE LOWER(nome_produto) = $2',
        [categoriaChave, nomeProdutoLower]
      );
    });

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
