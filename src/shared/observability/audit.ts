/**
 * Trilha de auditoria para eventos sensíveis (Seção 8 do Dev OS).
 * Grava em audit_log (durável, por tenant) E emite log estruturado.
 * Nunca propaga erro: auditoria falhando não pode derrubar a operação
 * (mas falha ALTO no log para ser vista).
 */
import { pool } from '../../infra/db/pool';
import { contextoAtual } from './tracing';
import { loggerDe } from './logger';

const log = loggerDe('audit');

export interface EventoAuditoria {
  acao: string; // ex.: 'cupom.processado', 'extrato.importado', 'transacao.recategorizada'
  recurso?: string; // ex.: 'cupom:42'
  detalhes?: Record<string, unknown>;
}

export async function auditar(evento: EventoAuditoria): Promise<void> {
  const ctx = contextoAtual();
  log.info({ audit: true, ...evento });
  try {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, acao, recurso, detalhes, request_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ctx?.tenantId ?? null,
        ctx?.userId ?? null,
        evento.acao,
        evento.recurso ?? null,
        JSON.stringify(evento.detalhes ?? {}),
        ctx?.requestId ?? null,
      ]
    );
  } catch (err) {
    log.error({ err: (err as Error).message, evento }, 'falha ao gravar auditoria durável');
  }
}
