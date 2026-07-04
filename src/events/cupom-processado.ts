import { z } from 'zod';

/** v1 — publicado após OCR + persistência de um cupom fiscal. */
export const cupomProcessadoSchema = z.object({
  tenantId: z.string().uuid(),
  cupomId: z.number().int().positive(),
  estabelecimento: z.string(),
  valorTotal: z.number().nonnegative(),
  itens: z.number().int().nonnegative(),
});

export type CupomProcessadoV1 = z.infer<typeof cupomProcessadoSchema>;
