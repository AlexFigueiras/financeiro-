-- ============================================================================
-- SISTEMA PESSOAL DE CONTROLE FINANCEIRO E RECONCILIAÇÃO BANCÁRIA
-- Schema PostgreSQL / Supabase
--
-- Convenções:
--   * TIMESTAMPTZ em todas as colunas temporais (elimina ambiguidade de fuso).
--   * NUMERIC(12,2) para valores monetários (nunca float).
--   * Valor de transação: positivo = entrada / negativo = saída.
--   * Script idempotente (IF NOT EXISTS) — pode ser reexecutado com segurança.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. CONTAS BANCÁRIAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contas_bancarias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome            TEXT        NOT NULL UNIQUE,          -- Ex.: 'Caixa Econômica'
    tipo            TEXT        NOT NULL DEFAULT 'corrente'
                                CHECK (tipo IN ('corrente', 'poupanca', 'pagamento', 'carteira_digital', 'outro')),
    saldo_atual     NUMERIC(14,2) NOT NULL DEFAULT 0,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. CUPONS FISCAIS (cabeçalho extraído pela IA)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cupons_fiscais (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_emissao    TIMESTAMPTZ NOT NULL,
    valor_total     NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
    estabelecimento TEXT        NOT NULL,
    json_bruto_ia   JSONB       NOT NULL,                 -- payload integral retornado pelo Gemini (auditoria)
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para o motor de reconciliação (busca por valor + janela de data)
CREATE INDEX IF NOT EXISTS idx_cupons_data_emissao ON cupons_fiscais (data_emissao);
CREATE INDEX IF NOT EXISTS idx_cupons_valor_total  ON cupons_fiscais (valor_total);

-- ----------------------------------------------------------------------------
-- 3. TRANSAÇÕES BANCÁRIAS (Caixa via upload de OFX)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacoes_banco (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conta_id            BIGINT      NOT NULL REFERENCES contas_bancarias(id) ON DELETE CASCADE,
    data_transacao      TIMESTAMPTZ NOT NULL,
    descricao_bruta     TEXT        NOT NULL,
    valor               NUMERIC(12,2) NOT NULL,           -- >0 entrada | <0 saída
    hash_ofx            TEXT        NOT NULL UNIQUE,      -- sha256(data|valor|descricao|conta) — antitransbordamento
    status_reconciliado BOOLEAN     NOT NULL DEFAULT FALSE,
    cupom_id            BIGINT      REFERENCES cupons_fiscais(id) ON DELETE SET NULL,  -- vínculo lógico do match
    origem              TEXT        NOT NULL DEFAULT 'ofx'
                                    CHECK (origem IN ('ofx', 'manual')),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para busca por data e valor (reconciliação + dashboards)
CREATE INDEX IF NOT EXISTS idx_transacoes_data          ON transacoes_banco (data_transacao);
CREATE INDEX IF NOT EXISTS idx_transacoes_valor         ON transacoes_banco (valor);
CREATE INDEX IF NOT EXISTS idx_transacoes_conta         ON transacoes_banco (conta_id);
-- Índice parcial: o motor de reconciliação só varre transações pendentes de saída
CREATE INDEX IF NOT EXISTS idx_transacoes_pendentes
    ON transacoes_banco (valor, data_transacao)
    WHERE status_reconciliado = FALSE;
-- Um cupom só pode estar vinculado a UMA transação
CREATE UNIQUE INDEX IF NOT EXISTS uq_transacoes_cupom
    ON transacoes_banco (cupom_id)
    WHERE cupom_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. ITENS DO CUPOM (desmembramento produto a produto)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itens_cupom (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cupom_id        BIGINT      NOT NULL REFERENCES cupons_fiscais(id) ON DELETE CASCADE,
    nome_produto    TEXT        NOT NULL,
    quantidade      NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    preco_unitario  NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
    categoria       TEXT        NOT NULL DEFAULT 'outros',
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itens_cupom_cupom     ON itens_cupom (cupom_id);
CREATE INDEX IF NOT EXISTS idx_itens_cupom_categoria ON itens_cupom (categoria);

-- ----------------------------------------------------------------------------
-- 5. TRIGGER: mantém saldo_atual da conta sincronizado com as transações
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_atualiza_saldo_conta() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE contas_bancarias
           SET saldo_atual = saldo_atual + NEW.valor, atualizado_em = now()
         WHERE id = NEW.conta_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE contas_bancarias
           SET saldo_atual = saldo_atual - OLD.valor, atualizado_em = now()
         WHERE id = OLD.conta_id;
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE' AND NEW.valor IS DISTINCT FROM OLD.valor) THEN
        UPDATE contas_bancarias
           SET saldo_atual = saldo_atual - OLD.valor + NEW.valor, atualizado_em = now()
         WHERE id = NEW.conta_id;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atualiza_saldo ON transacoes_banco;
CREATE TRIGGER trg_atualiza_saldo
    AFTER INSERT OR UPDATE OR DELETE ON transacoes_banco
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_saldo_conta();

-- ----------------------------------------------------------------------------
-- 6. FUNÇÃO DE RECONCILIAÇÃO (chamável pelo backend ou por cron pg_cron)
--    Match: valor exato (centavo a centavo) + janela de 48h.
--    A transação de SAÍDA (valor negativo) casa com o valor_total do cupom.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_reconciliar() RETURNS TABLE (transacao_id BIGINT, cupom_fiscal_id BIGINT) AS $$
BEGIN
    RETURN QUERY
    WITH candidatos AS (
        SELECT DISTINCT ON (c.id)
               t.id AS t_id,
               c.id AS c_id
          FROM cupons_fiscais c
          JOIN transacoes_banco t
            ON t.status_reconciliado = FALSE
           AND t.cupom_id IS NULL
           AND t.valor < 0
           AND ABS(t.valor) = c.valor_total                                   -- centavo por centavo
           AND t.data_transacao BETWEEN c.data_emissao - INTERVAL '48 hours'
                                    AND c.data_emissao + INTERVAL '48 hours' -- janela de compensação
         WHERE NOT EXISTS (SELECT 1 FROM transacoes_banco tx WHERE tx.cupom_id = c.id)
         ORDER BY c.id, ABS(EXTRACT(EPOCH FROM (t.data_transacao - c.data_emissao)))  -- match mais próximo no tempo
    ),
    unicos AS (
        -- garante que a MESMA transação não seja atribuída a dois cupons na mesma rodada
        SELECT DISTINCT ON (t_id) t_id, c_id FROM candidatos ORDER BY t_id, c_id
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

-- ----------------------------------------------------------------------------
-- 7. SEED: conta padrão do usuário
-- ----------------------------------------------------------------------------
INSERT INTO contas_bancarias (nome, tipo)
VALUES ('Caixa Econômica', 'corrente')
ON CONFLICT (nome) DO NOTHING;

COMMIT;
