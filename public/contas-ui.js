/** Modal de contas bancárias: lista com editar/excluir + formulário de criar/editar. Expõe window.ContasUI. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function resetarFormulario() {
    $('form-conta').reset();
    $('conta-id').value = '';
    $('conta-erro').hidden = true;
  }

  async function renderizarLista(chamarApi) {
    const lista = $('lista-contas');
    const contas = await chamarApi('/api/contas');
    lista.innerHTML = '';
    for (const conta of contas) {
      const li = document.createElement('li');

      const nome = document.createElement('span');
      nome.className = 'conta-nome';
      nome.textContent = conta.nome;

      const saldo = document.createElement('span');
      saldo.className = 'conta-saldo';
      saldo.textContent = fmtBRL.format(conta.saldoAtual);

      const btnEditar = document.createElement('button');
      btnEditar.type = 'button';
      btnEditar.className = 'btn-icone';
      btnEditar.title = 'Editar conta';
      btnEditar.textContent = '✎';
      btnEditar.addEventListener('click', () => {
        $('conta-id').value = conta.id;
        $('conta-nome').value = conta.nome;
        $('conta-tipo').value = conta.tipo;
        $('conta-erro').hidden = true;
        $('conta-nome').focus();
      });

      const btnExcluir = document.createElement('button');
      btnExcluir.type = 'button';
      btnExcluir.className = 'btn-icone';
      btnExcluir.title = 'Excluir conta';
      btnExcluir.textContent = '🗑';
      btnExcluir.addEventListener('click', async () => {
        if (!confirm(`Excluir a conta "${conta.nome}"?`)) return;
        const erro = $('conta-erro');
        erro.hidden = true;
        try {
          await chamarApi(`/api/contas/${conta.id}`, { method: 'DELETE' });
          await renderizarLista(chamarApi);
        } catch (err) {
          erro.textContent = err.message;
          erro.hidden = false;
        }
      });

      li.append(nome, saldo, btnEditar, btnExcluir);
      lista.appendChild(li);
    }
  }

  function abrirModal(comIntro) {
    resetarFormulario();
    $('modal-conta-intro').hidden = !comIntro;
    $('modal-conta').hidden = false;
    $('conta-nome').focus();
  }

  function fecharModal() {
    $('modal-conta').hidden = true;
  }

  /** chamarApi: injetado por app.js (evita import circular entre os dois módulos). */
  function configurarContas(chamarApi, aoMudar) {
    $('btn-nova-conta').addEventListener('click', async () => {
      abrirModal(false);
      await renderizarLista(chamarApi);
    });
    $('btn-cancelar-conta').addEventListener('click', fecharModal);

    $('form-conta').addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = $('conta-erro');
      erro.hidden = true;
      const id = $('conta-id').value;
      const corpo = { nome: $('conta-nome').value.trim(), tipo: $('conta-tipo').value };
      try {
        await chamarApi(id ? `/api/contas/${id}` : '/api/contas', {
          method: id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        });
        resetarFormulario();
        await renderizarLista(chamarApi);
        await aoMudar();
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
      }
    });
  }

  /** Verifica se o tenant já tem conta bancária; se não tiver, abre o modal explicando por quê. */
  async function garantirConta(chamarApi) {
    const contas = await chamarApi('/api/contas');
    if (contas.length === 0) {
      abrirModal(true);
      await renderizarLista(chamarApi);
    }
  }

  window.ContasUI = { configurarContas, garantirConta };
})();
