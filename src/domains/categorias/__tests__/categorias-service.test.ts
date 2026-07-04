import { describe, expect, it } from 'vitest';
import { criarCategoriasService } from '../services/categorias-service';
import { CategoriasRepository } from '../ports/categorias-repository';
import { Categoria } from '../types';

function fakeRepo(categorias: Categoria[]): CategoriasRepository {
  return {
    async listar() { return categorias; },
    async existe(_tenantId, chave) { return categorias.some((c) => c.chave === chave); },
  };
}

describe('categoriasService', () => {
  const categorias = [{ chave: 'alimentacao', nome: 'Alimentação', cor: '#000' }];
  const service = criarCategoriasService(fakeRepo(categorias));

  it('lista as categorias do tenant', async () => {
    await expect(service.listar('t1')).resolves.toEqual(categorias);
  });

  it('confirma existência de uma chave válida', async () => {
    await expect(service.existe('t1', 'alimentacao')).resolves.toBe(true);
  });

  it('nega existência de uma chave desconhecida', async () => {
    await expect(service.existe('t1', 'inexistente')).resolves.toBe(false);
  });
});
