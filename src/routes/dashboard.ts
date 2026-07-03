/** Agregações para os KPIs e gráficos do dashboard. */
import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const dashboardRouter = Router();

const TZ = 'America/Sao_Paulo';

function validarMes(raw: unknown): string {
  const mes = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new AppError('Parâmetro mes é obrigatório no formato YYYY-MM.', 400);
  }
  return mes;
}

/**
 * GET /api/dashboard/resumo?mes=YYYY-MM
 * KPIs: saldo consolidado, ganhos do mês, gastos do mês, balanço líquido.
 */
dashboardRouter.get(
  '/resumo',
  asyncHandler(async (req, res) => {
    const mes = validarMes(req.query.mes);

    const [saldo, fluxo] = await Promise.all([
      pool.query<{ saldo_consolidado: string }>(
        `SELECT COALESCE(SUM(saldo_atual), 0) AS saldo_consolidado FROM contas_bancarias`
      ),
      pool.query<{ ganhos: string; gastos: string }>(
        `SELECT COALESCE(SUM(valor) FILTER (WHERE valor > 0), 0)      AS ganhos,
                COALESCE(ABS(SUM(valor) FILTER (WHERE valor < 0)), 0) AS gastos
           FROM transacoes_banco
          WHERE data_transacao >= ($1::date AT TIME ZONE '${TZ}')
            AND data_transacao <  (($1::date + INTERVAL '1 month') AT TIME ZONE '${TZ}')`,
        [`${mes}-01`]
      ),
    ]);

    const ganhos = Number(fluxo.rows[0].ganhos);
    const gastos = Number(fluxo.rows[0].gastos);
    res.json({
      mes,
      saldoConsolidado: Number(saldo.rows[0].saldo_consolidado),
      totalGanhosMes: ganhos,
      totalGastosMes: gastos,
      balancoLiquidoMes: Math.round((ganhos - gastos) * 100) / 100,
    });
  })
);

/**
 * GET /api/dashboard/fluxo-diario?mes=YYYY-MM
 * Série diária de ganhos vs gastos para o gráfico de barras empilhadas/linha.
 */
dashboardRouter.get(
  '/fluxo-diario',
  asyncHandler(async (req, res) => {
    const mes = validarMes(req.query.mes);
    const { rows } = await pool.query(
      `WITH dias AS (
         SELECT generate_series(
                  $1::date,
                  (date_trunc('month', $1::date) + INTERVAL '1 month - 1 day')::date,
                  '1 day'
                )::date AS dia
       )
       SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
              COALESCE(SUM(t.valor) FILTER (WHERE t.valor > 0), 0)      AS ganhos,
              COALESCE(ABS(SUM(t.valor) FILTER (WHERE t.valor < 0)), 0) AS gastos
         FROM dias d
         LEFT JOIN transacoes_banco t
           ON (t.data_transacao AT TIME ZONE '${TZ}')::date = d.dia
        GROUP BY d.dia
        ORDER BY d.dia`,
      [`${mes}-01`]
    );
    res.json({
      mes,
      dias: rows.map((r) => ({ dia: r.dia, ganhos: Number(r.ganhos), gastos: Number(r.gastos) })),
    });
  })
);

/**
 * GET /api/dashboard/gastos-por-categoria?mes=YYYY-MM
 * Distribuição de gastos por categoria dos itens de cupons RECONCILIADOS,
 * mais o agregado "não detalhado" (saídas bancárias sem cupom vinculado).
 */
dashboardRouter.get(
  '/gastos-por-categoria',
  asyncHandler(async (req, res) => {
    const mes = validarMes(req.query.mes);
    const params = [`${mes}-01`];

    const [categorias, naoDetalhado] = await Promise.all([
      pool.query(
        `SELECT i.categoria, SUM(i.valor_total) AS total
           FROM itens_cupom i
           JOIN cupons_fiscais cf ON cf.id = i.cupom_id
           JOIN transacoes_banco t ON t.cupom_id = cf.id AND t.status_reconciliado = TRUE
          WHERE t.data_transacao >= ($1::date AT TIME ZONE '${TZ}')
            AND t.data_transacao <  (($1::date + INTERVAL '1 month') AT TIME ZONE '${TZ}')
          GROUP BY i.categoria
          ORDER BY total DESC`,
        params
      ),
      pool.query(
        `SELECT COALESCE(ABS(SUM(valor)), 0) AS total
           FROM transacoes_banco
          WHERE valor < 0
            AND cupom_id IS NULL
            AND data_transacao >= ($1::date AT TIME ZONE '${TZ}')
            AND data_transacao <  (($1::date + INTERVAL '1 month') AT TIME ZONE '${TZ}')`,
        params
      ),
    ]);

    res.json({
      mes,
      categorias: categorias.rows.map((r) => ({ categoria: r.categoria, total: Number(r.total) })),
      gastosNaoDetalhados: Number(naoDetalhado.rows[0].total),
    });
  })
);
