import { AppError } from '../../../shared/errors/app-error';
import { CategoriasRepository } from '../ports/categorias-repository';

function gerarChave(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function criarCategoriasService(repo: CategoriasRepository) {
  return {
    listar: (tenantId: string) => repo.listar(tenantId),
    existe: (tenantId: string, chave: string) => repo.existe(tenantId, chave),

    criar: async (tenantId: string, nomeRaw?: unknown, corRaw?: unknown, chaveRaw?: unknown) => {
      const nome = typeof nomeRaw === 'string' ? nomeRaw.trim() : '';
      if (!nome || nome.length < 2) {
        throw new AppError('Nome da categoria é obrigatório (mínimo 2 caracteres).', 400);
      }

      const cor = typeof corRaw === 'string' && corRaw.trim() ? corRaw.trim() : '#898781';

      const chave = typeof chaveRaw === 'string' && chaveRaw.trim() ? gerarChave(chaveRaw) : gerarChave(nome);
      if (!chave) {
        throw new AppError('Não foi possível gerar uma chave válida para a categoria.', 400);
      }

      if (await repo.existe(tenantId, chave)) {
        throw new AppError(`Já existe uma categoria com o nome/chave "${nome}".`, 400);
      }

      return repo.criar(tenantId, { chave, nome, cor });
    },

    atualizar: async (tenantId: string, chave: string, nomeRaw?: unknown, corRaw?: unknown) => {
      if (!chave || !(await repo.existe(tenantId, chave))) {
        throw new AppError('Categoria não encontrada.', 404);
      }

      const dados: { nome?: string; cor?: string } = {};
      if (typeof nomeRaw === 'string' && nomeRaw.trim()) {
        const nome = nomeRaw.trim();
        if (nome.length < 2) {
          throw new AppError('Nome da categoria deve ter no mínimo 2 caracteres.', 400);
        }
        dados.nome = nome;
      }
      if (typeof corRaw === 'string' && corRaw.trim()) {
        dados.cor = corRaw.trim();
      }

      return repo.atualizar(tenantId, chave, dados);
    },

    excluir: async (tenantId: string, chave: string) => {
      if (!chave) throw new AppError('Chave da categoria é obrigatória.', 400);
      if (chave === 'outros') {
        throw new AppError('A categoria padrão "outros" não pode ser excluída.', 400);
      }
      if (!(await repo.existe(tenantId, chave))) {
        throw new AppError('Categoria não encontrada.', 404);
      }
      await repo.excluir(tenantId, chave);
    },
  };
}
