import { describe, expect, it } from 'vitest';
import { criarReconciliacaoService } from '../services/reconciliacao-service';
import { ReconciliacaoRepository } from '../ports/reconciliacao-repository';
import { MatchReconciliacao } from '../types';

function fakeRepo(matches: MatchReconciliacao[] = [], erro?: Error): ReconciliacaoRepository {
  return {
    async executarMotor() {
      if (erro) throw erro;
      return matches;
    },
  };
}

describe('reconciliacaoService.reconciliar', () => {
  it('retorna os matches encontrados pelo motor', async () => {
    const matches = [{ transacaoId: 1, cupomFiscalId: 2 }];
    const service = criarReconciliacaoService(fakeRepo(matches));
    await expect(service.reconciliar('11111111-1111-4111-8111-111111111111', 'manual')).resolves.toEqual(matches);
  });

  it('propaga erro do repositório', async () => {
    const service = criarReconciliacaoService(fakeRepo([], new Error('falha de banco')));
    await expect(service.reconciliar('11111111-1111-4111-8111-111111111111', 'manual')).rejects.toThrow('falha de banco');
  });
});

describe('reconciliacaoService.reconciliarSeguro', () => {
  it('nunca propaga erro — retorna array vazio em falha', async () => {
    const service = criarReconciliacaoService(fakeRepo([], new Error('indisponível')));
    await expect(service.reconciliarSeguro('11111111-1111-4111-8111-111111111111', 'upload')).resolves.toEqual([]);
  });

  it('retorna os matches normalmente quando não há erro', async () => {
    const matches = [{ transacaoId: 5, cupomFiscalId: 9 }];
    const service = criarReconciliacaoService(fakeRepo(matches));
    await expect(service.reconciliarSeguro('11111111-1111-4111-8111-111111111111', 'upload')).resolves.toEqual(matches);
  });
});
