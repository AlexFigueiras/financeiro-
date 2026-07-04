const fs = require('fs');
const path = require('path');

const IGNORAR_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'vendor', '.vercel']);

/** Lista recursivamente arquivos sob `dir` cujo nome bate com `extensoes`. */
function listarArquivos(dir, extensoes, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR_DIRS.has(nome)) continue;
    const completo = path.join(dir, nome);
    const stat = fs.statSync(completo);
    if (stat.isDirectory()) {
      listarArquivos(completo, extensoes, acc);
    } else if (extensoes.some((ext) => nome.endsWith(ext))) {
      acc.push(completo);
    }
  }
  return acc;
}

/** Conta linhas "líquidas": ignora vazias e comentários de linha inteira (// ou *). */
function contarLinhasLiquidas(conteudo) {
  return conteudo
    .split(/\r?\n/)
    .filter((linha) => {
      const t = linha.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).length;
}

function raizProjeto() {
  return path.resolve(__dirname, '../..');
}

module.exports = { listarArquivos, contarLinhasLiquidas, raizProjeto, IGNORAR_DIRS };
