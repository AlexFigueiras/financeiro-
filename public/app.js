/* Painel Financeiro — orquestração do dashboard (vanilla JS + Chart.js vendorizado). */
(() => {
  'use strict';

  // Modo demonstração: ativo no GitHub Pages (sem backend) ou via ?demo=1
  const MODO_DEMO =
    location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('demo');

  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  let listaCategorias = [];

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
    const tarefas = [
      carregarKpis(),
      carregarFluxoDiario(),
      carregarCategorias(),
      window.TransacoesTabela.renderizar(mesSelecionado()),
    ];
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
    window.ContasUI.configurarContas(chamarApi, atualizarTudo);
    window.TransacaoForm.configurar(chamarApi, atualizarTudo);
    window.ItemCupomForm.configurar(chamarApi, atualizarTudo);
    window.TransacoesTabela.configurar({
      chamarApi,
      mostrarFeedback,
      atualizarTudo,
      getCategorias: () => listaCategorias,
    });
    $('btn-novo-lancamento').addEventListener('click', () => window.TransacaoForm.abrirCriacao(chamarApi, listaCategorias));
    $('btn-recategorizar').addEventListener('click', async () => {
      const btn = $('btn-recategorizar');
      btn.disabled = true;
      const textoOriginal = btn.textContent;
      btn.textContent = 'Categorizando...';
      try {
        const r = await chamarApi('/api/transacoes/recategorizar-tudo', { method: 'POST' });
        mostrarFeedback(r.mensagem, 'sucesso');
        await atualizarTudo();
      } catch (erro) {
        mostrarFeedback(`Erro ao categorizar: ${erro.message}`, 'erro');
      } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    });
    window.LoginUI.configurarLogin(() =>
      carregarCategoriasMenu()
        .then(() => atualizarTudo())
        .then(() => window.ContasUI.garantirConta(chamarApi))
    );
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
      carregarCategoriasMenu()
        .then(() => atualizarTudo())
        .then(() => window.ContasUI.garantirConta(chamarApi));
    } else {
      window.LoginUI.mostrarTelaLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
