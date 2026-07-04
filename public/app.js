/* Painel Financeiro — orquestração do dashboard (vanilla JS + Chart.js vendorizado). */
(() => {
  'use strict';

  // Modo demonstração: ativo no GitHub Pages (sem backend) ou via ?demo=1
  const MODO_DEMO =
    location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('demo');

  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
  const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
  const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo'
  });

  let listaCategorias = [];
  const transacoesColapsadas = new Set();

  const $ = (id) => document.getElementById(id);

  // ---- Feedback ao usuário --------------------------------------------------
  let feedbackTimer = null;
  function mostrarFeedback(mensagem, tipo = 'sucesso') {
    const el = $('feedback');
    el.textContent = mensagem;
    el.className = `feedback ${tipo}`;
    el.hidden = false;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { el.hidden = true; }, 8000);
  }

  async function chamarApi(url, opcoes = {}) {
    if (MODO_DEMO && window.demoApi) return window.demoApi(url, opcoes);

    const config = await window.Auth.carregarConfig();
    const cabecalhos = new Headers(opcoes.headers || {});
    if (config.authMode !== 'off') {
      const token = await window.Auth.tokenValido();
      if (!token) {
        window.LoginUI.mostrarTelaLogin();
        throw new Error('Sessão expirada. Entre novamente.');
      }
      cabecalhos.set('Authorization', `Bearer ${token}`);
    }

    const resposta = await fetch(url, { ...opcoes, headers: cabecalhos });
    if (resposta.status === 401) {
      window.LoginUI.mostrarTelaLogin();
      throw new Error('Sessão expirada. Entre novamente.');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(corpo.erro || `Falha na requisição (${resposta.status}).`);
    }
    return corpo;
  }

  async function carregarCategoriasMenu() {
    if (MODO_DEMO) {
      listaCategorias = [
        { chave: 'alimentacao', nome: 'Alimentação', cor: 'var(--cat-2)' },
        { chave: 'bebidas', nome: 'Bebidas', cor: 'var(--cat-1)' },
        { chave: 'limpeza', nome: 'Limpeza', cor: 'var(--cat-3)' },
        { chave: 'higiene', nome: 'Higiene', cor: 'var(--cat-4)' },
        { chave: 'hortifruti', nome: 'Hortifruti', cor: 'var(--cat-5)' },
        { chave: 'padaria', nome: 'Padaria', cor: 'var(--cat-6)' },
        { chave: 'carnes', nome: 'Carnes', cor: 'var(--cat-7)' },
        { chave: 'farmacia', nome: 'Farmácia', cor: 'var(--cat-8)' },
        { chave: 'transporte', nome: 'Transporte', cor: '#eb6834' },
        { chave: 'lazer', nome: 'Lazer', cor: '#4a3aa7' },
        { chave: 'vestuario', nome: 'Vestuário', cor: '#e87ba4' },
        { chave: 'eletronicos', nome: 'Eletrônicos', cor: '#2a78d6' },
        { chave: 'moradia', nome: 'Moradia', cor: '#eda100' },
        { chave: 'combustivel', nome: 'Combustível de Veículo', cor: '#a855f7' },
        { chave: 'outros', nome: 'Outros', cor: '#898781' }
      ];
      return;
    }
    try {
      listaCategorias = await chamarApi('/api/cupons/categorias');
    } catch (e) {
      console.error('Erro ao carregar categorias:', e);
      mostrarFeedback('Não foi possível carregar as categorias.', 'erro');
    }
  }

  function mesSelecionado() {
    return $('seletor-mes').value;
  }

  // ---- KPIs ------------------------------------------------------------------
  async function carregarKpis() {
    const r = await chamarApi(`/api/dashboard/resumo?mes=${mesSelecionado()}`);
    $('kpi-saldo').textContent = fmtBRL.format(r.saldoConsolidado);
    $('kpi-ganhos').textContent = fmtBRL.format(r.totalGanhosMes);
    $('kpi-gastos').textContent = fmtBRL.format(r.totalGastosMes);
    const balanco = $('kpi-balanco');
    balanco.textContent = fmtBRL.format(r.balancoLiquidoMes);
    balanco.classList.toggle('kpi-positivo', r.balancoLiquidoMes >= 0);
    balanco.classList.toggle('kpi-negativo', r.balancoLiquidoMes < 0);
  }

  // ---- Gráficos (renderização vive em charts.js) -----------------------------
  async function carregarFluxoDiario() {
    const r = await chamarApi(`/api/dashboard/fluxo-diario?mes=${mesSelecionado()}`);
    window.Charts.renderFluxoDiario($('grafico-fluxo'), r);
  }

  async function carregarCategorias() {
    const r = await chamarApi(`/api/dashboard/gastos-por-categoria?mes=${mesSelecionado()}`);
    window.Charts.renderCategorias($('grafico-categorias'), $('legenda-categorias'), r);
  }

  // ---- Tabela de transações ----------------------------------------------------
  function linhaItensCupom(transacao) {
    const tr = document.createElement('tr');
    tr.className = 'linha-itens';
    tr.hidden = transacoesColapsadas.has(transacao.id);
    const td = document.createElement('td');
    td.colSpan = 5;

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
      '<thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Subtotal</th><th>Categoria</th></tr></thead>';
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
          categorias: listaCategorias,
          categoriaAtual: item.categoria,
          aoSalvar: async (novaCategoria) => {
            const res = await chamarApi(`/api/cupons/itens/${item.id}/categoria`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categoria: novaCategoria }),
            });
            mostrarFeedback(res.mensagem, 'sucesso');
            await atualizarTudo();
          },
        })
      );
      linha.appendChild(cCat);
      corpo.appendChild(linha);
    }
    tabela.appendChild(corpo);
    wrap.append(titulo, tabela);
    td.appendChild(wrap);
    tr.appendChild(td);
    return tr;
  }

  async function carregarTransacoes() {
    const corpo = $('corpo-transacoes');
    const r = await chamarApi(`/api/transacoes?mes=${mesSelecionado()}&limite=200`);
    corpo.innerHTML = '';
    $('contagem-transacoes').textContent = `${r.total} registro(s)`;

    if (r.transacoes.length === 0) {
      corpo.innerHTML = '<tr><td colspan="5" class="celula-vazia">Nenhuma transação no período. Envie um extrato OFX da Caixa.</td></tr>';
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
            categorias: listaCategorias,
            categoriaAtual: t.categoria,
            aoSalvar: async (novaCategoria) => {
              const res = await chamarApi(`/api/transacoes/${t.id}/categoria`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoria: novaCategoria }),
              });
              mostrarFeedback(res.mensagem, 'sucesso');
              await atualizarTudo();
            },
          })
        );
      } else {
        tdStatus.innerHTML = '<span class="painel-sub">—</span>';
      }
      const tdValor = document.createElement('td');
      tdValor.className = `col-valor ${valor >= 0 ? 'valor-entrada' : 'valor-saida'}`;
      tdValor.textContent = fmtBRL.format(valor);

      tr.append(tdData, tdConta, tdDesc, tdStatus, tdValor);
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

  // ---- Uploads (dropzones) --------------------------------------------------------
  function configurarDropzone(idZona, idInput, url, nomeAmigavel) {
    const zona = $(idZona);
    const input = $(idInput);

    const enviar = async (arquivo) => {
      if (!arquivo) return;
      zona.classList.add('enviando');
      try {
        const form = new FormData();
        form.append('arquivo', arquivo);
        const r = await chamarApi(url, { method: 'POST', body: form });
        mostrarFeedback(`${nomeAmigavel}: ${r.mensagem} ${resumoUpload(r)}`, 'sucesso');
        await atualizarTudo();
      } catch (erro) {
        mostrarFeedback(`${nomeAmigavel}: ${erro.message}`, 'erro');
      } finally {
        zona.classList.remove('enviando');
        input.value = '';
      }
    };

    zona.addEventListener('click', () => input.click());
    zona.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => enviar(input.files[0]));
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      zona.classList.remove('arrastando');
      enviar(e.dataTransfer.files[0]);
    });
  }

  function resumoUpload(r) {
    const partes = [];
    if (typeof r.importadas === 'number') partes.push(`${r.importadas} importada(s)`);
    if (typeof r.ignoradasDuplicadas === 'number' && r.ignoradasDuplicadas > 0) {
      partes.push(`${r.ignoradasDuplicadas} duplicada(s) ignorada(s)`);
    }
    if (typeof r.itens === 'number') partes.push(`${r.itens} item(ns) extraído(s)`);
    if (typeof r.reconciliacoesEfetuadas === 'number' && r.reconciliacoesEfetuadas > 0) {
      partes.push(`${r.reconciliacoesEfetuadas} reconciliação(ões)`);
    }
    return partes.length > 0 ? `(${partes.join(', ')})` : '';
  }

  // ---- Orquestração --------------------------------------------------------------------
  async function atualizarTudo() {
    const tarefas = [carregarKpis(), carregarFluxoDiario(), carregarCategorias(), carregarTransacoes()];
    const resultados = await Promise.allSettled(tarefas);
    const falhas = resultados.filter((r) => r.status === 'rejected');
    if (falhas.length > 0) {
      mostrarFeedback(`Falha ao carregar parte do painel: ${falhas[0].reason.message}`, 'erro');
    }
  }

  async function iniciar() {
    const agora = new Date();
    $('seletor-mes').value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    $('seletor-mes').addEventListener('change', atualizarTudo);
    configurarDropzone('dropzone-ofx', 'input-ofx', '/api/extrato/upload-ofx', 'Extrato OFX');
    configurarDropzone('dropzone-cupom', 'input-cupom', '/api/cupons/upload', 'Cupom fiscal');
    window.LoginUI.configurarLogin(() => carregarCategoriasMenu().then(() => atualizarTudo()));
    // Redesenha os gráficos quando o SO alterna claro/escuro (tokens mudam)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', atualizarTudo);

    if (MODO_DEMO) {
      window.LoginUI.mostrarApp();
      const aviso = $('feedback');
      aviso.textContent =
        'Modo demonstração (GitHub Pages): dados fictícios. Uploads e reconciliação ' +
        'exigem o backend rodando — instruções no README do repositório.';
      aviso.className = 'feedback';
      aviso.hidden = false;
      clearTimeout(feedbackTimer); // banner permanente no demo
      carregarCategoriasMenu().then(() => atualizarTudo());
      return;
    }

    const config = await window.Auth.carregarConfig();
    if (config.authMode === 'off' || (await window.Auth.tokenValido())) {
      window.LoginUI.mostrarApp();
      $('btn-sair').hidden = config.authMode === 'off';
      carregarCategoriasMenu().then(() => atualizarTudo());
    } else {
      window.LoginUI.mostrarTelaLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
