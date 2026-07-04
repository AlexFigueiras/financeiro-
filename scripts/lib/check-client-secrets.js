/** §7.3/§9.1 — nenhuma credencial privilegiada em arquivos de cliente ou hardcoded fora de .env*. */
const fs = require('fs');
const path = require('path');
const { listarArquivos, raizProjeto } = require('./fs-utils');

const PADROES_PROIBIDOS_CLIENTE = [
  /SERVICE_ROLE_KEY/i,
  /createAdminClient/i,
  /supabaseAdmin/i,
  /service[_-]?role/i,
];

// Chaves de API com formato reconhecível hardcoded em código (fora de .env*).
const PADROES_SECRET_HARDCODED = [
  /AIza[0-9A-Za-z\-_]{35}/, // Google API key
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI-style secret key
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // chave privada
];

async function run() {
  const raiz = raizProjeto();
  const falhas = [];

  // 1) Arquivos servidos ao navegador (public/) nunca podem conter segredo de servidor.
  const arquivosCliente = listarArquivos(path.join(raiz, 'public'), ['.js', '.html']);
  for (const arquivo of arquivosCliente) {
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    const relativo = path.relative(raiz, arquivo).replace(/\\/g, '/');
    for (const padrao of PADROES_PROIBIDOS_CLIENTE) {
      if (padrao.test(conteudo)) {
        falhas.push(`${relativo}: padrão proibido em arquivo de cliente (${padrao}).`);
      }
    }
  }

  // 2) Nenhum arquivo de código (fora de .env*) deve ter uma chave hardcoded reconhecível.
  const arquivosCodigo = ['src', 'public', 'scripts', 'infra']
    .flatMap((d) => listarArquivos(path.join(raiz, d), ['.ts', '.js', '.sql']));
  for (const arquivo of arquivosCodigo) {
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    const relativo = path.relative(raiz, arquivo).replace(/\\/g, '/');
    for (const padrao of PADROES_SECRET_HARDCODED) {
      if (padrao.test(conteudo)) {
        falhas.push(`${relativo}: possível segredo hardcoded (padrão ${padrao}).`);
      }
    }
  }

  if (falhas.length > 0) {
    return { name: 'client-secrets', status: 'fail', message: falhas.join('\n  ') };
  }
  return { name: 'client-secrets', status: 'pass', message: 'Nenhum segredo de servidor ou chave hardcoded encontrado.' };
}

module.exports = { name: 'client-secrets', run };
