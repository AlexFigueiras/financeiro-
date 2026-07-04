/* Modo demonstração (GitHub Pages): responde as rotas da API com dados
   fictícios do mês corrente, sem backend. Carregado antes de app.js;
   só é usado quando window.MODO_DEMO é verdadeiro. */
(() => {
  'use strict';

  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const dia = (d) => `${mesAtual}-${String(d).padStart(2, '0')}`;
  const ts = (d, hora) => `${dia(Math.min(d, diasNoMes))}T${hora}:00-03:00`;

  const ITENS_SUPERMERCADO = [
    { id: 101, nome_produto: 'ARROZ TIPO1 5KG', quantidade: 1, preco_unitario: 27.9, valor_total: 27.9, categoria: 'alimentacao' },
    { id: 102, nome_produto: 'CERVEJA LATA 350ML x12', quantidade: 1, preco_unitario: 54.9, valor_total: 54.9, categoria: 'bebidas' },
    { id: 103, nome_produto: 'PICANHA BOVINA KG', quantidade: 1.42, preco_unitario: 79.9, valor_total: 113.46, categoria: 'carnes' },
    { id: 104, nome_produto: 'DETERGENTE 500ML', quantidade: 3, preco_unitario: 2.99, valor_total: 8.97, categoria: 'limpeza' },
    { id: 105, nome_produto: 'TOMATE KG', quantidade: 1.8, preco_unitario: 8.9, valor_total: 16.02, categoria: 'hortifruti' },
    { id: 106, nome_produto: 'PAO FRANCES KG', quantidade: 0.62, preco_unitario: 18.9, valor_total: 11.72, categoria: 'padaria' },
    { id: 107, nome_produto: 'SHAMPOO 350ML', quantidade: 1, preco_unitario: 18.48, valor_total: 18.48, categoria: 'higiene' },
    { id: 108, nome_produto: 'PILHA AA C/4', quantidade: 1, preco_unitario: 36.0, valor_total: 36.0, categoria: 'outros' },
  ];
  const ITENS_FARMACIA = [
    { id: 201, nome_produto: 'DIPIRONA 500MG 20CP', quantidade: 2, preco_unitario: 12.5, valor_total: 25.0, categoria: 'farmacia' },
    { id: 202, nome_produto: 'VITAMINA C 1G 10CP', quantidade: 1, preco_unitario: 31.2, valor_total: 31.2, categoria: 'farmacia' },
    { id: 203, nome_produto: 'PROTETOR SOLAR FPS50', quantidade: 1, preco_unitario: 30.0, valor_total: 30.0, categoria: 'higiene' },
  ];

  const TRANSACOES = [
    { id: 1, dia: 1, hora: '09:00', conta_nome: 'Caixa Econômica', descricao_bruta: 'CRED SALARIO EMPRESA XYZ', valor: 4800.0, origem: 'ofx' },
    { id: 2, dia: 1, hora: '14:22', conta_nome: 'Caixa Econômica', descricao_bruta: 'PIX RECEBIDO CLIENTE ABC', valor: 650.0, origem: 'ofx' },
    { id: 3, dia: 1, hora: '19:41', conta_nome: 'Caixa Econômica', descricao_bruta: 'COMPRA SUPERMERCADO GBARBOSA', valor: -287.45, origem: 'ofx',
      cupom_id: 1, estabelecimento: 'GBARBOSA SUPERMERCADO', itens: ITENS_SUPERMERCADO },
    { id: 4, dia: 2, hora: '08:15', conta_nome: 'Caixa Econômica', descricao_bruta: 'PAGAMENTO UBER TRIP', valor: -24.9, origem: 'ofx', categoria: 'transporte' },
    { id: 5, dia: 2, hora: '12:30', conta_nome: 'Caixa Econômica', descricao_bruta: 'DEB AUT ENERGIA COELBA', valor: -198.32, origem: 'ofx', categoria: 'moradia' },
    { id: 6, dia: 2, hora: '20:05', conta_nome: 'Caixa Econômica', descricao_bruta: 'COMPRA FARMACIA PAGUE MENOS', valor: -86.2, origem: 'ofx',
      cupom_id: 2, estabelecimento: 'FARMACIA PAGUE MENOS', itens: ITENS_FARMACIA },
    { id: 7, dia: 3, hora: '10:00', conta_nome: 'Caixa Econômica', descricao_bruta: 'PIX ENVIADO ALUGUEL', valor: -1500.0, origem: 'ofx', categoria: 'moradia' },
    { id: 8, dia: 3, hora: '09:30', conta_nome: 'Caixa Econômica', descricao_bruta: 'COMPRA PADARIA PAO DOURADO', valor: -45.5, origem: 'ofx', categoria: 'padaria' },
    { id: 9, dia: 3, hora: '11:00', conta_nome: 'Caixa Econômica', descricao_bruta: 'PIX RECEBIDO REEMBOLSO', valor: 120.0, origem: 'ofx' },
    { id: 10, dia: 5, hora: '13:10', conta_nome: 'Caixa Econômica', descricao_bruta: 'PAGAMENTO IFOOD PEDIDO 8841', valor: -62.4, origem: 'ofx', categoria: 'alimentacao' },
    { id: 11, dia: 7, hora: '16:45', conta_nome: 'Caixa Econômica', descricao_bruta: 'DEB AUT INTERNET VIVO FIBRA', valor: -119.9, origem: 'ofx', categoria: 'moradia' },
    { id: 12, dia: 9, hora: '10:20', conta_nome: 'Caixa Econômica', descricao_bruta: 'VENDA MARKETPLACE PEDIDO 5512', valor: 340.0, origem: 'ofx' },
    { id: 13, dia: 12, hora: '19:00', conta_nome: 'Caixa Econômica', descricao_bruta: 'COMPRA POSTO SHELL', valor: -180.0, origem: 'ofx', categoria: 'combustivel' },
    { id: 14, dia: 15, hora: '09:00', conta_nome: 'Caixa Econômica', descricao_bruta: 'PIX RECEBIDO FREELA DESIGN', valor: 900.0, origem: 'ofx' },
    { id: 15, dia: 18, hora: '21:15', conta_nome: 'Caixa Econômica', descricao_bruta: 'ASSINATURA STREAMING', valor: -39.9, origem: 'ofx', categoria: 'lazer' },
    { id: 16, dia: 22, hora: '12:00', conta_nome: 'Caixa Econômica', descricao_bruta: 'DEB AUT AGUA EMBASA', valor: -87.6, origem: 'ofx', categoria: 'moradia' },
  ].filter((t) => t.dia <= diasNoMes);

  function transacoesApi() {
    const lista = TRANSACOES
      .map((t) => ({
        id: t.id,
        data_transacao: ts(t.dia, t.hora),
        descricao_bruta: t.descricao_bruta,
        valor: t.valor,
        status_reconciliado: Boolean(t.cupom_id),
        origem: t.origem,
        cupom_id: t.cupom_id ?? null,
        categoria: t.categoria ?? 'outros',
        conta_nome: t.conta_nome,
        estabelecimento: t.estabelecimento ?? null,
        cupom_data_emissao: t.cupom_id ? ts(t.dia, t.hora) : null,
        itens_cupom: t.itens ?? null,
      }))
      .sort((a, b) => (a.data_transacao < b.data_transacao ? 1 : -1));
    return { pagina: 1, limite: 200, total: lista.length, transacoes: lista };
  }

  function resumoApi() {
    const ganhos = TRANSACOES.filter((t) => t.valor > 0).reduce((s, t) => s + t.valor, 0);
    const gastos = TRANSACOES.filter((t) => t.valor < 0).reduce((s, t) => s - t.valor, 0);
    return {
      mes: mesAtual,
      saldoConsolidado: Math.round((ganhos - gastos + 2340.51) * 100) / 100,
      totalGanhosMes: Math.round(ganhos * 100) / 100,
      totalGastosMes: Math.round(gastos * 100) / 100,
      balancoLiquidoMes: Math.round((ganhos - gastos) * 100) / 100,
    };
  }

  function fluxoDiarioApi() {
    const dias = [];
    for (let d = 1; d <= diasNoMes; d++) {
      const doDia = TRANSACOES.filter((t) => t.dia === d);
      dias.push({
        dia: dia(d),
        ganhos: doDia.filter((t) => t.valor > 0).reduce((s, t) => s + t.valor, 0),
        gastos: doDia.filter((t) => t.valor < 0).reduce((s, t) => s - t.valor, 0),
      });
    }
    return { mes: mesAtual, dias };
  }

  function categoriasApi() {
    const somas = new Map();
    for (const t of TRANSACOES) {
      if (t.cupom_id) {
        for (const item of t.itens ?? []) {
          somas.set(item.categoria, (somas.get(item.categoria) ?? 0) + item.valor_total);
        }
      } else if (t.valor < 0) {
        const cat = t.categoria ?? 'outros';
        somas.set(cat, (somas.get(cat) ?? 0) + Math.abs(t.valor));
      }
    }
    const categorias = [...somas.entries()]
      .map(([categoria, total]) => ({ categoria, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
    return { mes: mesAtual, categorias, gastosNaoDetalhados: 0 };
  }

  const vazio = (mes) => ({
    resumo: { mes, saldoConsolidado: resumoApi().saldoConsolidado, totalGanhosMes: 0, totalGastosMes: 0, balancoLiquidoMes: 0 },
    fluxo: { mes, dias: [] },
    categorias: { mes, categorias: [], gastosNaoDetalhados: 0 },
    transacoes: { pagina: 1, limite: 200, total: 0, transacoes: [] },
  });

  window.demoApi = async (url, opcoes) => {
    const u = new URL(url, location.origin);
    if (opcoes && opcoes.method && opcoes.method === 'PATCH') {
      if (u.pathname.includes('/cupons/itens/') && u.pathname.endsWith('/categoria')) {
        const id = parseInt(u.pathname.split('/itens/')[1].split('/')[0], 10);
        const { categoria } = JSON.parse(opcoes.body);
        for (const item of [...ITENS_SUPERMERCADO, ...ITENS_FARMACIA]) {
          if (item.id === id) {
            item.categoria = categoria;
            break;
          }
        }
        return { mensagem: 'Categoria atualizada com sucesso (Modo Demo).' };
      }
      if (u.pathname.includes('/transacoes/') && u.pathname.endsWith('/categoria')) {
        const id = parseInt(u.pathname.split('/transacoes/')[1].split('/')[0], 10);
        const { categoria } = JSON.parse(opcoes.body);
        const tx = TRANSACOES.find(t => t.id === id);
        if (tx) {
          tx.categoria = categoria;
        }
        return { mensagem: 'Categoria da transação atualizada com sucesso (Modo Demo).' };
      }
    }

    if (opcoes && opcoes.method && opcoes.method !== 'GET') {
      throw new Error('Modo demonstração: uploads exigem o backend rodando (veja o README).');
    }
    const mes = u.searchParams.get('mes') ?? mesAtual;
    const outroMes = mes !== mesAtual;
    if (u.pathname.endsWith('/dashboard/resumo')) return outroMes ? vazio(mes).resumo : resumoApi();
    if (u.pathname.endsWith('/dashboard/fluxo-diario')) return outroMes ? vazio(mes).fluxo : fluxoDiarioApi();
    if (u.pathname.endsWith('/dashboard/gastos-por-categoria')) return outroMes ? vazio(mes).categorias : categoriasApi();
    if (u.pathname.includes('/transacoes')) return outroMes ? vazio(mes).transacoes : transacoesApi();
    throw new Error(`Modo demonstração: rota não simulada (${u.pathname}).`);
  };
})();
