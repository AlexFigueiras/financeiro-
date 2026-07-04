import { Router } from 'express';
import { asyncHandler, AppError } from '../../../shared/errors/app-error';
import { transacoesService } from '../index';

export const transacoesRouter = Router();

/**
 * GET /api/transacoes?mes=YYYY-MM&conta_id=&limite=&pagina=
 * Retorna transações do tenant; as reconciliadas trazem os itens do cupom
 * embutidos (para o accordion do frontend em um único round-trip).
 */
transacoesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await transacoesService.listar(req.tenantId!, req.query));
  })
);

/** PATCH /api/transacoes/:id/categoria — atualiza a categoria de uma transação manual/OFX sem cupom. */
transacoesRouter.patch(
  '/:id/categoria',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de transação inválido.', 400);
    await transacoesService.atualizarCategoria(req.tenantId!, id, req.body?.categoria);
    res.json({ mensagem: 'Categoria da transação atualizada com sucesso e aprendida para lançamentos futuros.' });
  })
);
