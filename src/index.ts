/**
 * Entry point para servidor tradicional (Render, Railway, VPS, local).
 * No Vercel, quem sobe a aplicação é api/index.ts (modelo serverless) —
 * este arquivo não é executado lá.
 */
import { criarApp } from './app';
import { env, DEFAULT_TENANT_ID } from './shared/config/env';
import { reconciliacaoService } from './domains/reconciliacao';
import { logger } from './shared/observability/logger';

const app = criarApp();

/**
 * CRON: roda o motor de reconciliação a cada SYNC_INTERVAL_MINUTES como rede
 * de segurança (o disparo principal acontece após cada upload de OFX/cupom).
 * Só faz sentido num processo de vida longa — não é usado no Vercel.
 * Em AUTH_MODE=off (dev local) usa o tenant único de desenvolvimento; em
 * produção multi-tenant, o cron por tenant fica no RUNBOOK como próximo passo
 * (hoje a reconciliação em produção roda por gatilho, não por polling global).
 */
function iniciarCron(): void {
  if (env.authMode === 'off') {
    const intervaloMs = Math.max(env.syncIntervalMinutes, 5) * 60 * 1000;
    const rodada = () => reconciliacaoService.reconciliarSeguro(env.devTenantId ?? DEFAULT_TENANT_ID, 'cron');
    setInterval(rodada, intervaloMs);
    setTimeout(rodada, 10_000);
    logger.info(`[cron] reconciliação agendada a cada ${env.syncIntervalMinutes} min (tenant de desenvolvimento).`);
  }
}

app.listen(env.port, () => {
  logger.info(`Servidor financeiro em http://localhost:${env.port}`);
  iniciarCron();
});
