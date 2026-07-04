import { z } from 'zod';

/** v1 — publicado quando o motor de reconciliação encontra matches. */
export const transacoesReconciliadasSchema = z.object({
  tenantId: z.string().uuid(),
  contexto: z.string(), // 'upload extrato' | 'upload de cupom' | 'cron' | 'manual'
  matches: z.array(
    z.object({
      transacaoId: z.number().int().positive(),
      cupomFiscalId: z.number().int().positive(),
    })
  ),
});

export type TransacoesReconciliadasV1 = z.infer<typeof transacoesReconciliadasSchema>;
