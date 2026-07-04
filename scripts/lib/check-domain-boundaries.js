/** §6.1/§9.1 — import cross-domain só é permitido pelo index.ts público do domínio alvo. */
const fs = require('fs');
const path = require('path');
const { listarArquivos, raizProjeto } = require('./fs-utils');

function dominioDe(raizDomains, arquivoAbsoluto) {
  const rel = path.relative(raizDomains, arquivoAbsoluto);
  if (rel.startsWith('..')) return null;
  return rel.split(path.sep)[0];
}

async function run() {
  const raiz = raizProjeto();
  const raizDomains = path.join(raiz, 'src/domains');
  const arquivos = listarArquivos(raizDomains, ['.ts']);
  const violacoes = [];

  for (const arquivo of arquivos) {
    const dominioAtual = dominioDe(raizDomains, arquivo);
    if (!dominioAtual) continue;

    const conteudo = fs.readFileSync(arquivo, 'utf8');
    const imports = [...conteudo.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
    const relatorio = path.relative(raiz, arquivo).replace(/\\/g, '/');

    for (const imp of imports) {
      const resolvido = path.resolve(path.dirname(arquivo), imp);
      const dominioAlvo = dominioDe(raizDomains, resolvido);
      if (!dominioAlvo || dominioAlvo === dominioAtual) continue;

      const dentroDoAlvo = path
        .relative(path.join(raizDomains, dominioAlvo), resolvido)
        .replace(/\\/g, '/');
      const ehIndexPublico = dentroDoAlvo === '' || dentroDoAlvo === 'index';

      if (!ehIndexPublico) {
        violacoes.push(
          `${relatorio}: importa "${imp}" — alcança internals de domains/${dominioAlvo} em vez do index.ts público.`
        );
      }
    }
  }

  if (violacoes.length > 0) {
    return { name: 'domain-boundaries', status: 'fail', message: violacoes.join('\n  ') };
  }
  return { name: 'domain-boundaries', status: 'pass', message: `${arquivos.length} arquivo(s) verificado(s), nenhum acesso a internals de outro domínio.` };
}

module.exports = { name: 'domain-boundaries', run };
