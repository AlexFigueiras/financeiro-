-- ============================================================================
-- 0004 — ARQUIVOS_IMPORTADOS
-- Gerado por scripts/generate.js migration arquivos_importados.
-- Registro de arquivos já enviados (extrato/cupom) para avisar o usuário sobre
-- reenvio do mesmo arquivo ANTES de reprocessar (e antes de pagar OCR/Gemini).
-- hash_arquivo = sha256 do conteúdo (cupom multi-foto: sha256 dos hashes
-- individuais ordenados — mesma coleção de fotos em qualquer ordem = mesmo hash).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS arquivos_importados (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tipo            TEXT        NOT NULL CHECK (tipo IN ('extrato', 'cupom')),
    hash_arquivo    TEXT        NOT NULL,
    nome_arquivo    TEXT        NOT NULL DEFAULT '',
    tamanho_bytes   BIGINT      NOT NULL DEFAULT 0,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_arquivos_importados_hash UNIQUE (tenant_id, tipo, hash_arquivo)
);

CREATE INDEX IF NOT EXISTS idx_arquivos_importados_tenant ON arquivos_importados (tenant_id);

-- Trigger padrão de atualizado_em
CREATE OR REPLACE FUNCTION fn_arquivos_importados_atualizado_em() RETURNS trigger AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_arquivos_importados_atualizado_em ON arquivos_importados;
CREATE TRIGGER trg_arquivos_importados_atualizado_em
    BEFORE UPDATE ON arquivos_importados
    FOR EACH ROW EXECUTE FUNCTION fn_arquivos_importados_atualizado_em();

-- Row-Level Security (Lei 7.2) — obrigatório
ALTER TABLE arquivos_importados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_isolamento_app ON arquivos_importados;
CREATE POLICY p_isolamento_app ON arquivos_importados
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Policy por membro (Supabase Auth) — mesmo padrão da 0002 (§6b), criada só
-- quando auth.uid() existe (protege o caminho PostgREST direto do Supabase).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS p_membro_tenant ON arquivos_importados';
    EXECUTE 'CREATE POLICY p_membro_tenant ON arquivos_importados FOR ALL TO authenticated '
      || 'USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())) '
      || 'WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))';
  END IF;
END $$;

-- Menor privilégio (Lei 7.5)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON arquivos_importados FROM anon';
  END IF;
END $$;

COMMIT;
