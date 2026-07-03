/**
 * MOTOR DE RECONCILIAÇÃO E ENRIQUECIMENTO.
 *
 * A lógica de match vive no banco (fn_reconciliar, em db/schema.sql):
 *   1. valor da saída bancária == valor_total do cupom (centavo por centavo);
 *   2. data_transacao dentro de ±48h da data_emissao (janela de compensação);
 *   3. em empate, vence a transação mais próxima no tempo;
 *   4. vínculo 1:1 garantido por índice único parcial em cupom_id.
 *
 * É disparado: (a) após cada upload de OFX, (b) após cada cupom processado
 * e (c) pelo cron periódico.
 */
import { pool } from '../db/pool';

export interface MatchReconciliacao {
  transacao_id: number;
  cupom_fiscal_id: number;
}

export async function reconciliar(): Promise<MatchReconciliacao[]> {
  const { rows } = await pool.query<MatchReconciliacao>('SELECT * FROM fn_reconciliar()');
  if (rows.length > 0) {
    console.log(
      `[reconciliação] ${rows.length} match(es): ` +
        rows.map((r) => `tx#${r.transacao_id}↔cupom#${r.cupom_fiscal_id}`).join(', ')
    );
  }
  return rows;
}

/** Versão silenciosa para gatilhos pós-ingestão: nunca propaga erro. */
export async function reconciliarSeguro(contexto: string): Promise<MatchReconciliacao[]> {
  try {
    return await reconciliar();
  } catch (err) {
    console.error(`[reconciliação] falha após ${contexto}:`, (err as Error).message);
    return [];
  }
}
