const fs = require('fs');
const path = require('path');
const { raizProjeto } = require('../fs-utils');

function gerarWorker(nome) {
  if (!/^[a-z][a-z0-9-]*$/.test(nome)) {
    throw new Error('Nome do worker deve ser kebab-case (ex.: envio-relatorio-mensal).');
  }
  const raiz = raizProjeto();
  const arquivo = path.join(raiz, 'worker', `${nome}.ts`);
  if (fs.existsSync(arquivo)) {
    throw new Error(`worker/${nome}.ts já existe.`);
  }
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });

  fs.writeFileSync(
    arquivo,
    `/**
 * Worker: ${nome}.
 * Wiring apenas (Seção 5.3) — a regra de negócio real deve viver no domínio
 * correspondente e ser importada aqui via seu index.ts público.
 */
import { loggerDe } from '../src/shared/observability/logger';

const log = loggerDe('worker:${nome}');

const MAX_TENTATIVAS = 3;

/** Idempotente: rodar duas vezes com o mesmo argumento não deve duplicar efeito. */
export async function executar${nome
      .split('-')
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join('')}(): Promise<void> {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      // TODO: lógica do job, delegando a domains/<dominio> via seu index.ts.
      log.info({ tentativa }, 'worker executado com sucesso');
      return;
    } catch (err) {
      log.error({ tentativa, err: (err as Error).message }, 'falha na execução do worker');
      if (tentativa === MAX_TENTATIVAS) throw err;
      await new Promise((r) => setTimeout(r, 2 ** tentativa * 1000)); // backoff exponencial
    }
  }
}
`
  );

  console.log(`Worker criado: worker/${nome}.ts`);
  console.log('Edite a lógica (delegando ao domínio correto) e agende sua execução (cron/queue).');
}

module.exports = { gerarWorker };
