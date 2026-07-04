import { z } from 'zod';

/** v1 — publicado quando um tenant novo é provisionado (self-service signup). */
export const tenantCriadoSchema = z.object({
  tenantId: z.string().uuid(),
  nome: z.string(),
});

export type TenantCriadoV1 = z.infer<typeof tenantCriadoSchema>;
