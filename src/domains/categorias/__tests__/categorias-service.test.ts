import { describe, expect, it } from 'vitest';
import { criarCategoriasService } from '../services/categorias-service';
import { CategoriasRepository } from '../ports/categorias-repository';
import { Categoria } from '../types';

function fakeRepo(categoriasIniciais: Categoria[]): CategoriasRepository {
  const list = [...categoriasIniciais];
  return {
    async listar() { return list; },
    async existe(_tenantId, chave) { return list.some((c) => c.chave === chave); },
    async criar(_tenantId, cat) {
      list.push(cat);
      return cat;
    },
    async atualizar(_tenantId, chave, dados) {
      const idx = list.findIndex((c) => c.chave === chave);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...dados };
        return list[idx];
      }
      throw new Error('Not found');
    },
    async excluir(_tenantId, chave) {
      const idx = list.findIndex((c) => c.chave === chave);
      if (idx !== -1) list.splice(idx, 1);
    },
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

  it('cria uma nova categoria (ex: Educação)', async () => {
    const criada = await service.criar('t1', 'Educação', '#3b82f6');
    expect(criada).toEqual({ chave: 'educacao', nome: 'Educação', cor: '#3b82f6' });
  });

  it('impede criação de categoria duplicada', async () => {
    await expect(service.criar('t1', 'Educação')).rejects.toThrow('Já existe');
  });

  it('atualiza uma categoria existente', async () => {
    const atualizada = await service.atualizar('t1', 'educacao', 'Educação Infantil', '#1d4ed8');
    expect(atualizada).toEqual({ chave: 'educacao', nome: 'Educação Infantil', cor: '#1d4ed8' });
  });

  it('exclui uma categoria', async () => {
    await service.excluir('t1', 'educacao');
    await expect(service.existe('t1', 'educacao')).resolves.toBe(false);
  });

  it('impede a exclusão da categoria padrão "outros"', async () => {
    await expect(service.excluir('t1', 'outros')).rejects.toThrow('não pode ser excluída');
  });
});
