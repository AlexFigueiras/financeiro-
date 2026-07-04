/** §4/§9.1 — arquivos de código > 500 linhas líquidas falham; > 300 é warning. */
const fs = require('fs');
const path = require('path');
const { listarArquivos, contarLinhasLiquidas, raizProjeto } = require('./fs-utils');

const LIMITE_WARNING = 300;
const LIMITE_FALHA = 500;
const DIRS_ALVO = ['src', 'public', 'scripts', 'infra'];
const EXTENSOES = ['.ts', '.tsx', '.js'];

async function run() {
  const raiz = raizProjeto();
  const baselinePath = path.join(__dirname, 'file-size-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  const arquivos = DIRS_ALVO.flatMap((d) => listarArquivos(path.join(raiz, d), EXTENSOES));
  const falhas = [];
  const warnings = [];

  for (const arquivo of arquivos) {
    const relativo = path.relative(raiz, arquivo).replace(/\\/g, '/');
    const linhas = contarLinhasLiquidas(fs.readFileSync(arquivo, 'utf8'));
    const tetoBaseline = baseline[relativo];

    if (tetoBaseline !== undefined) {
      if (linhas > tetoBaseline) {
        falhas.push(`${relativo}: ${linhas} linhas — cresceu além do baseline registrado (${tetoBaseline}). Reduza ou atualize o baseline conscientemente.`);
      } else if (linhas > LIMITE_WARNING) {
        warnings.push(`${relativo}: ${linhas} linhas (baseline legado: ${tetoBaseline}) — candidato a modularização.`);
      }
      continue;
    }

    if (linhas > LIMITE_FALHA) {
      falhas.push(`${relativo}: ${linhas} linhas líquidas (limite: ${LIMITE_FALHA}). Extraia componentes/serviços/tipos para arquivos próprios.`);
    } else if (linhas > LIMITE_WARNING) {
      warnings.push(`${relativo}: ${linhas} linhas líquidas (aviso a partir de ${LIMITE_WARNING}).`);
    }
  }

  if (falhas.length > 0) {
    return { name: 'file-size', status: 'fail', message: falhas.join('\n  ') };
  }
  if (warnings.length > 0) {
    return { name: 'file-size', status: 'warn', message: warnings.join('\n  ') };
  }
  return { name: 'file-size', status: 'pass', message: `${arquivos.length} arquivo(s) verificado(s), todos dentro do limite.` };
}

module.exports = { name: 'file-size', run };
