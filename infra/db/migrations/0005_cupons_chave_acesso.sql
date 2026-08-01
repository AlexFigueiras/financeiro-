-- ============================================================================
-- 0005 — CUPONS_CHAVE_ACESSO
-- Adiciona a chave de acesso (44 dígitos) da NFC-e a cupons_fiscais, usada como
-- identificador natural de dedup na importação via QR Code (scraping SEFAZ).
-- ============================================================================

BEGIN;

ALTER TABLE cupons_fiscais ADD COLUMN IF NOT EXISTS chave_acesso CHAR(44);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cupons_chave_acesso
  ON cupons_fiscais (tenant_id, chave_acesso) WHERE chave_acesso IS NOT NULL;

COMMIT;
