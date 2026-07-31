/** Módulo de criação manual de cupons e adição individual de itens. Expõe window.CuponsUI. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let categoriasCache = [];

  function preencherSelectCategorias(selectElement, selecionada = 'outros') {
    selectElement.innerHTML = '';
    for (const cat of categoriasCache) {
      const opt = document.createElement('option');
      opt.value = cat.chave;
      opt.textContent = cat.nome;
      opt.selected = cat.chave === selecionada;
      selectElement.appendChild(opt);
    }
  }

  function criarLinhaItemForm() {
    const div = document.createElement('div');
    div.className = 'linha-item-cupom-form';

    const inputNome = document.createElement('input');
    inputNome.type = 'text';
    inputNome.placeholder = 'Ex.: Arroz 5kg';
    inputNome.className = 'item-nome-input';
    inputNome.required = true;

    const inputQtd = document.createElement('input');
    inputQtd.type = 'number';
    inputQtd.step = '0.001';
    inputQtd.min = '0.001';
    inputQtd.value = '1';
    inputQtd.className = 'item-qtd-input';
    inputQtd.required = true;

    const inputPreco = document.createElement('input');
    inputPreco.type = 'number';
    inputPreco.step = '0.01';
    inputPreco.min = '0';
    inputPreco.placeholder = 'Preço (R$)';
    inputPreco.className = 'item-preco-input';
    inputPreco.required = true;

    const selectCat = document.createElement('select');
    selectCat.className = 'item-cat-select';
    preencherSelectCategorias(selectCat, 'outros');

    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.className = 'btn-icone';
    btnRemover.title = 'Remover linha';
    btnRemover.textContent = '✕';
    btnRemover.addEventListener('click', () => {
      const container = $('novo-cupom-itens-lista');
      if (container.children.length > 1) {
        div.remove();
      }
    });

    div.append(inputNome, inputQtd, inputPreco, selectCat, btnRemover);
    return div;
  }

  function abrirModalNovoCupom(categorias = []) {
    if (categorias.length > 0) categoriasCache = categorias;
    const form = $('form-novo-cupom');
    if (form) form.reset();

    const dataInput = $('novo-cupom-data');
    if (dataInput) {
      const hoje = new Date();
      dataInput.value = hoje.toISOString().split('T')[0];
    }

    const container = $('novo-cupom-itens-lista');
    if (container) {
      container.innerHTML = '';
      container.appendChild(criarLinhaItemForm());
    }

    const erro = $('novo-cupom-erro');
    if (erro) erro.hidden = true;

    const modal = $('modal-novo-cupom');
    if (modal) {
      modal.hidden = false;
      const estab = $('novo-cupom-estabelecimento');
      if (estab) estab.focus();
    }
  }

  function abrirModalAdicionarItem(cupomId, categorias = []) {
    if (categorias.length > 0) categoriasCache = categorias;
    $('form-adicionar-item-cupom').reset();
    $('add-item-cupom-id').value = cupomId;

    const selectCat = $('add-item-cupom-categoria');
    if (selectCat) preencherSelectCategorias(selectCat, 'outros');

    const erro = $('add-item-cupom-erro');
    if (erro) erro.hidden = true;

    const modal = $('modal-adicionar-item-cupom');
    if (modal) {
      modal.hidden = false;
      const nomeInput = $('add-item-cupom-nome');
      if (nomeInput) nomeInput.focus();
    }
  }

  function fecharModais() {
    if ($('modal-novo-cupom')) $('modal-novo-cupom').hidden = true;
    if ($('modal-adicionar-item-cupom')) $('modal-adicionar-item-cupom').hidden = true;
  }

  function configurar(chamarApi, aoSalvar, getCategorias) {
    const botoesAbrir = document.querySelectorAll('#btn-novo-cupom-manual, .btn-novo-cupom-manual');
    botoesAbrir.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cats = typeof getCategorias === 'function' ? getCategorias() : [];
        abrirModalNovoCupom(cats);
      });
    });

    const btnAddLinha = $('btn-add-linha-item');
    if (btnAddLinha) {
      btnAddLinha.addEventListener('click', () => {
        const container = $('novo-cupom-itens-lista');
        if (container) container.appendChild(criarLinhaItemForm());
      });
    }

    const btnsCancelar = document.querySelectorAll('#btn-cancelar-novo-cupom, #btn-cancelar-add-item-cupom');
    btnsCancelar.forEach((b) => b.addEventListener('click', fecharModais));

    const formNovoCupom = $('form-novo-cupom');
    if (formNovoCupom) {
      formNovoCupom.addEventListener('submit', async (e) => {
        e.preventDefault();
        const erro = $('novo-cupom-erro');
        if (erro) erro.hidden = true;

        const estabelecimento = $('novo-cupom-estabelecimento').value.trim();
        const data_emissao = $('novo-cupom-data').value;

        const linhas = document.querySelectorAll('#novo-cupom-itens-lista .linha-item-cupom-form');
        const itens = [];
        linhas.forEach((linha) => {
          const nome = linha.querySelector('.item-nome-input').value.trim();
          const qtd = linha.querySelector('.item-qtd-input').value;
          const preco = linha.querySelector('.item-preco-input').value;
          const cat = linha.querySelector('.item-cat-select').value;
          if (nome) {
            itens.push({ nome_produto: nome, quantidade: qtd, preco_unitario: preco, categoria: cat });
          }
        });

        try {
          await chamarApi('/api/cupons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estabelecimento, data_emissao, itens }),
          });
          fecharModais();
          if (typeof aoSalvar === 'function') await aoSalvar();
        } catch (err) {
          if (erro) {
            erro.textContent = err.message;
            erro.hidden = false;
          }
        }
      });
    }

    const formAddItem = $('form-adicionar-item-cupom');
    if (formAddItem) {
      formAddItem.addEventListener('submit', async (e) => {
        e.preventDefault();
        const erro = $('add-item-cupom-erro');
        if (erro) erro.hidden = true;

        const cupomId = $('add-item-cupom-id').value;
        const corpo = {
          nome_produto: $('add-item-cupom-nome').value.trim(),
          quantidade: $('add-item-cupom-quantidade').value,
          preco_unitario: $('add-item-cupom-preco').value,
          categoria: $('add-item-cupom-categoria').value,
        };

        try {
          await chamarApi(`/api/cupons/${cupomId}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo),
          });
          fecharModais();
          if (typeof aoSalvar === 'function') await aoSalvar();
        } catch (err) {
          if (erro) {
            erro.textContent = err.message;
            erro.hidden = false;
          }
        }
      });
    }
  }

  window.CuponsUI = { configurar, abrirModalNovoCupom, abrirModalAdicionarItem, fecharModais };
})();
