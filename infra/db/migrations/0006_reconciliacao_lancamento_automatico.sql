-- ============================================================================
-- 0006 — LANÇAMENTO AUTOMÁTICO PARA CUPOM SEM TRANSAÇÃO CORRESPONDENTE
--
-- Contexto: ao subir um cupom fiscal sem transação bancária correspondente, o
-- backend passa a criar um lançamento "placeholder" (origem='cupom') já
-- vinculado ao cupom, para que o gasto seja contabilizado no mês mesmo antes
-- do extrato bancário real chegar. Esta migration:
--   1. Permite o novo valor 'cupom' em transacoes_banco.origem.
--   2. Ensina fn_reconciliar a substituir esse placeholder pela transação
--      REAL quando ela chegar depois (upload de extrato) — sem isso, o mesmo
--      gasto seria contado duas vezes (placeholder + transação real).
-- ============================================================================

BEGIN;

-- 1. Novo valor de origem para lançamentos criados automaticamente a partir
--    de um cupom sem transação correspondente (nunca digitados pelo usuário).
ALTER TABLE transacoes_banco DROP CONSTRAINT IF EXISTS transacoes_banco_origem_check;
ALTER TABLE transacoes_banco ADD CONSTRAINT transacoes_banco_origem_check
    CHECK (origem IN ('ofx', 'manual', 'cupom'));

-- 2. fn_reconciliar: além do match normal (cupom sem NENHUMA transação
--    vinculada), agora também considera elegível um cupom cuja ÚNICA
--    transação vinculada é um placeholder (origem='cupom'). Quando uma
--    transação REAL casa com esse cupom, o placeholder é apagado (a trigger
--    trg_atualiza_saldo reverte o valor dele automaticamente) e a transação
--    real assume o vínculo — evita contar o mesmo gasto duas vezes quando o
--    extrato bancário chega depois do cupom.
--
--    As duas CTEs de escrita (remoção do placeholder e UPDATE da transação
--    real) mexem em conjuntos de PK disjuntos — o placeholder tem outro `id`
--    além do `t_id` recém-casado — então a ordem de execução entre elas
--    dentro do mesmo snapshot não afeta o resultado.
CREATE OR REPLACE FUNCTION fn_reconciliar(p_tenant_id UUID)
RETURNS TABLE (transacao_id BIGINT, cupom_fiscal_id BIGINT) AS $$
BEGIN
    RETURN QUERY
    WITH candidatos AS (
        SELECT DISTINCT ON (c.id)
               t.id AS t_id,
               c.id AS c_id
          FROM cupons_fiscais c
          JOIN transacoes_banco t
            ON t.tenant_id = p_tenant_id
           AND t.status_reconciliado = FALSE
           AND t.cupom_id IS NULL
           AND t.valor < 0
           AND ABS(t.valor) = c.valor_total                                   -- centavo por centavo
           AND t.data_transacao BETWEEN c.data_emissao - INTERVAL '48 hours'
                                    AND c.data_emissao + INTERVAL '48 hours' -- janela de compensação
         WHERE c.tenant_id = p_tenant_id
           -- elegível se não há transação vinculada nenhuma, OU só existe o
           -- placeholder sintético (origem='cupom') criado no upload sem match
           AND NOT EXISTS (
             SELECT 1 FROM transacoes_banco tx
              WHERE tx.cupom_id = c.id AND tx.origem <> 'cupom'
           )
         ORDER BY c.id, ABS(EXTRACT(EPOCH FROM (t.data_transacao - c.data_emissao)))  -- match mais próximo no tempo
    ),
    unicos AS (
        -- garante que a MESMA transação não seja atribuída a dois cupons na mesma rodada
        SELECT DISTINCT ON (t_id) t_id, c_id FROM candidatos ORDER BY t_id, c_id
    ),
    remocao_placeholder AS (
        -- apaga o lançamento sintético do cupom que está prestes a ganhar uma
        -- transação REAL nesta rodada (se existir um) — CTE de DML sempre
        -- executa, mesmo sem ser referenciada na query final.
        DELETE FROM transacoes_banco tx
         USING unicos u
         WHERE tx.cupom_id = u.c_id
           AND tx.origem = 'cupom'
           AND tx.tenant_id = p_tenant_id
        RETURNING tx.id
    )
    UPDATE transacoes_banco t
       SET status_reconciliado = TRUE,
           cupom_id            = u.c_id
      FROM unicos u
     WHERE t.id = u.t_id
       AND t.status_reconciliado = FALSE
    RETURNING t.id, t.cupom_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
