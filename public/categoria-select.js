/* Fábrica do <select> de categoria (chip colorido) usado na tabela de
   transações e no accordion de itens de cupom. Expõe window.criarSelectCategoria. */
(() => {
  'use strict';

  /**
   * @param {{categorias: Array<{chave:string,nome:string,cor:string}>, categoriaAtual: string, aoSalvar: (novaCategoria: string) => Promise<{mensagem:string}>}} opts
   * @returns {HTMLSelectElement}
   */
  function criarSelectCategoria({ categorias, categoriaAtual, aoSalvar }) {
    const corDaCategoria = (chave) => categorias.find((c) => c.chave === chave)?.cor ?? '#898781';

    const select = document.createElement('select');
    select.className = 'select-categoria-chip';
    select.style.backgroundColor = 'transparent';
    select.style.color = corDaCategoria(categoriaAtual);
    select.style.border = `1px solid ${corDaCategoria(categoriaAtual)}`;
    select.style.borderRadius = '999px';
    select.style.padding = '1px 6px';
    select.style.fontSize = '10.5px';
    select.style.fontWeight = '600';
    select.style.cursor = 'pointer';
    select.style.textTransform = 'capitalize';
    select.style.webkitAppearance = 'none'; // remove estilo padrão do sistema
    select.style.mozAppearance = 'none';
    select.style.appearance = 'none';

    for (const cat of categorias) {
      const opt = document.createElement('option');
      opt.value = cat.chave;
      opt.textContent = cat.nome;
      opt.selected = cat.chave === categoriaAtual;
      opt.style.backgroundColor = 'var(--superficie)';
      opt.style.color = 'var(--ink-primario)';
      select.appendChild(opt);
    }

    select.addEventListener('change', async (e) => {
      const novaCategoria = e.target.value;
      const corAnterior = select.style.color;
      const bordaAnterior = select.style.borderColor || corDaCategoria(categoriaAtual);
      select.style.color = corDaCategoria(novaCategoria);
      select.style.borderColor = corDaCategoria(novaCategoria);
      select.disabled = true;
      try {
        await aoSalvar(novaCategoria);
      } catch {
        select.value = categoriaAtual;
        select.style.color = corAnterior;
        select.style.borderColor = bordaAnterior;
      } finally {
        select.disabled = false;
      }
    });

    return select;
  }

  window.criarSelectCategoria = criarSelectCategoria;
})();
