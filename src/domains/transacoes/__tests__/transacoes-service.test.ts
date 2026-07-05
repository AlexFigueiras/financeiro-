import { describe, expect, it } from 'vitest';
import { criarTransacoesService } from '../services/transacoes-service';
import { TransacoesRepository } from '../ports/transacoes-repository';
import { ListaTransacoes, TransacaoListada } from '../types';

const LISTA_VAZIA: ListaTransacoes = { pagina: 1, limite: 100, total: 0, transacoes: [] };

const TRANSACAO_FAKE: TransacaoListada = {
  id: 1,
  data_transacao: '2026-01-10T12:00:00.000Z',
  descricao_bruta: 'Teste',
  valor: -10,
  status_reconciliado: false,
  origem: 'manual',
  cupom_id: null,
  categoria: 'outros',
  conta_id: 1,
  conta_nome: 'Banco X',
  estabelecimento: null,
  cupom_data_emissao: null,
  itens_cupom: null,
};

function fakeRepo(overrides: Partial<TransacoesRepository> = {}): TransacoesRepository {
  return {
    async listar() { return LISTA_VAZIA; },
    async atualizarCategoria() {},
    async criar() { return TRANSACAO_FAKE; },
    async atualizar() { return TRANSACAO_FAKE; },
    async excluir() {},
    async recategorizarTodas() { return 0; },
    ...overrides,
  };
}

function fakeCategorias(existe: boolean) {
  return {
    existe: async () => existe,
    seed: async () => {},
  };
}

function fakeContas(existe: boolean) {
  return { existe: async () => existe };
}

describe('transacoesService.listar', () => {
  it('rejeita mes em formato inválido', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(service.listar('t1', { mes: '2026/01' })).rejects.toThrow('formato YYYY-MM');
  });

  it('rejeita conta_id não numérico', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(service.listar('t1', { conta_id: 'abc' })).rejects.toThrow('conta_id inválido');
  });

  it('limita "limite" a 500 e usa 100 como padrão', async () => {
    let filtroCapturado: unknown;
    const repo = fakeRepo({
      async listar(_tenantId, filtro) {
        filtroCapturado = filtro;
        return LISTA_VAZIA;
      },
    });
    const service = criarTransacoesService(repo, fakeCategorias(true), fakeContas(true));
    await service.listar('t1', { limite: '99999' });
    expect(filtroCapturado).toMatchObject({ limite: 500 });
  });
});

describe('transacoesService.atualizarCategoria', () => {
  it('rejeita categoria ausente', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(service.atualizarCategoria('t1', 1, undefined)).rejects.toThrow('obrigatório');
  });

  it('rejeita categoria inexistente no tenant', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(false), fakeContas(true));
    await expect(service.atualizarCategoria('t1', 1, 'chave-invalida')).rejects.toThrow('não é válida');
  });

  it('aplica a categoria quando válida', async () => {
    let chamou = false;
    const repo = fakeRepo({ async atualizarCategoria() { chamou = true; } });
    const service = criarTransacoesService(repo, fakeCategorias(true), fakeContas(true));
    await service.atualizarCategoria('t1', 1, 'Alimentacao');
    expect(chamou).toBe(true);
  });
});

