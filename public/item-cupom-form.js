/** Modal de editar item de cupom fiscal (nome, quantidade, preço unitário). Expõe window.ItemCupomForm. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function fecharModal() {
    $('modal-item-cupom').hidden = true;
  }

  function abrirEdicao(item) {
    $('item-cupom-id').value = item.id;
    $('item-cupom-nome').value = item.nome_produto;
    $('item-cupom-quantidade').value = item.quantidade;
    $('item-cupom-preco').value = item.preco_unitario;
    $('item-cupom-erro').hidden = true;
    $('modal-item-cupom').hidden = false;
    $('item-cupom-nome').focus();
  }

  function configurar(chamarApi, aoSalvar) {
    $('btn-cancelar-item-cupom').addEventListener('click', fecharModal);

    $('form-item-cupom').addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = $('item-cupom-erro');
      erro.hidden = true;
      const id = $('item-cupom-id').value;
      const corpo = {
        nome_produto: $('item-cupom-nome').value.trim(),
        quantidade: $('item-cupom-quantidade').value,
        preco_unitario: $('item-cupom-preco').value,
      };
      try {
        await chamarApi(`/api/cupons/itens/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        });
        fecharModal();
        await aoSalvar();
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
      }
    });
  }

  window.ItemCupomForm = { configurar, abrirEdicao };
})();
