const fs = require('fs');
const path = require('path');
const { raizProjeto } = require('../fs-utils');

function camel(nome) {
  return nome.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** node scripts/generate.js action <dominio> <nome-da-rota> */
function gerarAction(dominio, nomeRota) {
  if (!dominio || !nomeRota) {
    throw new Error('Uso: node scripts/generate.js action <dominio> <nome-da-rota>');
  }
  const raiz = raizProjeto();
  const dirDominio = path.join(raiz, 'src/domains', dominio);
  if (!fs.existsSync(dirDominio)) {
    throw new Error(`domains/${dominio} não existe — crie com "generate.js domain ${dominio}" primeiro.`);
  }

  const arquivo = path.join(dirDominio, 'actions', `${nomeRota}-actions.ts`);
  if (fs.existsSync(arquivo)) {
    throw new Error(`${path.relative(raiz, arquivo)} já existe.`);
  }

  const fnNome = camel(nomeRota);
  const dominioCamel = camel(dominio);
  fs.writeFileSync(
    arquivo,
    `import { Router } from 'express';
import { asyncHandler, AppError } from '../../../shared/errors/app-error';
import { ${dominioCamel}Service } from '../index';

export const ${fnNome}Router = Router();

/** TODO: descreva o contrato desta rota (método, path, query/body esperados). */
${fnNome}Router.get(
  '/',
  asyncHandler(async (req, res) => {
    // TODO: validar entrada e chamar ${dominioCamel}Service.<metodo>(req.tenantId!, ...)
    res.json({ tenantId: req.tenantId });
  })
);
`
  );

  console.log(`Action criada: ${path.relative(raiz, arquivo)}`);
  console.log(`Lembre-se de: exportar ${fnNome}Router em domains/${dominio}/index.ts e montar em src/app.ts.`);
}

module.exports = { gerarAction };
