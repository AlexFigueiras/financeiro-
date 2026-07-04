const fs = require('fs');
const path = require('path');
const { raizProjeto } = require('../fs-utils');

function pascalCase(nome) {
  return nome.replace(/(^|-)([a-z0-9])/gi, (_, __, c) => c.toUpperCase());
}

function camelCase(nome) {
  const p = pascalCase(nome);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function gerarDomain(nome) {
  if (!/^[a-z][a-z0-9-]*$/.test(nome)) {
    throw new Error('Nome do domínio deve ser kebab-case (ex.: faturamento, notas-fiscais).');
  }
  const raiz = raizProjeto();
  const dir = path.join(raiz, 'src/domains', nome);
  if (fs.existsSync(dir)) {
    throw new Error(`domains/${nome} já existe.`);
  }
  const Pascal = pascalCase(nome); // identificador de tipo/classe: PascalCase
  const camel = camelCase(nome); // identificador de variável/import: camelCase
  const rota = camel; // caminho da rota HTTP (kebab-case não é válido como identificador JS)

  const arquivos = {
    'CONTEXT.md': `# ${Pascal} — CONTEXT

## Propósito
<1 frase: o que este domínio resolve>

## Modelo
<entidades e invariantes principais>

## API pública
\`index.ts\` expõe \`${camel}Service\` e \`${camel}Router\`. Nada mais deve ser importado por outros domínios.

## Eventos
<publica / consome — ou "Não publica nem consome eventos hoje.">

## Regras locais
<RLS, masks, idempotência etc.>

## Gotchas
<armadilhas conhecidas>
`,
    'types.ts': `export interface ${Pascal} {
  id: number;
}
`,
    'ports/repository.ts': `export interface ${Pascal}Repository {
  listar(tenantId: string): Promise<unknown[]>;
}
`,
    'adapters/repository-pg.ts': `import { pool } from '../../../infra/db/pool';
import { ${Pascal}Repository } from '../ports/repository';

export const ${camel}RepositoryPg: ${Pascal}Repository = {
  async listar(tenantId) {
    const { rows } = await pool.query('SELECT 1 WHERE $1::uuid IS NOT NULL', [tenantId]);
    return rows;
  },
};
`,
    'services/service.ts': `import { ${Pascal}Repository } from '../ports/repository';

export function criar${Pascal}Service(repo: ${Pascal}Repository) {
  return {
    listar: (tenantId: string) => repo.listar(tenantId),
  };
}
`,
    'actions/actions.ts': `import { Router } from 'express';
import { asyncHandler } from '../../../shared/errors/app-error';
import { ${camel}Service } from '../index';

export const ${camel}Router = Router();

${camel}Router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await ${camel}Service.listar(req.tenantId!));
  })
);
`,
    'index.ts': `/** API pública do domínio ${nome}. */
import { ${camel}RepositoryPg } from './adapters/repository-pg';
import { criar${Pascal}Service } from './services/service';

export const ${camel}Service = criar${Pascal}Service(${camel}RepositoryPg);
export type { ${Pascal} } from './types';
export { ${camel}Router } from './actions/actions';
`,
    '__tests__/service.test.ts': `import { describe, it } from 'vitest';

describe('${camel}Service', () => {
  it.todo('escreva os testes de regra pura deste domínio aqui');
});
`,
  };

  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(dir, relativo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo);
  }

  console.log(`Domínio criado em domains/${nome}/. Próximos passos:`);
  console.log(`  1. Editar CONTEXT.md, types.ts e a regra de negócio real.`);
  console.log(`  2. Registrar o router em src/app.ts: app.use('/api/${rota}', ${camel}Router).`);
  console.log(`  3. node scripts/verify-rules.js`);
}

module.exports = { gerarDomain };
