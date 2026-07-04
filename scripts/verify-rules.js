#!/usr/bin/env node
/** §9.1 do Dev OS — análise estática ativa. Exit 0 se passa, exit 1 se falha. */
const checks = [
  require('./lib/check-file-size'),
  require('./lib/check-client-secrets'),
  require('./lib/check-migrations'),
  require('./lib/check-domain-boundaries'),
  require('./lib/check-circular-deps'),
  require('./lib/check-status-doc'),
];

const CORES = { fail: '\x1b[31m', warn: '\x1b[33m', pass: '\x1b[32m', reset: '\x1b[0m' };
const ICONE = { fail: '❌', warn: '⚠️ ', pass: '✅' };

(async () => {
  const resultados = [];
  for (const check of checks) {
    try {
      resultados.push(await check.run());
    } catch (err) {
      resultados.push({ name: check.name, status: 'fail', message: `Erro ao rodar o check: ${err.message}` });
    }
  }

  for (const r of resultados) {
    const cor = CORES[r.status] ?? '';
    console.log(`${cor}${ICONE[r.status]} [${r.name}] ${r.message}${CORES.reset}`);
  }

  const falhas = resultados.filter((r) => r.status === 'fail');
  const warnings = resultados.filter((r) => r.status === 'warn');

  console.log('');
  if (falhas.length > 0) {
    console.error(`${CORES.fail}${falhas.length} verificação(ões) falharam.${CORES.reset}`);
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log(`${CORES.warn}${warnings.length} aviso(s) — não bloqueiam, mas vale revisar.${CORES.reset}`);
  }
  console.log(`${CORES.pass}Todas as verificações passaram.${CORES.reset}`);
  process.exit(0);
})();
