import { z } from 'zod';

/** v1 — publicado após cada importação de extrato (OFX ou PDF/imagem via IA). */
export const extratoImportadoSchema = z.object({
  tenantId: z.string().uuid(),
  contaId: z.number().int().positive(),
  via: z.enum(['ofx', 'pdf']),
  totalNoArquivo: z.number().int().nonnegative(),
  importadas: z.number().int().nonnegative(),
  ignoradasDuplicadas: z.number().int().nonnegative(),
});

export type ExtratoImportadoV1 = z.infer<typeof extratoImportadoSchema>;
