#!/usr/bin/env node
/** §13 — valida Conventional Commits (feat:, fix:, chore:, refactor:, docs:, test:, ci:, build:, perf:, style:). */
const fs = require('fs');

const TIPOS = ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'ci', 'build', 'perf', 'style', 'revert'];
const REGEX = new RegExp(`^(${TIPOS.join('|')})(\\([\\w-]+\\))?!?: .+`);

const arquivoMsg = process.argv[2];
if (!arquivoMsg) {
  console.error('Uso: check-commit-msg.js <arquivo-com-a-mensagem>');
  process.exit(1);
}

const mensagem = fs.readFileSync(arquivoMsg, 'utf8').split('\n')[0].trim();

if (mensagem.startsWith('Merge ') || mensagem.startsWith('Revert ')) {
  process.exit(0); // commits automáticos do git não seguem o padrão
}

if (!REGEX.test(mensagem)) {
  console.error(`❌ Mensagem de commit fora do padrão Conventional Commits:\n  "${mensagem}"`);
  console.error(`   Use um dos tipos: ${TIPOS.join(', ')} — ex.: "feat(cupons): adiciona filtro por categoria"`);
  process.exit(1);
}
process.exit(0);
