import { ReconciliacaoRepository } from '../ports/reconciliacao-repository';
import { loggerDe } from '../../../shared/observability/logger';
import { publicar } from '../../../events/bus';
import { MatchReconciliacao } from '../types';

const log = loggerDe('reconciliacao');

export function criarReconciliacaoService(repo: ReconciliacaoRepository) {
  async function reconciliar(tenantId: string, contexto: string): Promise<MatchReconciliacao[]> {
    const matches = await repo.executarMotor(tenantId);
    if (matches.length > 0) {
      log.info(
        { matches: matches.length },
        `reconciliação (${contexto}): ` +
          matches.map((m) => `tx#${m.transacaoId}↔cupom#${m.cupomFiscalId}`).join(', ')
      );
      await publicar('transacoes.reconciliadas.v1', { tenantId, contexto, matches });
    }
    return matches;
  }

  return {
    reconciliar,

    /** Versão silenciosa para gatilhos pós-ingestão: nunca propaga erro. */
    async reconciliarSeguro(tenantId: string, contexto: string): Promise<MatchReconciliacao[]> {
      try {
        return await reconciliar(tenantId, contexto);
      } catch (err) {
        log.error({ err: (err as Error).message, contexto }, 'falha na reconciliação');
        return [];
      }
    },
  };
}
