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
      const erro = new Error(corpo.erro || `Falha na requisição (${resposta.status}).`);
      erro.status = resposta.status;
      erro.detalhes = corpo.detalhes ?? null;
      throw erro;
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
        { chave: 'educacao', nome: 'Educação', cor: '#0ea5e9' },
        { chave: 'doacao', nome: 'Doação', cor: '#f43f5e' },
        { chave: 'saude', nome: 'Saúde', cor: '#22c55e' },
        { chave: 'assinaturas', nome: 'Assinaturas e Streaming', cor: '#7c3aed' },
        { chave: 'pets', nome: 'Pets', cor: '#d97706' },
        { chave: 'impostos', nome: 'Impostos e Taxas', cor: '#64748b' },
        { chave: 'investimentos', nome: 'Investimentos', cor: '#059669' },
        { chave: 'viagem', nome: 'Viagem', cor: '#06b6d4' },
        { chave: 'presentes', nome: 'Presentes', cor: '#ec4899' },
        { chave: 'salario', nome: 'Salário/Renda', cor: '#16a34a' },
        { chave: 'outros', nome: 'Outros', cor: '#898781' }
      ];
      return;
    }
    try {
      listaCategorias = await chamarApi('/api/categorias');
    } catch {
      try {
        listaCategorias = await chamarApi('/api/cupons/categorias');
      } catch (err) {
        console.error('Erro ao carregar categorias:', err);
        mostrarFeedback('Não foi possível carregar as categorias.', 'erro');
      }
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

  function configurarPerfil(config) {
    const btnPerfil = $('btn-perfil');
    const dropdown = $('perfil-dropdown');
    const emailEl = $('perfil-email');
    const letraEl = $('perfil-letra');
    const btnLimpar = $('btn-limpar-mes');

    function atualizarDadosPerfil() {
      if (MODO_DEMO) {
        emailEl.textContent = 'demo@exemplo.com';
        letraEl.textContent = 'D';
        return;
      }

      if (config.authMode === 'off') {
        emailEl.textContent = 'Modo Local';
        letraEl.textContent = 'L';
        return;
      }

      const sessao = window.Auth.sessaoAtual();
      if (sessao && sessao.email) {
        emailEl.textContent = sessao.email;
        letraEl.textContent = sessao.email.charAt(0).toUpperCase();
      } else {
        emailEl.textContent = 'usuario@exemplo.com';
        letraEl.textContent = 'U';
      }
    }

    atualizarDadosPerfil();

    btnPerfil.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    });

    document.addEventListener('click', (e) => {
      if (!btnPerfil.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.hidden = true;
      }
    });

    btnLimpar.addEventListener('click', async () => {
      dropdown.hidden = true;
      const mes = mesSelecionado();
      const [ano, numMes] = mes.split('-');
      const nomeMeses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const mesFormatado = `${nomeMeses[parseInt(numMes, 10) - 1]} de ${ano}`;

      const confirmou = confirm(
        `ATENÇÃO: Deseja realmente apagar todas as transações, cupons fiscais e arquivos importados de ${mesFormatado}?\n\n` +
        `Esta ação é IRREVERSÍVEL e atualizará o saldo de todas as contas.`
      );

      if (!confirmou) return;

      btnLimpar.disabled = true;
      const textoOriginal = btnLimpar.textContent;
      btnLimpar.textContent = 'Limpando...';

      try {
        if (MODO_DEMO) {
          mostrarFeedback(`[Demo] Dados de ${mesFormatado} limpos com sucesso.`, 'sucesso');
          await atualizarTudo();
          return;
        }

        const r = await chamarApi('/api/transacoes/limpar-mes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mes }),
        });

        mostrarFeedback(
          `${r.mensagem} (${r.transacoesExcluidas} transação(ões) e ${r.cuponsExcluidos} cupom(ns) removidos).`,
          'sucesso'
        );
        await atualizarTudo();
      } catch (erro) {
        mostrarFeedback(`Erro ao limpar mês: ${erro.message}`, 'erro');
      } finally {
        btnLimpar.disabled = false;
        btnLimpar.textContent = textoOriginal;
      }
    });

    return atualizarDadosPerfil;
  }

  async function iniciar() {
    const agora = new Date();
    $('seletor-mes').value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    $('seletor-mes').addEventListener('change', atualizarTudo);
    const dropzoneDeps = { chamarApi, mostrarFeedback, aoConcluir: atualizarTudo };
    window.Dropzone.configurar('dropzone-ofx', 'input-ofx', '/api/extrato/upload-ofx', 'Extrato OFX', 'Lendo o extrato... aguarde', dropzoneDeps);
    window.Dropzone.configurar('dropzone-cupom', 'input-cupom', '/api/cupons/upload', 'Cupom fiscal', 'Lendo com IA... aguarde', dropzoneDeps, {
      obterCamposExtras: async () => {
        const contaId = await window.ContaCupomModal.abrir(chamarApi);
        return contaId ? { conta_id: contaId } : null;
      },
    });
    window.ContasUI.configurarContas(chamarApi, atualizarTudo);
    if (window.CategoriasUI) {
      window.CategoriasUI.configurarCategorias(chamarApi, async () => {
        await carregarCategoriasMenu();
        await atualizarTudo();
      });
    }
    window.TransacaoForm.configurar(chamarApi, atualizarTudo);
    window.ItemCupomForm.configurar(chamarApi, atualizarTudo);
    if (window.ContaCupomModal) {
      window.ContaCupomModal.configurar();
    }
    if (window.CuponsUI) {
      window.CuponsUI.configurar(chamarApi, atualizarTudo, () => listaCategorias);
    }
    if (window.NfceScanner) {
      window.NfceScanner.configurar(chamarApi, atualizarTudo);
    }
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

    let atualizarPerfil;

    window.LoginUI.configurarLogin(() => {
      if (atualizarPerfil) atualizarPerfil();
      return carregarCategoriasMenu()
        .then(() => atualizarTudo())
        .then(() => window.ContasUI.garantirConta(chamarApi));
    });
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
      
      atualizarPerfil = configurarPerfil({ authMode: 'off' });
      
      carregarCategoriasMenu().then(() => atualizarTudo());
      return;
    }

    const config = await window.Auth.carregarConfig();
    atualizarPerfil = configurarPerfil(config);

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
