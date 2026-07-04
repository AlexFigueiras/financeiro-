/** Lista de transações da Caixa com detalhe de cupom. */
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { reconciliar } from '../services/reconciliacao';

export const transacoesRouter = Router();

/**
 * GET /api/transacoes?mes=YYYY-MM&conta_id=&limite=&pagina=
 * Retorna transações de todas as contas; as reconciliadas trazem os itens do
 * cupom embutidos (para o accordion do frontend em um único round-trip).
 */
transacoesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limite = Math.min(parseInt(String(req.query.limite ?? '100'), 10) || 100, 500);
    const pagina = Math.max(parseInt(String(req.query.pagina ?? '1'), 10) || 1, 1);
    const offset = (pagina - 1) * limite;

    const filtros: string[] = [];
    const params: unknown[] = [];

    if (req.query.mes) {
      if (!/^\d{4}-\d{2}$/.test(String(req.query.mes))) {
        throw new AppError('Parâmetro mes deve estar no formato YYYY-MM.', 400);
      }
      params.push(`${req.query.mes}-01`);
      filtros.push(
        `t.data_transacao >= ($${params.length}::date AT TIME ZONE 'America/Sao_Paulo')
         AND t.data_transacao < (($${params.length}::date + INTERVAL '1 month') AT TIME ZONE 'America/Sao_Paulo')`
      );
    }
    if (req.query.conta_id) {
      const contaId = parseInt(String(req.query.conta_id), 10);
      if (isNaN(contaId)) throw new AppError('conta_id inválido.', 400);
      params.push(contaId);
      filtros.push(`t.conta_id = $${params.length}`);
    }
    const where = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

    params.push(limite, offset);
    const { rows } = await pool.query(
      `SELECT t.id,
              t.data_transacao,
              t.descricao_bruta,
              t.valor,
              t.status_reconciliado,
              t.origem,
              t.cupom_id,
              t.categoria,
              c.nome  AS conta_nome,
              cf.estabelecimento,
              cf.data_emissao AS cupom_data_emissao,
              CASE WHEN t.cupom_id IS NULL THEN NULL
                   ELSE (SELECT json_agg(json_build_object(
                            'id',            i.id,
                            'nome_produto',  i.nome_produto,
                            'quantidade',    i.quantidade,
                            'preco_unitario',i.preco_unitario,
                            'valor_total',   i.valor_total,
                            'categoria',     i.categoria
                          ) ORDER BY i.id)
                           FROM itens_cupom i WHERE i.cupom_id = t.cupom_id)
              END AS itens_cupom,
              COUNT(*) OVER() AS total_registros
         FROM transacoes_banco t
         JOIN contas_bancarias c ON c.id = t.conta_id
         LEFT JOIN cupons_fiscais cf ON cf.id = t.cupom_id
         ${where}
        ORDER BY t.data_transacao DESC, t.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? Number(rows[0].total_registros) : 0;
    res.json({
      pagina,
      limite,
      total,
      transacoes: rows.map(({ total_registros: _ignorado, ...t }) => t),
    });
  })
);

/** POST /api/transacoes/reconciliar — dispara o motor manualmente. */
transacoesRouter.post(
  '/reconciliar',
  asyncHandler(async (_req, res) => {
    const matches = await reconciliar();
    res.json({ mensagem: 'Motor de reconciliação executado.', matches });
  })
);

/** PATCH /api/transacoes/:id/categoria — atualiza a categoria de uma transação manual/OFX sem cupom. */
transacoesRouter.patch(
  '/:id/categoria',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de transação inválido.', 400);

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
      // 1. Obtém a descrição da transação
      const txRes = await client.query<{ descricao_bruta: string }>(
        'SELECT descricao_bruta FROM transacoes_banco WHERE id = $1',
        [id]
      );
      if (txRes.rowCount === 0) {
        throw new AppError('Transação não encontrada.', 404);
      }
      const descricao = txRes.rows[0].descricao_bruta;

      // 2. Atualiza a categoria da transação específica
      await client.query(
        'UPDATE transacoes_banco SET categoria = $1 WHERE id = $2',
        [categoriaChave, id]
      );

      // 3. Cria/atualiza a regra de categorização baseada na descrição inteira (para futuros uploads)
      const termoRegra = descricao.toLowerCase().trim();
      await client.query(
        `INSERT INTO regras_categorizacao (termo, categoria_chave)
         VALUES ($1, $2)
         ON CONFLICT (termo) DO UPDATE SET categoria_chave = EXCLUDED.categoria_chave`,
        [termoRegra, categoriaChave]
      );

      // 4. Retroativamente atualiza todas as outras transações sem cupom que possuem a mesma descrição
      await client.query(
        `UPDATE transacoes_banco 
            SET categoria = $1 
          WHERE LOWER(descricao_bruta) = $2 
            AND cupom_id IS NULL`,
        [categoriaChave, termoRegra]
      );
    });

    res.json({ mensagem: 'Categoria da transação atualizada com sucesso e aprendida para lançamentos futuros.' });
  })
);
