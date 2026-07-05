import { ContasRepository } from '../ports/contas-repository';
import { TIPOS_CONTA_VALIDOS, TipoConta } from '../types';
import { AppError } from '../../../shared/errors/app-error';

export function criarContasService(repo: ContasRepository) {
  return {
    listar: (tenantId: string) => repo.listar(tenantId),

    /** Usado por outros domínios (via index.ts) para validar um conta_id recebido. */
    existe: (tenantId: string, contaId: number) => repo.existe(tenantId, contaId),

    async criar(tenantId: string, nomeBruto: unknown, tipoBruto: unknown) {
      if (!nomeBruto || typeof nomeBruto !== 'string' || nomeBruto.trim().length < 2) {
        throw new AppError('Campo obrigatório: nome (mínimo 2 caracteres).', 400);
      }
      const tipo: TipoConta =
        typeof tipoBruto === 'string' && TIPOS_CONTA_VALIDOS.includes(tipoBruto as TipoConta)
          ? (tipoBruto as TipoConta)
          : 'corrente';

      const nome = nomeBruto.trim();
      const conta = await repo.criar(tenantId, nome, tipo);
      if (!conta) throw new AppError(`Conta "${nome}" já existe.`, 409);
      return conta;
    },

    /** Resolve o ID de conta a partir do body OU cai para a única/primeira conta do tenant. */
    async resolverContaId(tenantId: string, contaIdBruto: unknown): Promise<number> {
      const contaId = contaIdBruto ? parseInt(String(contaIdBruto), 10) : NaN;
      if (!isNaN(contaId)) {
        const existe = await repo.existe(tenantId, contaId);
        if (!existe) throw new AppError(`Conta bancária ${contaId} não existe.`, 404);
        return contaId;
      }
      const contas = await repo.listar(tenantId);
      if (contas.length === 0) {
        throw new AppError('Nenhuma conta bancária cadastrada. Crie uma conta antes de importar um extrato.', 400);
      }
      return contas[0].id;
    },

    async atualizar(tenantId: string, contaId: number, nomeBruto: unknown, tipoBruto: unknown) {
      if (!(await repo.existe(tenantId, contaId))) {
        throw new AppError(`Conta bancária ${contaId} não existe.`, 404);
      }
      if (!nomeBruto || typeof nomeBruto !== 'string' || nomeBruto.trim().length < 2) {
        throw new AppError('Campo obrigatório: nome (mínimo 2 caracteres).', 400);
      }
      const tipo: TipoConta =
        typeof tipoBruto === 'string' && TIPOS_CONTA_VALIDOS.includes(tipoBruto as TipoConta)
          ? (tipoBruto as TipoConta)
          : 'corrente';

      const nome = nomeBruto.trim();
      const conta = await repo.atualizar(tenantId, contaId, nome, tipo);
      if (!conta) throw new AppError(`Conta "${nome}" já existe.`, 409);
      return conta;
    },

    async excluir(tenantId: string, contaId: number): Promise<void> {
      if (!(await repo.existe(tenantId, contaId))) {
        throw new AppError(`Conta bancária ${contaId} não existe.`, 404);
      }
      const qtd = await repo.contarTransacoes(tenantId, contaId);
      if (qtd > 0) {
        throw new AppError(
          `Esta conta tem ${qtd} transação(ões) vinculada(s). Exclua-as antes de excluir a conta.`,
          409
        );
      }
      await repo.excluir(tenantId, contaId);
    },
  };
}
