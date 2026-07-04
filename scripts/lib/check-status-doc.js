/** §2.7/§3.4/§9.1 — lembrete (nunca bloqueia): mudança em domínio/migration sem tocar docs/STATUS.md. */
const { execSync } = require('child_process');
const { raizProjeto } = require('./fs-utils');

const CAMINHOS_RELEVANTES = [/^src\/domains\//, /^infra\/db\/migrations\//];

async function run() {
  let arquivosStaged;
  try {
    arquivosStaged = execSync('git diff --cached --name-only', { cwd: raizProjeto(), encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    // Fora de um repo git ou sem stage (ex.: CI) — nada a lembrar.
    return { name: 'status-doc', status: 'pass', message: 'Sem stage git para verificar (CI ou fora de um repositório).' };
  }

  if (arquivosStaged.length === 0) {
    return { name: 'status-doc', status: 'pass', message: 'Nenhum arquivo em stage.' };
  }

  const tocouCodigoRelevante = arquivosStaged.some((f) => CAMINHOS_RELEVANTES.some((r) => r.test(f)));
  const tocouStatus = arquivosStaged.includes('docs/STATUS.md');

  if (tocouCodigoRelevante && !tocouStatus) {
    return {
      name: 'status-doc',
      status: 'warn',
      message: 'Mudança em domains/ ou migrations sem atualizar docs/STATUS.md — confirme se o estado da feature mudou (§2.7/§3.4).',
    };
  }
  return { name: 'status-doc', status: 'pass', message: 'OK.' };
}

module.exports = { name: 'status-doc', run };
