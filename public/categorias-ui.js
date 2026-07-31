/** Modal de categorias: lista com editar/excluir + formulário de criar/editar. Expõe window.CategoriasUI. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function resetarFormulario() {
    $('form-categoria').reset();
    $('categoria-chave').value = '';
    if ($('categoria-cor')) $('categoria-cor').value = '#3b82f6';
    $('categoria-erro').hidden = true;
  }

  async function renderizarLista(chamarApi, aoMudar) {
    const lista = $('lista-categorias');
    if (!lista) return;
    const categorias = await chamarApi('/api/categorias');
    lista.innerHTML = '';

    for (const cat of categorias) {
      const li = document.createElement('li');
      li.className = 'categoria-item';

      const corPill = document.createElement('span');
      corPill.className = 'categoria-cor-pill';
      corPill.style.backgroundColor = cat.cor || '#898781';

      const nome = document.createElement('span');
      nome.className = 'categoria-nome';
      nome.textContent = cat.nome;

      const acoes = document.createElement('div');
      acoes.className = 'categoria-acoes';

      const btnEditar = document.createElement('button');
      btnEditar.type = 'button';
      btnEditar.className = 'btn-icone';
      btnEditar.title = 'Editar categoria';
      btnEditar.textContent = '✎';
      btnEditar.addEventListener('click', () => {
        $('categoria-chave').value = cat.chave;
        $('categoria-nome').value = cat.nome;
        if ($('categoria-cor')) $('categoria-cor').value = cat.cor || '#3b82f6';
        $('categoria-erro').hidden = true;
        $('categoria-nome').focus();
      });

      acoes.appendChild(btnEditar);

      if (cat.chave !== 'outros') {
        const btnExcluir = document.createElement('button');
        btnExcluir.type = 'button';
        btnExcluir.className = 'btn-icone';
        btnExcluir.title = 'Excluir categoria';
        btnExcluir.textContent = '🗑';
        btnExcluir.addEventListener('click', async () => {
          if (!confirm(`Excluir a categoria "${cat.nome}"?`)) return;
          const erro = $('categoria-erro');
          erro.hidden = true;
          try {
            await chamarApi(`/api/categorias/${encodeURIComponent(cat.chave)}`, { method: 'DELETE' });
            await renderizarLista(chamarApi, aoMudar);
            if (typeof aoMudar === 'function') await aoMudar();
          } catch (err) {
            erro.textContent = err.message;
            erro.hidden = false;
          }
        });
        acoes.appendChild(btnExcluir);
      }

      li.append(corPill, nome, acoes);
      lista.appendChild(li);
    }
  }

  function abrirModal() {
    resetarFormulario();
    $('modal-categoria').hidden = false;
    $('categoria-nome').focus();
  }

  function fecharModal() {
    $('modal-categoria').hidden = true;
  }

  function configurarCategorias(chamarApi, aoMudar) {
    const botoesAbrir = document.querySelectorAll('#btn-gerenciar-categorias, .btn-gerenciar-cat');
    botoesAbrir.forEach((btn) => {
      btn.addEventListener('click', async () => {
        abrirModal();
        await renderizarLista(chamarApi, aoMudar);
      });
    });

    const btnCancelar = $('btn-cancelar-categoria');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', fecharModal);
    }

    const form = $('form-categoria');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const erro = $('categoria-erro');
        erro.hidden = true;
        const chave = $('categoria-chave').value;
        const nome = $('categoria-nome').value.trim();
        const cor = $('categoria-cor') ? $('categoria-cor').value : '#3b82f6';

        const corpo = { nome, cor };
        try {
          await chamarApi(chave ? `/api/categorias/${encodeURIComponent(chave)}` : '/api/categorias', {
            method: chave ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo),
          });
          resetarFormulario();
          await renderizarLista(chamarApi, aoMudar);
          if (typeof aoMudar === 'function') await aoMudar();
        } catch (err) {
          erro.textContent = err.message;
          erro.hidden = false;
        }
      });
    }
  }

  window.CategoriasUI = { configurarCategorias, abrirModal, fecharModal };
})();
