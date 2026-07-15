/** Modal de criar/editar lançamento (transação). Expõe window.TransacaoForm. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  async function preencherContas(chamarApi, contaIdAtual) {
    const select = $('transacao-conta');
    select.innerHTML = '';
    const contas = await chamarApi('/api/contas');
    for (const c of contas) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      opt.selected = String(c.id) === String(contaIdAtual ?? '');
      select.appendChild(opt);
    }
  }

  function preencherCategorias(categorias, categoriaAtual) {
    const select = $('transacao-categoria');
    select.innerHTML = '';
    for (const cat of categorias) {
      const opt = document.createElement('option');
      opt.value = cat.chave;
      opt.textContent = cat.nome;
      opt.selected = cat.chave === categoriaAtual;
      select.appendChild(opt);
    }
  }

  async function preencherCupons(chamarApi, cupomIdAtual) {
    const select = $('transacao-cupom');
    select.innerHTML = '<option value="">Nenhum cupom</option>';
    const cupons = await chamarApi('/api/cupons');

    if (cupomIdAtual) {
      try {
        const cupomAtual = await chamarApi(`/api/cupons/${cupomIdAtual}`);
        const opt = document.createElement('option');
        opt.value = cupomAtual.id;
        const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        opt.textContent = `${cupomAtual.estabelecimento} (${fmtBRL.format(cupomAtual.valorTotal)}) — ${new Date(cupomAtual.dataEmissao).toLocaleDateString('pt-BR')}`;
        opt.selected = true;
        select.appendChild(opt);
      } catch (e) {
        console.error('Falha ao carregar cupom atual:', e);
      }
    }

    for (const c of cupons) {
      if (String(c.id) === String(cupomIdAtual ?? '')) continue;
      const opt = document.createElement('option');
      opt.value = c.id;
      const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
      opt.textContent = `${c.estabelecimento} (${fmtBRL.format(c.valorTotal)}) — ${new Date(c.dataEmissao).toLocaleDateString('pt-BR')}`;
      select.appendChild(opt);
    }
  }

  function fecharModal() {
    $('modal-transacao').hidden = true;
  }

  async function abrirCriacao(chamarApi, categorias) {
    $('modal-transacao-titulo').textContent = 'Novo lançamento';
    $('transacao-id').value = '';
    $('transacao-data').value = new Date().toISOString().slice(0, 10);
    $('transacao-descricao').value = '';
    $('transacao-valor').value = '';
    $('transacao-erro').hidden = true;
    await preencherContas(chamarApi, undefined);
    preencherCategorias(categorias, 'outros');
    await preencherCupons(chamarApi, undefined);
    $('modal-transacao').hidden = false;
    $('transacao-descricao').focus();
  }

  async function abrirEdicao(chamarApi, transacao, categorias) {
    $('modal-transacao-titulo').textContent = 'Editar lançamento';
    $('transacao-id').value = transacao.id;
    $('transacao-data').value = new Date(transacao.data_transacao).toISOString().slice(0, 10);
    $('transacao-descricao').value = transacao.descricao_bruta;
    $('transacao-valor').value = transacao.valor;
    $('transacao-erro').hidden = true;
    await preencherContas(chamarApi, transacao.conta_id);
    preencherCategorias(categorias, transacao.categoria);
    await preencherCupons(chamarApi, transacao.cupom_id);
    $('modal-transacao').hidden = false;
    $('transacao-descricao').focus();
  }

  function configurar(chamarApi, aoSalvar) {
    $('btn-cancelar-transacao').addEventListener('click', fecharModal);

    $('form-transacao').addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = $('transacao-erro');
      erro.hidden = true;
      const id = $('transacao-id').value;
      const cupomVal = $('transacao-cupom').value;
      const corpo = {
        conta_id: $('transacao-conta').value,
        data_transacao: $('transacao-data').value,
        descricao_bruta: $('transacao-descricao').value.trim(),
        valor: $('transacao-valor').value,
        categoria: $('transacao-categoria').value,
        cupom_id: cupomVal ? parseInt(cupomVal, 10) : null,
        status_reconciliado: !!cupomVal,
      };
      try {
        await chamarApi(id ? `/api/transacoes/${id}` : '/api/transacoes', {
          method: id ? 'PATCH' : 'POST',
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

  window.TransacaoForm = { configurar, abrirCriacao, abrirEdicao };
})();
