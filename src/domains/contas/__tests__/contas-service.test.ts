import { describe, expect, it } from 'vitest';
import { criarContasService } from '../services/contas-service';
import { ContasRepository } from '../ports/contas-repository';
import { ContaBancaria } from '../types';

function fakeRepo(contas: ContaBancaria[] = [], transacoesPorConta: Record<number, number> = {}): ContasRepository {
  return {
    async listar() {
      return contas;
    },
    async criar(_tenantId, nome, tipo) {
      if (contas.some((c) => c.nome === nome)) return null;
      const nova = { id: contas.length + 1, nome, tipo, saldoAtual: 0, atualizadoEm: new Date().toISOString() };
      contas.push(nova);
      return nova;
    },
    async existe(_tenantId, contaId) {
      return contas.some((c) => c.id === contaId);
    },
    async buscarIdPorNome(_tenantId, nome) {
      return contas.find((c) => c.nome === nome)?.id ?? null;
    },
    async atualizar(_tenantId, contaId, nome, tipo) {
      if (contas.some((c) => c.nome === nome && c.id !== contaId)) return null;
      const conta = contas.find((c) => c.id === contaId);
      if (!conta) return null;
      conta.nome = nome;
      conta.tipo = tipo;
      return conta;
    },
    async contarTransacoes(_tenantId, contaId) {
      return transacoesPorConta[contaId] ?? 0;
    },
    async excluir(_tenantId, contaId) {
      const idx = contas.findIndex((c) => c.id === contaId);
      if (idx >= 0) contas.splice(idx, 1);
    },
  };
}

describe('contasService.criar', () => {
  it('rejeita nome ausente ou curto demais', async () => {
    const service = criarContasService(fakeRepo());
    await expect(service.criar('t1', 'A', undefined)).rejects.toThrow('mínimo 2 caracteres');
    await expect(service.criar('t1', undefined, undefined)).rejects.toThrow('mínimo 2 caracteres');
  });

  it('usa "corrente" como tipo padrão quando tipo é inválido', async () => {
    const service = criarContasService(fakeRepo());
    const conta = await service.criar('t1', 'Banco X', 'tipo-invalido');
    expect(conta.tipo).toBe('corrente');
  });

  it('aceita um tipo válido explícito', async () => {
    const service = criarContasService(fakeRepo());
    const conta = await service.criar('t1', 'Banco X', 'poupanca');
    expect(conta.tipo).toBe('poupanca');
  });

  it('rejeita nome duplicado com 409', async () => {
    const service = criarContasService(fakeRepo([
      { id: 1, nome: 'Banco X', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' },
    ]));
    await expect(service.criar('t1', 'Banco X', undefined)).rejects.toMatchObject({ status: 409 });
  });
});

describe('contasService.resolverContaId', () => {
  it('retorna o id explícito quando a conta existe', async () => {
    const service = criarContasService(fakeRepo([
      { id: 7, nome: 'Banco X', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' },
    ]));
    await expect(service.resolverContaId('t1', '7')).resolves.toBe(7);
  });

  it('rejeita id explícito inexistente com 404', async () => {
    const service = criarContasService(fakeRepo());
    await expect(service.resolverContaId('t1', '999')).rejects.toMatchObject({ status: 404 });
  });

  it('cai para a primeira conta do tenant quando não vem conta_id', async () => {
    const service = criarContasService(fakeRepo([
      { id: 3, nome: 'Única', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' },
    ]));
    await expect(service.resolverContaId('t1', undefined)).resolves.toBe(3);
  });

  it('rejeita quando não há conta_id e o tenant não tem nenhuma conta', async () => {
    const service = criarContasService(fakeRepo());
    await expect(service.resolverContaId('t1', undefined)).rejects.toThrow('Nenhuma conta bancária cadastrada');
  });
});

describe('contasService.atualizar', () => {
  it('rejeita conta inexistente', async () => {
    const service = criarContasService(fakeRepo());
    await expect(service.atualizar('t1', 1, 'Novo Nome', 'corrente')).rejects.toMatchObject({ status: 404 });
  });

  it('rejeita nome ausente ou curto demais', async () => {
    const service = criarContasService(fakeRepo([
      { id: 1, nome: 'Banco X', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' },
    ]));
    await expect(service.atualizar('t1', 1, 'A', undefined)).rejects.toThrow('mínimo 2 caracteres');
  });

  it('atualiza nome e tipo quando válidos', async () => {
    const service = criarContasService(fakeRepo([
      { id: 1, nome: 'Banco X', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' },
    ]));
    const conta = await service.atualizar('t1', 1, 'Banco Y', 'poupanca');
    expect(conta).toMatchObject({ nome: 'Banco Y', tipo: 'poupanca' });
  });

  it('rejeita novo nome que colide com outra conta do tenant', async () => {
    const service = criarContasService(fakeRepo([
      { id: 1, nome: 'Banco X', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' },
      { id: 2, nome: 'Banco Y', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' },
    ]));
    await expect(service.atualizar('t1', 1, 'Banco Y', undefined)).rejects.toMatchObject({ status: 409 });
  });
});

describe('contasService.excluir', () => {
  it('rejeita conta inexistente', async () => {
    const service = criarContasService(fakeRepo());
    await expect(service.excluir('t1', 1)).rejects.toMatchObject({ status: 404 });
  });

  it('rejeita exclusão quando a conta tem transações vinculadas', async () => {
    const service = criarContasService(fakeRepo(
      [{ id: 1, nome: 'Banco X', tipo: 'corrente', saldoAtual: 0, atualizadoEm: '' }],
      { 1: 3 }
    ));
    await expect(service.excluir('t1', 1)).rejects.toMatchObject({ status: 409 });
  });

  it('exclui quando não há transações vinculadas', async () => {
    const contas = [{ id: 1, nome: 'Banco X', tipo: 'corrente' as const, saldoAtual: 0, atualizadoEm: '' }];
    const service = criarContasService(fakeRepo(contas, { 1: 0 }));
    await service.excluir('t1', 1);
    expect(contas).toHaveLength(0);
  });
});
