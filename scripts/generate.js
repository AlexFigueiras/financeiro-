#!/usr/bin/env node
/** §9.2 do Dev OS — gerador de blueprints padronizados (proibido criar manualmente, §2.2). */
const { gerarDomain } = require('./lib/generators/gen-domain');
const { gerarMigration } = require('./lib/generators/gen-migration');
const { gerarEvent } = require('./lib/generators/gen-event');
const { gerarWorker } = require('./lib/generators/gen-worker');
const { gerarAction } = require('./lib/generators/gen-action');
const { sincronizarSkills } = require('./lib/generators/sync-skills');

const USO = `Uso:
  node scripts/generate.js domain <nome>              — cria domains/<nome> completo
  node scripts/generate.js migration <tabela>          — cria infra/db/migrations/NNNN_<tabela>.sql
  node scripts/generate.js action <dominio> <nome>     — cria domains/<dominio>/actions/<nome>-actions.ts
  node scripts/generate.js event <nome>                — cria src/events/<nome>.ts + registra no registry
  node scripts/generate.js worker <nome>               — cria worker/<nome>.ts
  node scripts/generate.js sync-skills                 — copia CONTEXT.md → .claude/.gemini skills`;

const [, , tipo, ...args] = process.argv;

try {
  switch (tipo) {
    case 'domain':
      gerarDomain(args[0]);
      break;
    case 'migration':
      gerarMigration(args[0]);
      break;
    case 'action':
      gerarAction(args[0], args[1]);
      break;
    case 'event':
      gerarEvent(args[0]);
      break;
    case 'worker':
      gerarWorker(args[0]);
      break;
    case 'sync-skills':
      sincronizarSkills();
      break;
    default:
      console.log(USO);
      process.exit(tipo ? 1 : 0);
  }
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
