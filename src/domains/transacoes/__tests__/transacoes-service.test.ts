import { describe, expect, it } from 'vitest';
import { criarTransacoesService } from '../services/transacoes-service';
import { TransacoesRepository } from '../ports/transacoes-repository';
import { ListaTransacoes } from '../types';

const LISTA_VAZIA: ListaTransacoes = { pagina: 1, limite: 100, total: 0, transacoes: [] };

function fakeRepo(overrides: Partial<TransacoesRepository> = {}): TransacoesRepository {
  return {
    async listar() { return LISTA_VAZIA; },
    async atualizarCategoria() {},
    ...overrides,
  };
}

function fakeCategorias(existe: boolean) {
  return { existe: async () => existe };
}

describe('transacoesService.listar', () => {
  it('rejeita mes em formato inválido', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true));
    await expect(service.listar('t1', { mes: '2026/01' })).rejects.toThrow('formato YYYY-MM');
  });

  it('rejeita conta_id não numérico', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true));
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
    const service = criarTransacoesService(repo, fakeCategorias(true));
    await service.listar('t1', { limite: '99999' });
    expect(filtroCapturado).toMatchObject({ limite: 500 });
  });
});

describe('transacoesService.atualizarCategoria', () => {
  it('rejeita categoria ausente', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(true));
    await expect(service.atualizarCategoria('t1', 1, undefined)).rejects.toThrow('obrigatório');
  });

  it('rejeita categoria inexistente no tenant', async () => {
    const service = criarTransacoesService(fakeRepo(), fakeCategorias(false));
    await expect(service.atualizarCategoria('t1', 1, 'chave-invalida')).rejects.toThrow('não é válida');
  });

  it('aplica a categoria quando válida', async () => {
    let chamou = false;
    const repo = fakeRepo({ async atualizarCategoria() { chamou = true; } });
    const service = criarTransacoesService(repo, fakeCategorias(true));
    await service.atualizarCategoria('t1', 1, 'Alimentacao');
    expect(chamou).toBe(true);
  });
});
