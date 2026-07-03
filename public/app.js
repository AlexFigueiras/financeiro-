/* Painel Financeiro — lógica do dashboard (vanilla JS + Chart.js vendorizado). */
(() => {
  'use strict';

  // ---- Tokens de cor (lidos do CSS para acompanhar light/dark) -------------
  const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const CORES_CATEGORICAS = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--cat-${i}`));

  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

  let graficoFluxo = null;
  let graficoCategorias = null;

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

  async function chamarApi(url, opcoes) {
    const resposta = await fetch(url, opcoes);
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(corpo.erro || `Falha na requisição (${resposta.status}).`);
    }
    return corpo;
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

  // ---- Gráfico 1: barras diárias ganhos vs gastos ----------------------------
  async function carregarFluxoDiario() {
    const r = await chamarApi(`/api/dashboard/fluxo-diario?mes=${mesSelecionado()}`);
    // d.dia chega como 'YYYY-MM-DD'; extrai o dia sem construir Date (evita fuso)
    const rotulos = r.dias.map((d) => String(Number(d.dia.slice(8, 10))));
    const ganhos = r.dias.map((d) => d.ganhos);
    const gastos = r.dias.map((d) => d.gastos);

    const dados = {
      labels: rotulos,
      datasets: [
        {
          label: 'Ganhos',
          data: ganhos,
          backgroundColor: css('--ganhos'),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
          categoryPercentage: 0.72,
          barPercentage: 0.9,
        },
        {
          label: 'Gastos',
          data: gastos,
          backgroundColor: css('--gastos'),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
          categoryPercentage: 0.72,
          barPercentage: 0.9,
        },
      ],
    };

    const opcoes = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { color: css('--ink-secundario'), boxWidth: 10, boxHeight: 10, borderRadius: 3, usePointStyle: false },
        },
        tooltip: {
          callbacks: {
            title: (itens) => `Dia ${itens[0].label}`,
            label: (item) => ` ${item.dataset.label}: ${fmtBRL.format(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: css('--ink-mudo'), maxRotation: 0, autoSkip: true },
          border: { color: css('--grade') },
        },
        y: {
          beginAtZero: true,
          grid: { color: css('--grade'), drawTicks: false },
          ticks: { color: css('--ink-mudo'), callback: (v) => fmtBRL.format(v).replace(/,00$/, '') },
          border: { display: false },
        },
      },
    };

    if (graficoFluxo) {
      graficoFluxo.data = dados;
      graficoFluxo.options = opcoes;
      graficoFluxo.update();
    } else {
      graficoFluxo = new Chart($('grafico-fluxo'), { type: 'bar', data: dados, options: opcoes });
    }
  }

  // ---- Gráfico 2: rosca de gastos por categoria -------------------------------
  async function carregarCategorias() {
    const r = await chamarApi(`/api/dashboard/gastos-por-categoria?mes=${mesSelecionado()}`);
    const paleta = CORES_CATEGORICAS();

    // No máximo 7 categorias nomeadas + "outras" agregada (nunca gerar 9ª cor)
    let fatias = r.categorias.slice(0, 7);
    const excedente = r.categorias.slice(7).reduce((acc, c) => acc + c.total, 0);
    if (excedente > 0) fatias = [...fatias, { categoria: 'outras', total: excedente }];
    if (r.gastosNaoDetalhados > 0) {
      fatias = [...fatias, { categoria: 'não detalhado', total: r.gastosNaoDetalhados }];
    }

    const legenda = $('legenda-categorias');
    legenda.innerHTML = '';

    if (fatias.length === 0) {
      if (graficoCategorias) { graficoCategorias.destroy(); graficoCategorias = null; }
      legenda.innerHTML = '<li class="legenda-nome">Sem gastos no período.</li>';
      return;
    }

    const corDe = (indice, nome) =>
      nome === 'não detalhado' ? css('--ink-mudo') : paleta[indice % paleta.length];

    const dados = {
      labels: fatias.map((f) => f.categoria),
      datasets: [
        {
          data: fatias.map((f) => f.total),
          backgroundColor: fatias.map((f, i) => corDe(i, f.categoria)),
          borderColor: css('--superficie'), // gap de 2px entre fatias, na cor da superfície
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };

    const opcoes = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false }, // legenda customizada em HTML com valores (rótulos diretos)
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${fmtBRL.format(item.parsed)}`,
          },
        },
      },
    };

    if (graficoCategorias) {
      graficoCategorias.data = dados;
      graficoCategorias.options = opcoes;
      graficoCategorias.update();
    } else {
      graficoCategorias = new Chart($('grafico-categorias'), { type: 'doughnut', data: dados, options: opcoes });
    }

    for (const [i, fatia] of fatias.entries()) {
      const li = document.createElement('li');
      const cor = document.createElement('span');
      cor.className = 'legenda-cor';
      cor.style.background = corDe(i, fatia.categoria);
      const nome = document.createElement('span');
      nome.className = 'legenda-nome';
      nome.textContent = fatia.categoria;
      const valor = document.createElement('span');
      valor.className = 'legenda-valor';
      valor.textContent = fmtBRL.format(fatia.total);
      li.append(cor, nome, valor);
      legenda.appendChild(li);
    }
  }

  // ---- Tabela de transações ----------------------------------------------------
  function linhaItensCupom(transacao) {
    const tr = document.createElement('tr');
    tr.className = 'linha-itens';
    tr.hidden = true;
    const td = document.createElement('td');
    td.colSpan = 5;

    const wrap = document.createElement('div');
    wrap.className = 'itens-wrap';
    const titulo = document.createElement('div');
    titulo.className = 'itens-titulo';
    titulo.textContent = `Cupom fiscal — ${transacao.estabelecimento ?? ''} · emissão ${
      transacao.cupom_data_emissao ? new Date(transacao.cupom_data_emissao).toLocaleString('pt-BR') : '—'
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
      const chip = document.createElement('span');
      chip.className = 'chip-categoria';
      chip.textContent = item.categoria;
      cCat.appendChild(chip);
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
      corpo.innerHTML = '<tr><td colspan="5" class="celula-vazia">Nenhuma transação no período. Envie um OFX ou sincronize o Mercado Pago.</td></tr>';
      return;
    }

    for (const t of r.transacoes) {
      const tr = document.createElement('tr');
      const temCupom = t.cupom_id !== null;
      tr.className = `linha-transacao${temCupom ? ' expansivel' : ''}`;

      const valor = Number(t.valor);
      const tdData = document.createElement('td');
      tdData.textContent = new Date(t.data_transacao).toLocaleDateString('pt-BR');
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
          linhaItens.hidden = !linhaItens.hidden;
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

  // ---- Sincronização Mercado Pago ---------------------------------------------------
  async function sincronizarMp() {
    const btn = $('btn-sync-mp');
    btn.disabled = true;
    try {
      const r = await chamarApi('/api/transacoes/sync-mercadopago', { method: 'POST' });
      mostrarFeedback(`Mercado Pago: ${r.mensagem} ${resumoUpload(r)}`, 'sucesso');
      await atualizarTudo();
    } catch (erro) {
      mostrarFeedback(`Mercado Pago: ${erro.message}`, 'erro');
    } finally {
      btn.disabled = false;
    }
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

  function iniciar() {
    const agora = new Date();
    $('seletor-mes').value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    $('seletor-mes').addEventListener('change', atualizarTudo);
    $('btn-sync-mp').addEventListener('click', sincronizarMp);
    configurarDropzone('dropzone-ofx', 'input-ofx', '/api/extrato/upload-ofx', 'Extrato OFX');
    configurarDropzone('dropzone-cupom', 'input-cupom', '/api/cupons/upload', 'Cupom fiscal');
    // Redesenha os gráficos quando o SO alterna claro/escuro (tokens mudam)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', atualizarTudo);
    atualizarTudo();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
