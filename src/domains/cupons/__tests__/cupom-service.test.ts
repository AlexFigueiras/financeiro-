import { describe, expect, it } from 'vitest';
import { criarCupomService } from '../services/cupom-service';
import { CupomOcrPort } from '../ports/cupom-ocr-port';
import { CupomRepository } from '../ports/cupom-repository';
import { CupomGemini, CupomComItens } from '../types';

const CUPOM_VALIDO: CupomGemini = {
  estabelecimento: 'Mercado X',
  data: '2026-01-10 12:00:00',
  valor_total: 50,
  itens: [{ produto: 'Arroz', qtd: 1, valor_uni: 50, subtotal: 50, categoria: 'alimentacao' }],
};

function fakeOcr(retorno: CupomGemini = CUPOM_VALIDO): CupomOcrPort {
  return { async extrairCupom() { return retorno; } };
}

function fakeRepo(overrides: Partial<CupomRepository> = {}): CupomRepository {
  return {
    async salvar() { return 42; },
    async buscarComItens() { return null; },
    async atualizarCategoriaItem() {},
    async categoriaExiste() { return true; },
    ...overrides,
  };
}

describe('cupomService.processar', () => {
  it('processa um cupom válido e retorna o resumo', async () => {
    const service = criarCupomService(fakeOcr(), fakeRepo());
    const resultado = await service.processar('11111111-1111-4111-8111-111111111111', Buffer.from(''), 'image/jpeg');
    expect(resultado).toMatchObject({ cupomId: 42, estabelecimento: 'Mercado X', valorTotal: 50, itens: 1 });
  });

  it('propaga a rejeição de validação quando o cupom é inconsistente', async () => {
    const inconsistente = { ...CUPOM_VALIDO, valor_total: 999 };
    const service = criarCupomService(fakeOcr(inconsistente), fakeRepo());
    await expect(service.processar('11111111-1111-4111-8111-111111111111', Buffer.from(''), 'image/jpeg')).rejects.toThrow('Inconsistência na extração');
  });
});

describe('cupomService.obterComItens', () => {
  it('lança 404 quando o cupom não existe', async () => {
    const service = criarCupomService(fakeOcr(), fakeRepo());
    await expect(service.obterComItens('11111111-1111-4111-8111-111111111111', 999)).rejects.toMatchObject({ status: 404 });
  });

  it('retorna o cupom quando encontrado', async () => {
    const cupom: CupomComItens = { id: 1, dataEmissao: '', valorTotal: 50, estabelecimento: 'X', itens: [] };
    const service = criarCupomService(fakeOcr(), fakeRepo({ async buscarComItens() { return cupom; } }));
    await expect(service.obterComItens('11111111-1111-4111-8111-111111111111', 1)).resolves.toBe(cupom);
  });
});

describe('cupomService.atualizarCategoriaItem', () => {
  it('rejeita categoria ausente', async () => {
    const service = criarCupomService(fakeOcr(), fakeRepo());
    await expect(service.atualizarCategoriaItem('11111111-1111-4111-8111-111111111111', 1, undefined)).rejects.toThrow('obrigatório');
  });

  it('rejeita categoria que não existe no tenant', async () => {
    const service = criarCupomService(fakeOcr(), fakeRepo({ async categoriaExiste() { return false; } }));
    await expect(service.atualizarCategoriaItem('11111111-1111-4111-8111-111111111111', 1, 'inexistente')).rejects.toThrow('não é válida');
  });
});
