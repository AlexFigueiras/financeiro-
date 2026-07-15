-- ============================================================================
-- 0003 — FLEXIBILIDADE FINANCEIRA
-- ============================================================================

BEGIN;

-- 1. Permite múltiplos vínculos de transação por cupom fiscal (remover restrição 1:1)
DROP INDEX IF EXISTS uq_transacoes_cupom;
CREATE INDEX IF NOT EXISTS idx_transacoes_cupom
    ON transacoes_banco (cupom_id)
    WHERE cupom_id IS NOT NULL;

-- 2. Expandir a lista de tipos de contas bancárias válidos
ALTER TABLE contas_bancarias DROP CONSTRAINT IF EXISTS contas_bancarias_tipo_check;
ALTER TABLE contas_bancarias ADD CONSTRAINT contas_bancarias_tipo_check 
    CHECK (tipo IN ('corrente', 'poupanca', 'pagamento', 'carteira_digital', 'vale_alimentacao', 'vale_refeicao', 'cartao_credito', 'outro'));

-- 3. Garantir a categoria de Transferência em todos os tenants existentes
INSERT INTO categorias (tenant_id, chave, nome, cor)
SELECT id, 'transferencia', 'Transferência', '#94a3b8'
FROM tenants
ON CONFLICT (tenant_id, chave) DO NOTHING;

COMMIT;
