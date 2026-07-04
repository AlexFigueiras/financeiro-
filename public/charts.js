/* Renderização dos gráficos (Chart.js) do painel. Expõe window.Charts. */
(() => {
  'use strict';

  const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const CORES_CATEGORICAS = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--cat-${i}`));
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  let graficoFluxo = null;
  let graficoCategorias = null;

  /** Barras diárias ganhos vs gastos. `r` é a resposta de /api/dashboard/fluxo-diario. */
  function renderFluxoDiario(canvasEl, r) {
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
      graficoFluxo = new Chart(canvasEl, { type: 'bar', data: dados, options: opcoes });
    }
  }

  /** Rosca de gastos por categoria. `r` é a resposta de /api/dashboard/gastos-por-categoria. */
  function renderCategorias(canvasEl, legendaEl, r) {
    const paleta = CORES_CATEGORICAS();

    // No máximo 7 categorias nomeadas + "outras" agregada (nunca gerar 9ª cor)
    let fatias = r.categorias.slice(0, 7);
    const excedente = r.categorias.slice(7).reduce((acc, c) => acc + c.total, 0);
    if (excedente > 0) fatias = [...fatias, { categoria: 'outras', total: excedente }];
    if (r.gastosNaoDetalhados > 0) {
      fatias = [...fatias, { categoria: 'não detalhado', total: r.gastosNaoDetalhados }];
    }

    legendaEl.innerHTML = '';

    if (fatias.length === 0) {
      if (graficoCategorias) { graficoCategorias.destroy(); graficoCategorias = null; }
      legendaEl.innerHTML = '<li class="legenda-nome">Sem gastos no período.</li>';
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
      graficoCategorias = new Chart(canvasEl, { type: 'doughnut', data: dados, options: opcoes });
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
      legendaEl.appendChild(li);
    }
  }

  window.Charts = { renderFluxoDiario, renderCategorias };
})();
