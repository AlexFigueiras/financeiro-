import { MatchReconciliacao } from '../types';

export interface ReconciliacaoRepository {
  executarMotor(tenantId: string): Promise<MatchReconciliacao[]>;
}
