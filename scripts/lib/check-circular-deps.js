/**
 * §6.3/§9.1 — detecta dependências circulares (A → B → C → A) no grafo de
 * imports de src/. Ciclos INTRA-domínio (ex.: domains/x/index.ts ↔
 * domains/x/actions/*.ts, o barrel padrão que injeta o service wireado no
 * router) são permitidos — são um detalhe de implementação de um único
 * domínio, não a violação de boundary que a Seção 6 (cross-domain) mira.
 * Ciclos que atravessam domínios (ou envolvem shared/infra/events) falham.
 */
const fs = require('fs');
const path = require('path');
const { listarArquivos, raizProjeto } = require('./fs-utils');

function resolverImport(arquivo, imp) {
  const base = path.resolve(path.dirname(arquivo), imp);
  const candidatos = [`${base}.ts`, path.join(base, 'index.ts')];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

function construirGrafo(raizSrc) {
  const arquivos = listarArquivos(raizSrc, ['.ts']).filter((a) => !a.endsWith('.test.ts'));
  const grafo = new Map();
  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    const imports = [...conteudo.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
      .map((m) => resolverImport(arquivo, m[1]))
      .filter(Boolean);
    grafo.set(arquivo, imports);
  }
  return grafo;
}

function dominioDoArquivo(raizDomains, arquivo) {
  const rel = path.relative(raizDomains, arquivo);
  if (rel.startsWith('..')) return null; // fora de domains/ (shared/infra/events/app...)
  return rel.split(path.sep)[0];
}

/** Falso quando o ciclo inteiro pertence ao mesmo domínio (barrel intra-domínio, permitido). */
function cicloAtravessaBoundary(ciclo, raizDomains) {
  const marcadores = ciclo.map((a) => dominioDoArquivo(raizDomains, a) ?? `__fora__:${a}`);
  const unico = new Set(marcadores);
  if (unico.size === 1 && !marcadores[0].startsWith('__fora__:')) return false;
  return true;
}

function acharCicloRelevante(grafo, raizDomains) {
  const BRANCO = 0, CINZA = 1, PRETO = 2;
  const cor = new Map();
  const pilha = [];

  function dfs(no) {
    cor.set(no, CINZA);
    pilha.push(no);
    for (const vizinho of grafo.get(no) || []) {
      const corVizinho = cor.get(vizinho) ?? BRANCO;
      if (corVizinho === CINZA) {
        const inicio = pilha.indexOf(vizinho);
        const ciclo = [...pilha.slice(inicio), vizinho];
        if (cicloAtravessaBoundary(ciclo, raizDomains)) return ciclo;
        continue; // ciclo intra-domínio: ignora e segue procurando outros vizinhos
      }
      if (corVizinho === BRANCO) {
        const encontrado = dfs(vizinho);
        if (encontrado) return encontrado;
      }
    }
    pilha.pop();
    cor.set(no, PRETO);
    return null;
  }

  for (const no of grafo.keys()) {
    if ((cor.get(no) ?? BRANCO) === BRANCO) {
      const ciclo = dfs(no);
      if (ciclo) return ciclo;
    }
  }
  return null;
}

async function run() {
  const raiz = raizProjeto();
  const grafo = construirGrafo(path.join(raiz, 'src'));
  const ciclo = acharCicloRelevante(grafo, path.join(raiz, 'src/domains'));

  if (ciclo) {
    const legivel = ciclo.map((a) => path.relative(raiz, a).replace(/\\/g, '/')).join('\n    → ');
    return { name: 'circular-deps', status: 'fail', message: `Dependência circular entre domínios (ou em shared/infra/events):\n    → ${legivel}` };
  }
  return { name: 'circular-deps', status: 'pass', message: `${grafo.size} arquivo(s) analisado(s), nenhum ciclo cross-domain.` };
}

module.exports = { name: 'circular-deps', run };
