const fs = require('fs');
const path = require('path');
const { raizProjeto, listarArquivos } = require('../fs-utils');

function proximoNumero(dirMigrations) {
  const arquivos = listarArquivos(dirMigrations, ['.sql']);
  const numeros = arquivos
    .map((a) => path.basename(a).match(/^(\d{4})_/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  const maior = numeros.length > 0 ? Math.max(...numeros) : 0;
  return String(maior + 1).padStart(4, '0');
}

function gerarMigration(tabela) {
  if (!/^[a-z][a-z0-9_]*$/.test(tabela)) {
    throw new Error('Nome da tabela deve ser snake_case (ex.: notas_fiscais).');
  }
  const raiz = raizProjeto();
  const dir = path.join(raiz, 'infra/db/migrations');
  const numero = proximoNumero(dir);
  const arquivo = path.join(dir, `${numero}_${tabela}.sql`);

  const sql = `-- ============================================================================
-- ${numero} — ${tabela.toUpperCase()}
-- Gerado por scripts/generate.js migration ${tabela}. Edite as colunas e ajuste
-- as policies conforme a regra de negócio real antes de aplicar.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ${tabela} (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_${tabela}_tenant ON ${tabela} (tenant_id);

-- Trigger padrão de atualizado_em
CREATE OR REPLACE FUNCTION fn_${tabela}_atualizado_em() RETURNS trigger AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_${tabela}_atualizado_em ON ${tabela};
CREATE TRIGGER trg_${tabela}_atualizado_em
    BEFORE UPDATE ON ${tabela}
    FOR EACH ROW EXECUTE FUNCTION fn_${tabela}_atualizado_em();

-- Row-Level Security (Lei 7.2) — obrigatório
ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_isolamento_app ON ${tabela};
CREATE POLICY p_isolamento_app ON ${tabela}
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Menor privilégio (Lei 7.5)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ${tabela} FROM anon';
  END IF;
END $$;

COMMIT;
`;

  fs.writeFileSync(arquivo, sql);
  console.log(`Migration criada: infra/db/migrations/${numero}_${tabela}.sql`);
  console.log('Edite as colunas de negócio e rode: npm run db:migrate');
}

module.exports = { gerarMigration };
