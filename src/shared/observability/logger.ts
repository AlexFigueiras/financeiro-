/**
 * Logs estruturados (JSON) com trace/correlation id automático.
 * Todo log emitido dentro de uma requisição carrega request_id/user/tenant
 * do contexto de tracing — sem que os domínios precisem passar nada.
 */
import pino from 'pino';
import { env } from '../config/env';
import { contextoAtual } from './tracing';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { app: 'financeiro' },
  mixin() {
    const ctx = contextoAtual();
    return ctx
      ? { request_id: ctx.requestId, user_id: ctx.userId, tenant_id: ctx.tenantId }
      : {};
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

/** Logger com escopo nomeado (ex.: logger de um domínio ou serviço). */
export function loggerDe(escopo: string) {
  return logger.child({ escopo });
}

let avisouAuthOff = false;
/** Warning alto e único quando o sistema sobe sem autenticação (dev). */
export function avisarModoSemAuth(): void {
  if (avisouAuthOff) return;
  avisouAuthOff = true;
  if (env.authMode === 'off') {
    logger.warn(
      'AUTH_MODE=off — API SEM autenticação, operando como tenant de desenvolvimento. ' +
        'NUNCA use este modo em produção.'
    );
  }
}
