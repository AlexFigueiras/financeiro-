/* Tabela de transações: linhas, itens de cupom expansíveis e ações (editar/excluir). Expõe window.TransacoesTabela. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
  const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
  const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  });

  const transacoesColapsadas = new Set();
  /** Injetado por app.js via configurar(): { chamarApi, mostrarFeedback, atualizarTudo, getCategorias }. */
  let deps = null;

  function configurar(novasDeps) {
    deps = novasDeps;
  }

  function celulaAcoesItemCupom(item) {
    const td = document.createElement('td');
    td.className = 'col-acoes';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn-icone';
    btnEditar.title = 'Editar item';
    btnEditar.textContent = '✎';
    btnEditar.addEventListener('click', (e) => {
      e.stopPropagation();
      window.ItemCupomForm.abrirEdicao(item);
    });

    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button';
    btnExcluir.className = 'btn-icone';
    btnExcluir.title = 'Excluir item';
    btnExcluir.textContent = '🗑';
    btnExcluir.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Excluir o item "${item.nome_produto}"?`)) return;
      try {
        const res = await deps.chamarApi(`/api/cupons/itens/${item.id}`, { method: 'DELETE' });
        deps.mostrarFeedback(res.mensagem, 'sucesso');
        await deps.atualizarTudo();
      } catch (erro) {
        deps.mostrarFeedback(erro.message, 'erro');
      }
    });

    td.append(btnEditar, btnExcluir);
    return td;
  }

  function celulaAcoesTransacao(transacao) {
    const td = document.createElement('td');
    td.className = 'col-acoes';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn-icone';
    btnEditar.title = 'Editar lançamento';
    btnEditar.textContent = '✎';
    btnEditar.addEventListener('click', (e) => {
      e.stopPropagation();
      window.TransacaoForm.abrirEdicao(deps.chamarApi, transacao, deps.getCategorias());
    });

    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button';
    btnExcluir.className = 'btn-icone';
    btnExcluir.title = 'Excluir lançamento';
    btnExcluir.textContent = '🗑';
    btnExcluir.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Excluir este lançamento?')) return;
      try {
        const res = await deps.chamarApi(`/api/transacoes/${transacao.id}`, { method: 'DELETE' });
        deps.mostrarFeedback(res.mensagem, 'sucesso');
        await deps.atualizarTudo();
      } catch (erro) {
        deps.mostrarFeedback(erro.message, 'erro');
      }
    });

    td.append(btnEditar, btnExcluir);
    return td;
  }

  function linhaItensCupom(transacao) {
    const tr = document.createElement('tr');
    tr.className = 'linha-itens';
    tr.hidden = transacoesColapsadas.has(transacao.id);
    const td = document.createElement('td');
    td.colSpan = 6;

    const wrap = document.createElement('div');
    wrap.className = 'itens-wrap';
    const titulo = document.createElement('div');
    titulo.className = 'itens-titulo';
    titulo.textContent = `Cupom fiscal — ${transacao.estabelecimento ?? ''} · emissão ${
      transacao.cupom_data_emissao ? fmtDataHora.format(new Date(transacao.cupom_data_emissao)) : '—'
    }`;

    const tabela = document.createElement('table');
    tabela.className = 'tabela-itens';
    tabela.innerHTML =
      '<thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Subtotal</th><th>Categoria</th><th>Ações</th></tr></thead>';
    const corpo = document.createElement('tbody');
    for (const item of transacao.itens_cupom ?? []) {
      const linha = document.createElement('tr');
      const celulas = [
        item.nome_produto,
        fmtQtd.format(Number(item.quantidade)),
        fmtBRL.format(Number(item.preco_unitario)),
        fmtBRL.format(Number(item.valor_total)),
      ];
      for (const texto of celulas) {
        const c = document.createElement('td');
        c.textContent = texto;
        linha.appendChild(c);
      }
      const cCat = document.createElement('td');
      cCat.appendChild(
        window.criarSelectCategoria({
          categorias: deps.getCategorias(),
          categoriaAtual: item.categoria,
          aoSalvar: async (novaCategoria) => {
            const res = await deps.chamarApi(`/api/cupons/itens/${item.id}/categoria`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categoria: novaCategoria }),
            });
            deps.mostrarFeedback(res.mensagem, 'sucesso');
            await deps.atualizarTudo();
          },
        })
      );
      linha.appendChild(cCat);
      linha.appendChild(celulaAcoesItemCupom(item));
      corpo.appendChild(linha);
    }
    tabela.appendChild(corpo);
    wrap.append(titulo, tabela);
    td.appendChild(wrap);
    tr.appendChild(td);
    return tr;
  }

  async function renderizar(mes) {
    const corpo = $('corpo-transacoes');
    const r = await deps.chamarApi(`/api/transacoes?mes=${mes}&limite=200`);
    corpo.innerHTML = '';
    $('contagem-transacoes').textContent = `${r.total} registro(s)`;

    if (r.transacoes.length === 0) {
      corpo.innerHTML =
        '<tr><td colspan="6" class="celula-vazia">Nenhuma transação no período. Envie um extrato OFX da Caixa.</td></tr>';
      return;
    }

    for (const t of r.transacoes) {
      const tr = document.createElement('tr');
      const temCupom = t.cupom_id !== null;
      tr.className = `linha-transacao${temCupom ? ' expansivel' : ''}`;

      const valor = Number(t.valor);
      const tdData = document.createElement('td');
      tdData.textContent = fmtData.format(new Date(t.data_transacao));
      const tdConta = document.createElement('td');
      const badgeConta = document.createElement('span');
      badgeConta.className = 'badge badge-origem';
      badgeConta.textContent = t.conta_nome;
      tdConta.appendChild(badgeConta);
      const tdDesc = document.createElement('td');
      tdDesc.textContent = t.descricao_bruta;
      const tdStatus = document.createElement('td');
      if (temCupom) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-detalhado';
        badge.textContent = '🧾 Detalhado ▾';
        badge.title = 'Transação reconciliada com cupom fiscal — clique para ver os itens';
        tdStatus.appendChild(badge);
      } else if (valor < 0) {
        // Dropdown de categoria para despesas não reconciliadas
        tdStatus.appendChild(
          window.criarSelectCategoria({
            categorias: deps.getCategorias(),
            categoriaAtual: t.categoria,
            aoSalvar: async (novaCategoria) => {
              const res = await deps.chamarApi(`/api/transacoes/${t.id}/categoria`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoria: novaCategoria }),
              });
              deps.mostrarFeedback(res.mensagem, 'sucesso');
              await deps.atualizarTudo();
            },
          })
        );
      } else {
        tdStatus.innerHTML = '<span class="painel-sub">—</span>';
      }
      const tdValor = document.createElement('td');
      tdValor.className = `col-valor ${valor >= 0 ? 'valor-entrada' : 'valor-saida'}`;
      tdValor.textContent = fmtBRL.format(valor);

      tr.append(tdData, tdConta, tdDesc, tdStatus, tdValor, celulaAcoesTransacao(t));
      corpo.appendChild(tr);

      if (temCupom) {
        const linhaItens = linhaItensCupom(t);
        corpo.appendChild(linhaItens);

        tr.addEventListener('click', () => {
          const oculto = !linhaItens.hidden;
          linhaItens.hidden = oculto;
          if (oculto) {
            transacoesColapsadas.add(t.id);
          } else {
            transacoesColapsadas.delete(t.id);
          }
        });
      }
    }
  }

  window.TransacoesTabela = { configurar, renderizar };
})();
