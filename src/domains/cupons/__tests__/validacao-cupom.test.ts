import { describe, expect, it } from 'vitest';
import { normalizarDataEmissao, validarCupom } from '../domain/validacao-cupom';
import { CupomGemini } from '../types';

function cupomValido(overrides: Partial<CupomGemini> = {}): CupomGemini {
  return {
    estabelecimento: 'Mercado X',
    data: '2026-01-10 12:00:00',
    valor_total: 50,
    itens: [{ produto: 'Arroz', qtd: 1, valor_uni: 50, subtotal: 50 }],
    ...overrides,
  };
}

describe('validarCupom', () => {
  it('aceita cupom consistente', () => {
    expect(() => validarCupom(cupomValido())).not.toThrow();
  });

  it('rejeita estabelecimento ausente', () => {
    expect(() => validarCupom(cupomValido({ estabelecimento: '' }))).toThrow('estabelecimento ausente');
  });

  it('rejeita valor_total inválido', () => {
    expect(() => validarCupom(cupomValido({ valor_total: 0 }))).toThrow('valor_total inválido');
  });

  it('rejeita cupom sem itens', () => {
    expect(() => validarCupom(cupomValido({ itens: [] }))).toThrow('nenhum item identificado');
  });

  it('rejeita data inválida', () => {
    expect(() => validarCupom(cupomValido({ data: 'não é data' }))).toThrow('data inválida');
  });

  it('rejeita quando soma dos itens diverge do total além da tolerância', () => {
    const cupom = cupomValido({
      valor_total: 100,
      itens: [{ produto: 'Arroz', qtd: 1, valor_uni: 50, subtotal: 50 }],
    });
    expect(() => validarCupom(cupom)).toThrow('Inconsistência na extração');
  });

  it('aceita divergência dentro da tolerância de R$ 0,05', () => {
    const cupom = cupomValido({
      valor_total: 50.04,
      itens: [{ produto: 'Arroz', qtd: 1, valor_uni: 50, subtotal: 50 }],
    });
    expect(() => validarCupom(cupom)).not.toThrow();
  });
});

describe('normalizarDataEmissao', () => {
  it('assume horário de Brasília quando não há fuso', () => {
    expect(normalizarDataEmissao('2026-01-10 12:00:00')).toBe('2026-01-10T15:00:00.000Z');
  });

  it('preserva fuso explícito', () => {
    expect(normalizarDataEmissao('2026-01-10T12:00:00Z')).toBe('2026-01-10T12:00:00.000Z');
  });
});
