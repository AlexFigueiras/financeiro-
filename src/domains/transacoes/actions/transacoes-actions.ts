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

/** POST /api/transacoes/recategorizar-tudo — recategoriza em lote todas as transações sem cupom do tenant. */
transacoesRouter.post(
  '/recategorizar-tudo',
  asyncHandler(async (req, res) => {
    const total = await transacoesService.recategorizarTodas(req.tenantId!);
    res.json({ mensagem: `Recategorização em lote concluída. ${total} transação(ões) atualizada(s).`, total });
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

/** POST /api/transacoes — cria um lançamento manual (data, conta, descrição, valor, categoria). */
transacoesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const transacao = await transacoesService.criar(req.tenantId!, req.body ?? {});
    res.status(201).json(transacao);
  })
);

/** PATCH /api/transacoes/:id — edita campos do lançamento (data, conta, descrição, valor, categoria). */
transacoesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de transação inválido.', 400);
    const transacao = await transacoesService.atualizar(req.tenantId!, id, req.body ?? {});
    res.json(transacao);
  })
);

/** DELETE /api/transacoes/:id — exclui o lançamento. */
transacoesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('ID de transação inválido.', 400);
    await transacoesService.excluir(req.tenantId!, id);
    res.json({ mensagem: 'Transação excluída com sucesso.' });
  })
);

/** POST /api/transacoes/limpar-mes — exclui todas as transações, cupons e arquivos importados do mês. */
transacoesRouter.post(
  '/limpar-mes',
  asyncHandler(async (req, res) => {
    const { mes } = req.body ?? {};
    if (!mes) throw new AppError('O campo mes é obrigatório.', 400);
    const result = await transacoesService.limparMes(req.tenantId!, mes);
    res.json({
      mensagem: 'Dados do mês limpos com sucesso.',
      ...result
    });
  })
);
