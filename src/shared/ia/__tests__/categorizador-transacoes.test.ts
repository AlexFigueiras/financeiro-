import { describe, it, expect, vi, beforeEach } from 'vitest';
import { categorizarTransacoesComIA, CategoriaItem, TransacaoItemCategorizacao } from '../categorizador-transacoes';
import * as geminiClient from '../gemini-client';

vi.mock('../gemini-client', () => ({
  requisitarGeminiTextoJson: vi.fn(),
}));

describe('categorizarTransacoesComIA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const categorias: CategoriaItem[] = [
    { chave: 'farmacia', nome: 'Farmácia' },
    { chave: 'transporte', nome: 'Transporte' },
    { chave: 'combustivel', nome: 'Combustível de Veículo' },
    { chave: 'alimentacao', nome: 'Alimentação' },
    { chave: 'outros', nome: 'Outros' },
  ];

  it('retorna mapa vazio se a lista de transações for vazia', async () => {
    const res = await categorizarTransacoesComIA(categorias, []);
    expect(res.size).toBe(0);
    expect(geminiClient.requisitarGeminiTextoJson).not.toHaveBeenCalled();
  });

  it('chama Gemini IA e mapeia corretamente as categorias sugeridas', async () => {
    vi.mocked(geminiClient.requisitarGeminiTextoJson).mockResolvedValueOnce({
      classificacoes: [
        { id: 101, categoria: 'farmacia' },
        { id: 102, categoria: 'transporte' },
        { id: 103, categoria: 'combustivel' },
      ],
    });

    const transacoes: TransacaoItemCategorizacao[] = [
      { id: 101, descricao: 'DROGALIRA PHARMA BRASIL' },
      { id: 102, descricao: 'UBER *TRIP BRASIL' },
      { id: 103, descricao: 'POSTO SHELL MARAJO' },
    ];

    const mapa = await categorizarTransacoesComIA(categorias, transacoes);

    expect(geminiClient.requisitarGeminiTextoJson).toHaveBeenCalledTimes(1);
    expect(mapa.get(101)).toBe('farmacia');
    expect(mapa.get(102)).toBe('transporte');
    expect(mapa.get(103)).toBe('combustivel');
  });

  it('descarta categorias retornadas pela IA que não existam no catálogo de categorias fornecido', async () => {
    vi.mocked(geminiClient.requisitarGeminiTextoJson).mockResolvedValueOnce({
      classificacoes: [
        { id: 201, categoria: 'categoria_inexistente' },
        { id: 202, categoria: 'farmacia' },
      ],
    });

    const transacoes: TransacaoItemCategorizacao[] = [
      { id: 201, descricao: 'COMPRA ALEATORIA' },
      { id: 202, descricao: 'DROGARIA PACHECO' },
    ];

    const mapa = await categorizarTransacoesComIA(categorias, transacoes);

    expect(mapa.has(201)).toBe(false);
    expect(mapa.get(202)).toBe('farmacia');
  });

  it('captura falhas da API da IA e retorna mapa vazio sem estourar exceção', async () => {
    vi.mocked(geminiClient.requisitarGeminiTextoJson).mockRejectedValueOnce(new Error('Rate limit ou sem API key'));

    const transacoes: TransacaoItemCategorizacao[] = [
      { id: 301, descricao: 'DROGALIRA' },
    ];

    const mapa = await categorizarTransacoesComIA(categorias, transacoes);
    expect(mapa.size).toBe(0);
  });
});
