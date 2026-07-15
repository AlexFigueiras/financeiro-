import { pool } from '../../../infra/db/pool';
import { DashboardRepository } from '../ports/dashboard-repository';

const TZ = 'America/Sao_Paulo';

export const dashboardRepositoryPg: DashboardRepository = {
  async resumo(tenantId, mes) {
    const [saldo, fluxo] = await Promise.all([
      pool.query<{ saldo_consolidado: string }>(
        `SELECT COALESCE(SUM(saldo_atual), 0) AS saldo_consolidado
           FROM contas_bancarias WHERE tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ ganhos: string; gastos: string }>(
        `SELECT COALESCE(SUM(valor) FILTER (WHERE valor > 0), 0)      AS ganhos,
                COALESCE(ABS(SUM(valor) FILTER (WHERE valor < 0)), 0) AS gastos
           FROM transacoes_banco
          WHERE tenant_id = $1
            AND categoria <> 'transferencia'
            AND data_transacao >= ($2::timestamp AT TIME ZONE '${TZ}')
            AND data_transacao <  (($2::timestamp + INTERVAL '1 month') AT TIME ZONE '${TZ}')`,
        [tenantId, `${mes}-01`]
      ),
    ]);

    const ganhos = Number(fluxo.rows[0].ganhos);
    const gastos = Number(fluxo.rows[0].gastos);
    return {
      mes,
      saldoConsolidado: Number(saldo.rows[0].saldo_consolidado),
      totalGanhosMes: ganhos,
      totalGastosMes: gastos,
      balancoLiquidoMes: Math.round((ganhos - gastos) * 100) / 100,
    };
  },

  async fluxoDiario(tenantId, mes) {
    const { rows } = await pool.query(
      `WITH dias AS (
         SELECT generate_series(
                  $2::date,
                  (date_trunc('month', $2::date) + INTERVAL '1 month - 1 day')::date,
                  '1 day'
                )::date AS dia
       )
       SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
              COALESCE(SUM(t.valor) FILTER (WHERE t.valor > 0), 0)      AS ganhos,
              COALESCE(ABS(SUM(t.valor) FILTER (WHERE t.valor < 0)), 0) AS gastos
         FROM dias d
         LEFT JOIN transacoes_banco t
           ON (t.data_transacao AT TIME ZONE '${TZ}')::date = d.dia 
          AND t.tenant_id = $1
          AND t.categoria <> 'transferencia'
        GROUP BY d.dia
        ORDER BY d.dia`,
      [tenantId, `${mes}-01`]
    );
    return {
      mes,
      dias: rows.map((r) => ({ dia: r.dia, ganhos: Number(r.ganhos), gastos: Number(r.gastos) })),
    };
  },

  async gastosPorCategoria(tenantId, mes) {
    const { rows } = await pool.query(
      `SELECT cat AS categoria, SUM(val) AS total
         FROM (
           -- Sub-itens de cupons reconciliados (usando EXISTS para evitar duplicação por múltiplos pagamentos)
           SELECT i.categoria AS cat, i.valor_total AS val
             FROM itens_cupom i
             JOIN cupons_fiscais cf ON cf.id = i.cupom_id
            WHERE cf.tenant_id = $1
              AND EXISTS (
                SELECT 1
                  FROM transacoes_banco t
                 WHERE t.cupom_id = cf.id
                   AND t.status_reconciliado = TRUE
                   AND t.tenant_id = $1
                   AND t.data_transacao >= ($2::timestamp AT TIME ZONE '${TZ}')
                   AND t.data_transacao <  (($2::timestamp + INTERVAL '1 month') AT TIME ZONE '${TZ}')
              )

           UNION ALL

           -- Transações de saída não reconciliadas (sem cupom e sem transferência)
           SELECT t.categoria AS cat, ABS(t.valor) AS val
             FROM transacoes_banco t
            WHERE t.tenant_id = $1
              AND t.valor < 0
              AND t.categoria <> 'transferencia'
              AND t.cupom_id IS NULL
              AND t.data_transacao >= ($2::timestamp AT TIME ZONE '${TZ}')
              AND t.data_transacao <  (($2::timestamp + INTERVAL '1 month') AT TIME ZONE '${TZ}')
         ) sub
        GROUP BY cat
        ORDER BY total DESC`,
      [tenantId, `${mes}-01`]
    );

    return {
      mes,
      categorias: rows.map((r) => ({ categoria: r.categoria, total: Number(r.total) })),
      gastosNaoDetalhados: 0,
    };
  },
};
