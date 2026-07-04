/**
 * Catálogo ÚNICO de eventos do sistema (§6.2 do Dev OS).
 * Todo evento tem contrato versionado (schema Zod + tipo). Para evoluir um
 * contrato de forma incompatível, crie `<nome>.v2` e mantenha o v1 até que
 * todos os consumidores migrem — nunca mute um contrato publicado.
 */
import { z } from 'zod';
import { extratoImportadoSchema } from './extrato-importado';
import { cupomProcessadoSchema } from './cupom-processado';
import { transacoesReconciliadasSchema } from './transacoes-reconciliadas';
import { tenantCriadoSchema } from './tenant-criado';

export const registroEventos = {
  'extrato.importado.v1': extratoImportadoSchema,
  'cupom.processado.v1': cupomProcessadoSchema,
  'transacoes.reconciliadas.v1': transacoesReconciliadasSchema,
  'tenant.criado.v1': tenantCriadoSchema,
} as const;

export type NomeEvento = keyof typeof registroEventos;
export type PayloadDe<N extends NomeEvento> = z.infer<(typeof registroEventos)[N]>;

export type { ExtratoImportadoV1 } from './extrato-importado';
export type { CupomProcessadoV1 } from './cupom-processado';
export type { TransacoesReconciliadasV1 } from './transacoes-reconciliadas';
export type { TenantCriadoV1 } from './tenant-criado';