describe('transacoesService.criar', () => {
  it('rejeita conta_id ausente/inválido', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(
      service.criar('t1', { data_transacao: '2026-01-10', descricao_bruta: 'X', valor: -10 })
    ).rejects.toThrow('conta_id inválido');
  });

  it('rejeita conta inexistente no tenant', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(false));
    await expect(
      service.criar('t1', { conta_id: 1, data_transacao: '2026-01-10', descricao_bruta: 'X', valor: -10 })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejeita data inválida', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(
      service.criar('t1', { conta_id: 1, data_transacao: 'not-a-date', descricao_bruta: 'X', valor: -10 })
    ).rejects.toThrow('Data inválida');
  });

  it('interpreta data YYYY-MM-DD no fuso de Brasília (UTC-3)', async () => {
    let dadosCapturados: any;
    const repo = fakeRepo({
      async criar(_tenantId, dados) {
        dadosCapturados = dados;
        return TRANSACAO_FAKE;
      },
    });
    const service = criarTransacoesService(repo, fakeCategorias(true), fakeContas(true));
    await service.criar('t1', { conta_id: 1, data_transacao: '2026-08-01', descricao_bruta: 'X', valor: -10 });
    // 2026-08-01T12:00:00-03:00 deve virar 2026-08-01T15:00:00.000Z em ISO
    expect(dadosCapturados.dataTransacao).toBe('2026-08-01T15:00:00.000Z');
  });

  it('rejeita descrição vazia', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(
      service.criar('t1', { conta_id: 1, data_transacao: '2026-01-10', descricao_bruta: '  ', valor: -10 })
    ).rejects.toThrow('Descrição inválida');
  });

  it('rejeita valor zero', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(
      service.criar('t1', { conta_id: 1, data_transacao: '2026-01-10', descricao_bruta: 'X', valor: 0 })
    ).rejects.toThrow('diferente de zero');
  });

  it('rejeita categoria inexistente quando informada', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(false), fakeContas(true));
    await expect(
      service.criar('t1', { conta_id: 1, data_transacao: '2026-01-10', descricao_bruta: 'X', valor: -10, categoria: 'xyz' })
    ).rejects.toThrow('não é válida');
  });

  it('usa "outros" como categoria padrão quando omitida', async () => {
    let dadosCapturados: unknown;
    const repo = fakeRepo({
      async criar(_tenantId, dados) {
        dadosCapturados = dados;
        return TRANSACAO_FAKE;
      },
    });
    const service = criarTransacoesService(repo, fakeCategorias(true), fakeContas(true));
    await service.criar('t1', { conta_id: 1, data_transacao: '2026-01-10', descricao_bruta: 'X', valor: -10 });
    expect(dadosCapturados).toMatchObject({ categoria: 'outros' });
  });
});

describe('transacoesService.atualizar', () => {
  it('rejeita quando nenhum campo é informado', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(service.atualizar('t1', 1, {})).rejects.toThrow('ao menos um campo');
  });

  it('valida só os campos presentes (edição parcial)', async () => {
    let dadosCapturados: unknown;
    const repo = fakeRepo({
      async atualizar(_tenantId, _id, dados) {
        dadosCapturados = dados;
        return TRANSACAO_FAKE;
      },
    });
    const service = criarTransacoesService(repo, fakeCategorias(true), fakeContas(true));
    await service.atualizar('t1', 1, { valor: -99.999 });
    expect(dadosCapturados).toEqual({ valor: -100 });
  });

  it('rejeita valor zero na edição', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true), fakeContas(true));
    await expect(service.atualizar('t1', 1, { valor: 0 })).rejects.toThrow('diferente de zero');
  });
});

describe('transacoesService.excluir', () => {
  it('delega ao repositório', async () => {
    let chamou = false;
    const repo = fakeRepo({ async excluir() { chamou = true; } });
    const service = criarTransacoesService(repo, fakeCategorias(true), fakeContas(true));
    await service.excluir('t1', 1);
    expect(chamou).toBe(true);
  });
});

describe('transacoesService.recategorizarTodas', () => {
  it('semeia categorias/regras padrão e delega ao repositório', async () => {
    let chamouSeed = false;
    let chamouRepo = false;
    const fakeCat = {
      existe: async () => true,
      seed: async () => { chamouSeed = true; },
    };
    const repo = fakeRepo({
      async recategorizarTodas() {
        chamouRepo = true;
        return 5;
      },
    });
    const service = criarTransacoesService(repo, fakeCat, fakeContas(true));
    const total = await service.recategorizarTodas('t1');
    expect(chamouSeed).toBe(true);
    expect(chamouRepo).toBe(true);
    expect(total).toBe(5);
  });
});
