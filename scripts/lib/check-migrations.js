/** §7.1/§7.2/§9.1 — toda tabela (exceto allowlist global) tem tenant_id, RLS habilitada e ≥1 policy. */
const fs = require('fs');
const path = require('path');
const { listarArquivos, raizProjeto } = require('./fs-utils');

// Tabelas verdadeiramente globais (sem dado de tenant) — não exigem tenant_id.
const ALLOWLIST_SEM_TENANT = new Set(['tenants', 'schema_migrations']);

function tabelaTemColuna(sql, tabela, coluna) {
  const regexCreate = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+${tabela}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i');
  const mCreate = sql.match(regexCreate);
  if (mCreate && new RegExp(`\\b${coluna}\\b`, 'i').test(mCreate[1])) return true;

  const regexAlter = new RegExp(`ALTER TABLE\\s+${tabela}\\s+ADD COLUMN(?: IF NOT EXISTS)?\\s+${coluna}\\b`, 'i');
  return regexAlter.test(sql);
}

function rlsHabilitada(sql, tabela) {
  return new RegExp(`ALTER TABLE\\s+${tabela}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(sql);
}

/** Tabelas com policy: matches literais + heurística para policies criadas em loop dinâmico (DO $$ ... ARRAY[...]). */
function tabelasComPolicy(sql) {
  const tabelas = new Set();
  for (const m of sql.matchAll(/CREATE POLICY\s+\S+\s+ON\s+(\w+)/gi)) tabelas.add(m[1].toLowerCase());

  const blocosDo = sql.match(/DO \$\$[\s\S]*?END \$\$;/gi) || [];
  for (const bloco of blocosDo) {
    if (!/CREATE POLICY/i.test(bloco)) continue;
    for (const q of bloco.matchAll(/'([a-zA-Z_][a-zA-Z0-9_]*)'/g)) tabelas.add(q[1].toLowerCase());
  }
  return tabelas;
}

async function run() {
  const raiz = raizProjeto();
  const arquivos = listarArquivos(path.join(raiz, 'infra/db/migrations'), ['.sql']).sort();
  if (arquivos.length === 0) {
    return { name: 'migrations', status: 'pass', message: 'Nenhuma migration encontrada ainda.' };
  }

  const sql = arquivos.map((a) => fs.readFileSync(a, 'utf8')).join('\n');
  const tabelas = [...new Set([...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)/gi)].map((m) => m[1].toLowerCase()))];
  const comPolicy = tabelasComPolicy(sql);

  const falhas = [];
  for (const tabela of tabelas) {
    if (!ALLOWLIST_SEM_TENANT.has(tabela) && !tabelaTemColuna(sql, tabela, 'tenant_id')) {
      falhas.push(`${tabela}: sem coluna tenant_id (Lei 7.1) e fora da allowlist global.`);
    }
    if (!rlsHabilitada(sql, tabela)) {
      falhas.push(`${tabela}: RLS não habilitada (falta ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY).`);
    }
    if (!comPolicy.has(tabela)) {
      falhas.push(`${tabela}: nenhuma policy encontrada (Lei 7.2 exige ≥1).`);
    }
  }

  if (falhas.length > 0) {
    return { name: 'migrations', status: 'fail', message: falhas.join('\n  ') };
  }
  return { name: 'migrations', status: 'pass', message: `${tabelas.length} tabela(s) verificada(s): tenant_id + RLS + policy OK.` };
}

module.exports = { name: 'migrations', run };
