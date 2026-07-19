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
  function configurarDropzone(idZona, idInput, url, nomeAmigavel, textoProcessando) {
    const zona = $(idZona);
    const input = $(idInput);
    const permiteMultiplo = input.multiple;
    const legenda = zona.querySelector('span');
    const legendaOriginal = legenda.textContent;

    const montarFormulario = (arquivos, forcar) => {
      const form = new FormData();
      if (permiteMultiplo) {
        for (let i = 0; i < arquivos.length; i++) {
          form.append('arquivo', arquivos[i]);
        }
      } else {
        form.append('arquivo', arquivos[0]);
      }
      if (forcar) form.append('forcar', 'true');
      return form;
    };

    const enviar = async (arquivos, forcar = false) => {
      if (!arquivos || arquivos.length === 0) return;
      zona.classList.add('enviando');
      if (textoProcessando) legenda.textContent = textoProcessando;
      try {
        // O spinner (classe .enviando) só some no finally, depois do await abaixo —
        // ou seja, continua girando até os valores atualizados aparecerem na tela.
        const r = await chamarApi(url, { method: 'POST', body: montarFormulario(arquivos, forcar) });
        mostrarFeedback(`${nomeAmigavel}: ${r.mensagem} ${resumoUpload(r)}`, 'sucesso');
        await atualizarTudo();
      } catch (erro) {
        // Reenvio do mesmo arquivo detectado pelo backend (409 + detalhes.duplicado):
        // pergunta em vez de simplesmente falhar em silêncio.
        if (erro.status === 409 && erro.detalhes && erro.detalhes.duplicado) {
          zona.classList.remove('enviando');
          legenda.textContent = legendaOriginal;
          const processarMesmoAssim = confirm(
            `${erro.message}\n\nDeseja processar mesmo assim?`
          );
          if (processarMesmoAssim) {
            await enviar(arquivos, true);
            return;
          }
          mostrarFeedback(`${nomeAmigavel}: envio cancelado (arquivo já importado).`, '');
        } else {
          mostrarFeedback(`${nomeAmigavel}: ${erro.message}`, 'erro');
        }
      } finally {
        zona.classList.remove('enviando');
        legenda.textContent = legendaOriginal;
        input.value = '';
      }
    };

    zona.addEventListener('click', () => input.click());
    zona.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => enviar(input.files));
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      zona.classList.remove('arrastando');
      enviar(e.dataTransfer.files);
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
    configurarDropzone('dropzone-ofx', 'input-ofx', '/api/extrato/upload-ofx', 'Extrato OFX', 'Lendo o extrato... aguarde');
    configurarDropzone('dropzone-cupom', 'input-cupom', '/api/cupons/upload', 'Cupom fiscal', 'Lendo com IA... aguarde');
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
