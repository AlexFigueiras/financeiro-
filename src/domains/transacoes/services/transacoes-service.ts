import { TransacoesRepository } from '../ports/transacoes-repository';
import { AppError } from '../../../shared/errors/app-error';

interface VerificadorCategoria {
  existe(tenantId: string, chave: string): Promise<boolean>;
}

export function criarTransacoesService(repo: TransacoesRepository, categorias: VerificadorCategoria) {
  return {
    async listar(
      tenantId: string,
      query: { mes?: unknown; conta_id?: unknown; limite?: unknown; pagina?: unknown }
    ) {
      const limite = Math.min(parseInt(String(query.limite ?? '100'), 10) || 100, 500);
      const pagina = Math.max(parseInt(String(query.pagina ?? '1'), 10) || 1, 1);

      let mes: string | undefined;
      if (query.mes) {
        if (!/^\d{4}-\d{2}$/.test(String(query.mes))) {
          throw new AppError('Parâmetro mes deve estar no formato YYYY-MM.', 400);
        }
        mes = String(query.mes);
      }

      let contaId: number | undefined;
      if (query.conta_id) {
        contaId = parseInt(String(query.conta_id), 10);
        if (isNaN(contaId)) throw new AppError('conta_id inválido.', 400);
      }

      return repo.listar(tenantId, { mes, contaId, pagina, limite });
    },

    async atualizarCategoria(tenantId: string, transacaoId: number, categoriaBruta: unknown): Promise<void> {
      if (!categoriaBruta || typeof categoriaBruta !== 'string') {
        throw new AppError('O campo categoria é obrigatório.', 400);
      }
      const categoriaChave = categoriaBruta.toLowerCase().trim();
      if (!(await categorias.existe(tenantId, categoriaChave))) {
        throw new AppError(`A categoria "${categoriaChave}" não é válida.`, 400);
      }
      await repo.atualizarCategoria(tenantId, transacaoId, categoriaChave);
    },
  };
}
