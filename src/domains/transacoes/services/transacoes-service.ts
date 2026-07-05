import { TransacoesRepository } from '../ports/transacoes-repository';
import { AppError } from '../../../shared/errors/app-error';
import { DadosTransacao, TransacaoListada } from '../types';

interface VerificadorCategoria {
  existe(tenantId: string, chave: string): Promise<boolean>;
  seed(tenantId: string): Promise<void>;
}

interface VerificadorConta {
  existe(tenantId: string, contaId: number): Promise<boolean>;
}

/** Corpo bruto (snake_case, igual ao formato devolvido pela listagem) de criação/edição de um lançamento. */
interface CorpoTransacao {
  conta_id?: unknown;
  data_transacao?: unknown;
  descricao_bruta?: unknown;
  valor?: unknown;
  categoria?: unknown;
}

export function criarTransacoesService(
  repo: TransacoesRepository,
  categorias: VerificadorCategoria,
  contas: VerificadorConta
) {
  async function validarContaId(tenantId: string, bruto: unknown): Promise<number> {
    const contaId = parseInt(String(bruto), 10);
    if (isNaN(contaId)) throw new AppError('conta_id inválido.', 400);
    if (!(await contas.existe(tenantId, contaId))) {
      throw new AppError(`Conta bancária ${contaId} não existe.`, 404);
    }
    return contaId;
  }

  function validarData(bruto: unknown): string {
    if (typeof bruto !== 'string' || !bruto.trim()) throw new AppError('Data inválida.', 400);
    let strData = bruto.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(strData)) {
      strData = `${strData}T12:00:00-03:00`;
    }
    const data = new Date(strData);
    if (isNaN(data.getTime())) throw new AppError('Data inválida.', 400);
    return data.toISOString();
  }

  function validarDescricao(bruto: unknown): string {
    if (typeof bruto !== 'string' || !bruto.trim()) {
      throw new AppError('Descrição inválida.', 400);
    }
    return bruto.trim();
  }

  function validarValor(bruto: unknown): number {
    const valor = Number(bruto);
    if (bruto === undefined || bruto === null || isNaN(valor) || valor === 0) {
      throw new AppError('Valor inválido (deve ser um número diferente de zero).', 400);
    }
    return Math.round(valor * 100) / 100;
  }

  async function validarCategoria(tenantId: string, bruto: unknown): Promise<string> {
    const chave = String(bruto).toLowerCase().trim();
    if (!(await categorias.existe(tenantId, chave))) {
      throw new AppError(`A categoria "${chave}" não é válida.`, 400);
    }
    return chave;
  }

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

    /** Lançamento manual (origem='manual') — usuário registra algo que não veio de extrato. */
    async criar(tenantId: string, corpo: CorpoTransacao): Promise<TransacaoListada> {
      const contaId = await validarContaId(tenantId, corpo.conta_id);
      const dataTransacao = validarData(corpo.data_transacao);
      const descricaoBruta = validarDescricao(corpo.descricao_bruta);
      const valor = validarValor(corpo.valor);
      const categoria = corpo.categoria !== undefined ? await validarCategoria(tenantId, corpo.categoria) : 'outros';

      const dados: DadosTransacao = { contaId, dataTransacao, descricaoBruta, valor, categoria };
      return repo.criar(tenantId, dados);
    },

    /** Edição parcial: só valida/aplica os campos presentes no corpo. */
    async atualizar(tenantId: string, transacaoId: number, corpo: CorpoTransacao): Promise<TransacaoListada> {
      const dados: Partial<DadosTransacao> = {};
      if (corpo.conta_id !== undefined) dados.contaId = await validarContaId(tenantId, corpo.conta_id);
      if (corpo.data_transacao !== undefined) dados.dataTransacao = validarData(corpo.data_transacao);
      if (corpo.descricao_bruta !== undefined) dados.descricaoBruta = validarDescricao(corpo.descricao_bruta);
      if (corpo.valor !== undefined) dados.valor = validarValor(corpo.valor);
      if (corpo.categoria !== undefined) dados.categoria = await validarCategoria(tenantId, corpo.categoria);

      if (Object.keys(dados).length === 0) {
        throw new AppError('Informe ao menos um campo para atualizar.', 400);
      }
      return repo.atualizar(tenantId, transacaoId, dados);
    },

    async excluir(tenantId: string, transacaoId: number): Promise<void> {
      await repo.excluir(tenantId, transacaoId);
    },

    async recategorizarTodas(tenantId: string): Promise<number> {
      await categorias.seed(tenantId);
      return repo.recategorizarTodas(tenantId);
    },
  };
}
