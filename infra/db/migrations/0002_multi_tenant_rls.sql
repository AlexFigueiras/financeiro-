-- ============================================================================
-- 0002 — MULTI-TENANT + ROW-LEVEL SECURITY (Leis 7.1 e 7.2 do Dev OS)
--
--   * Cria tenants / tenant_members / audit_log (tabelas globais na allowlist).
--   * Adiciona tenant_id a TODAS as tabelas de dados, com backfill dos dados
--     pré-SaaS para o tenant padrão (preservação aprovada na Fase 0).
--   * Converte unicidades globais em unicidades POR TENANT.
--   * Habilita RLS com duas famílias de policy:
--       - p_isolamento_app:  tenant_id = current_setting('app.tenant_id')
--         (vale para o role da aplicação sem BYPASSRLS — ver RUNBOOK)
--       - p_membro_tenant:   via auth.uid() (criada só se Supabase Auth existir;
--         protege o acesso PostgREST direto do Supabase)
--   * fn_reconciliar passa a ser POR TENANT.
--   * Script idempotente — pode ser reexecutado com segurança.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TENANTS E MEMBROS (tabelas globais — allowlist do verify-rules)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        TEXT NOT NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_members (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,              -- auth.users.id (Supabase Auth)
    papel       TEXT NOT NULL DEFAULT 'owner' CHECK (papel IN ('owner', 'member')),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members (user_id);

-- Tenant padrão que recebe os dados migrados da fase single-user.
INSERT INTO tenants (id, nome)
VALUES ('00000000-0000-4000-8000-000000000000', 'Tenant migrado (dados pré-SaaS)')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. AUDITORIA DURÁVEL (Seção 8 — eventos sensíveis)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id     TEXT,                       -- TEXT: acomoda o usuário sintético do modo dev
    acao        TEXT NOT NULL,
    recurso     TEXT,
    detalhes    JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_id  TEXT,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_data ON audit_log (tenant_id, criado_em);

-- ----------------------------------------------------------------------------
-- 3. TENANT_ID EM TODAS AS TABELAS DE DADOS + BACKFILL (Lei 7.1)
-- ----------------------------------------------------------------------------
ALTER TABLE contas_bancarias     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE cupons_fiscais       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE transacoes_banco     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE itens_cupom          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE categorias           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE regras_categorizacao ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

UPDATE contas_bancarias     SET tenant_id = '00000000-0000-4000-8000-000000000000' WHERE tenant_id IS NULL;
UPDATE cupons_fiscais       SET tenant_id = '00000000-0000-4000-8000-000000000000' WHERE tenant_id IS NULL;
UPDATE transacoes_banco     SET tenant_id = '00000000-0000-4000-8000-000000000000' WHERE tenant_id IS NULL;
UPDATE itens_cupom i        SET tenant_id = c.tenant_id
  FROM cupons_fiscais c WHERE i.cupom_id = c.id AND i.tenant_id IS NULL;
UPDATE categorias           SET tenant_id = '00000000-0000-4000-8000-000000000000' WHERE tenant_id IS NULL;
-- Rename que antes era aplicado via hack em rota (removido do código):
UPDATE categorias SET nome = 'Combustível de Veículo' WHERE chave = 'combustivel' AND nome <> 'Combustível de Veículo';
UPDATE regras_categorizacao SET tenant_id = '00000000-0000-4000-8000-000000000000' WHERE tenant_id IS NULL;

ALTER TABLE contas_bancarias     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cupons_fiscais       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE transacoes_banco     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE itens_cupom          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE categorias           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE regras_categorizacao ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_tenant     ON contas_bancarias (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cupons_tenant     ON cupons_fiscais (tenant_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_tenant ON transacoes_banco (tenant_id);
CREATE INDEX IF NOT EXISTS idx_itens_tenant      ON itens_cupom (tenant_id);
CREATE INDEX IF NOT EXISTS idx_categorias_tenant ON categorias (tenant_id);
CREATE INDEX IF NOT EXISTS idx_regras_tenant     ON regras_categorizacao (tenant_id);

-- ----------------------------------------------------------------------------
-- 4. UNICIDADE GLOBAL → UNICIDADE POR TENANT
--    (a FK de regras_categorizacao depende do unique de categorias.chave,
--     então cai primeiro e volta composta no final)
-- ----------------------------------------------------------------------------
ALTER TABLE regras_categorizacao DROP CONSTRAINT IF EXISTS regras_categorizacao_categoria_chave_fkey;

ALTER TABLE contas_bancarias     DROP CONSTRAINT IF EXISTS contas_bancarias_nome_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_tenant_nome      ON contas_bancarias (tenant_id, nome);

ALTER TABLE transacoes_banco     DROP CONSTRAINT IF EXISTS transacoes_banco_hash_ofx_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transacoes_tenant_hash  ON transacoes_banco (tenant_id, hash_ofx);

ALTER TABLE categorias           DROP CONSTRAINT IF EXISTS categorias_chave_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_tenant_chave ON categorias (tenant_id, chave);

ALTER TABLE regras_categorizacao DROP CONSTRAINT IF EXISTS regras_categorizacao_termo_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_regras_tenant_termo     ON regras_categorizacao (tenant_id, termo);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'regras_categorizacao_tenant_categoria_fkey'
  ) THEN
    ALTER TABLE regras_categorizacao
      ADD CONSTRAINT regras_categorizacao_tenant_categoria_fkey
      FOREIGN KEY (tenant_id, categoria_chave)
      REFERENCES categorias (tenant_id, chave) ON DELETE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. RECONCILIAÇÃO POR TENANT
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_reconciliar();
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
           AND NOT EXISTS (SELECT 1 FROM transacoes_banco tx WHERE tx.cupom_id = c.id)
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
-- 6. ROW-LEVEL SECURITY (Lei 7.2) — habilita + policies em todas as tabelas
-- ----------------------------------------------------------------------------
ALTER TABLE contas_bancarias     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupons_fiscais       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes_banco     ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_cupom          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras_categorizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;

-- 6a. Isolamento para o role da aplicação (current_setting → withTenantTransaction).
--     current_setting('app.tenant_id', true) é NULL fora de transação de tenant
--     → policy nega tudo (fail-closed).
DO $$
DECLARE
  t TEXT;
  tabelas TEXT[] := ARRAY['contas_bancarias','cupons_fiscais','transacoes_banco',
                          'itens_cupom','categorias','regras_categorizacao','audit_log'];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP POLICY IF EXISTS p_isolamento_app ON %I', t);
    EXECUTE format(
      'CREATE POLICY p_isolamento_app ON %I '
      || 'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      || 'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;

  EXECUTE 'DROP POLICY IF EXISTS p_isolamento_app ON tenants';
  EXECUTE 'CREATE POLICY p_isolamento_app ON tenants '
    || 'USING (id = current_setting(''app.tenant_id'', true)::uuid)';
  EXECUTE 'DROP POLICY IF EXISTS p_isolamento_app ON tenant_members';
  EXECUTE 'CREATE POLICY p_isolamento_app ON tenant_members '
    || 'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)';
END $$;

-- 6b. Policies por membro (Supabase Auth) — só quando auth.uid() existe.
--     Protegem o caminho PostgREST/API direta do Supabase.
DO $$
DECLARE
  t TEXT;
  tabelas TEXT[] := ARRAY['contas_bancarias','cupons_fiscais','transacoes_banco',
                          'itens_cupom','categorias','regras_categorizacao','audit_log'];
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    FOREACH t IN ARRAY tabelas LOOP
      EXECUTE format('DROP POLICY IF EXISTS p_membro_tenant ON %I', t);
      EXECUTE format(
        'CREATE POLICY p_membro_tenant ON %I FOR ALL TO authenticated '
        || 'USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())) '
        || 'WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))', t);
    END LOOP;

    EXECUTE 'DROP POLICY IF EXISTS p_membro_tenant ON tenants';
    EXECUTE 'CREATE POLICY p_membro_tenant ON tenants FOR SELECT TO authenticated '
      || 'USING (id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS p_membro_proprio ON tenant_members';
    EXECUTE 'CREATE POLICY p_membro_proprio ON tenant_members FOR SELECT TO authenticated '
      || 'USING (user_id = auth.uid())';
  END IF;
END $$;

-- 6c. Menor privilégio (Lei 7.5): acesso anônimo zero no schema public.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
END $$;

COMMIT;
