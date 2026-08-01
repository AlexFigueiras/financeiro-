/**
 * Modal compartilhado "De qual conta é este cupom?" — usado pelos 3 pontos de
 * entrada de cupom (criação manual, upload de foto/PDF, escaneamento do QR Code
 * da NFC-e) antes de enviar ao backend, já que nenhum deles pede conta hoje e o
 * lançamento auto-gerado para um cupom sem transação correspondente precisa de
 * uma. Expõe window.ContaCupomModal.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let resolver = null;

  function fecharComResultado(contaId) {
    $('modal-conta-cupom').hidden = true;
    if (resolver) {
      const resolve = resolver;
      resolver = null;
      resolve(contaId);
    }
  }

  /**
   * Abre o modal, popula o <select> com as contas do tenant (pré-selecionando
   * a conta padrão — mesmo critério de "primeira conta" que o backend já usa
   * como fallback) e resolve com o conta_id escolhido, ou null se cancelado.
   */
  async function abrir(chamarApi) {
    const select = $('conta-cupom-select');
    const erro = $('conta-cupom-erro');
    erro.hidden = true;
    select.innerHTML = '';

    let contas = [];
    try {
      contas = await chamarApi('/api/contas');
    } catch (err) {
      erro.textContent = err.message;
      erro.hidden = false;
    }

    if (contas.length === 0) {
      erro.textContent = 'Nenhuma conta bancária cadastrada. Crie uma conta antes de enviar um cupom.';
      erro.hidden = false;
    }
    for (const conta of contas) {
      const opt = document.createElement('option');
      opt.value = conta.id;
      opt.textContent = conta.nome;
      select.appendChild(opt);
    }

    $('modal-conta-cupom').hidden = false;
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function configurar() {
    $('btn-confirmar-conta-cupom').addEventListener('click', () => {
      const select = $('conta-cupom-select');
      if (!select.value) return;
      fecharComResultado(select.value);
    });
    $('btn-cancelar-conta-cupom').addEventListener('click', () => fecharComResultado(null));
  }

  window.ContaCupomModal = { configurar, abrir };
})();
