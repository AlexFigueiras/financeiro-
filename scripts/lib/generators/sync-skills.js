const fs = require('fs');
const path = require('path');
const { raizProjeto, listarArquivos } = require('../fs-utils');

/** Copia cada domains/<x>/CONTEXT.md → .claude/skills/<x>/SKILL.md e .gemini/skills/<x>/SKILL.md. */
function sincronizarSkills() {
  const raiz = raizProjeto();
  const contextos = listarArquivos(path.join(raiz, 'src/domains'), ['.md']).filter((a) =>
    a.endsWith('CONTEXT.md')
  );

  let total = 0;
  for (const contexto of contextos) {
    const dominio = path.basename(path.dirname(contexto));
    const conteudo = fs.readFileSync(contexto, 'utf8');
    const cabecalho = `---\nname: ${dominio}\ndescription: Contexto do domínio "${dominio}" (sincronizado automaticamente de domains/${dominio}/CONTEXT.md — não edite aqui, edite lá).\n---\n\n`;

    for (const destino of ['.claude/skills', '.gemini/skills']) {
      const dir = path.join(raiz, destino, dominio);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), cabecalho + conteudo);
      total++;
    }
  }

  console.log(`${contextos.length} domínio(s) sincronizado(s) → ${total} SKILL.md gerado(s) em .claude/ e .gemini/.`);
}

module.exports = { sincronizarSkills };
