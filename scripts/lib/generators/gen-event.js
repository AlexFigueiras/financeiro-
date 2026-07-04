const fs = require('fs');
const path = require('path');
const { raizProjeto } = require('../fs-utils');

function pascalCase(nome) {
  return nome.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
}

function gerarEvent(nome) {
  if (!/^[a-z][a-z0-9-]*$/.test(nome)) {
    throw new Error('Nome do evento deve ser kebab-case (ex.: fatura-emitida).');
  }
  const raiz = raizProjeto();
  const arquivoEvento = path.join(raiz, 'src/events', `${nome}.ts`);
  if (fs.existsSync(arquivoEvento)) {
    throw new Error(`src/events/${nome}.ts já existe.`);
  }
  const Pascal = pascalCase(nome);
  const chaveRegistry = `'${nome}.v1'`;

  fs.writeFileSync(
    arquivoEvento,
    `import { z } from 'zod';

/** v1 — <descreva quando este evento é publicado>. */
export const ${camelCase(nome)}Schema = z.object({
  tenantId: z.string().uuid(),
});

export type ${Pascal}V1 = z.infer<typeof ${camelCase(nome)}Schema>;
`
  );

  const registryPath = path.join(raiz, 'src/events/registry.ts');
  let registry = fs.readFileSync(registryPath, 'utf8');
  const importLine = `import { ${camelCase(nome)}Schema } from './${nome}';\n`;
  registry = registry.replace(
    /(import { z } from 'zod';\n)/,
    `$1${importLine}`
  );
  registry = registry.replace(
    /(export const registroEventos = \{\n)/,
    `$1  ${chaveRegistry}: ${camelCase(nome)}Schema,\n`
  );
  registry = registry.replace(
    /(export type PayloadDe.*\n)/,
    `$1\nexport type { ${Pascal}V1 } from './${nome}';\n`
  );
  fs.writeFileSync(registryPath, registry);

  console.log(`Evento criado: src/events/${nome}.ts (registrado em src/events/registry.ts como ${chaveRegistry})`);
  console.log('Edite o schema, publique com publicar(\'' + nome + '.v1\', {...}) e assine com assinar(...).');
}

function camelCase(nome) {
  const p = pascalCase(nome);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

module.exports = { gerarEvent };
