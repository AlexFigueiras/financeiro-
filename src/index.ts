/**
 * Entry point para servidor tradicional (Render, Railway, VPS, local).
 * No Vercel, quem sobe a aplicação é api/index.ts (modelo serverless) —
 * este arquivo não é executado lá.
 */
import { criarApp } from './app';
import { env } from './config/env';
import { reconciliarSeguro } from './services/reconciliacao';

const app = criarApp();

/**
 * CRON: roda o motor de reconciliação a cada SYNC_INTERVAL_MINUTES como rede
 * de segurança (o disparo principal acontece após cada upload de OFX/cupom).
 * Só faz sentido num processo de vida longa — não é usado no Vercel.
 */
function iniciarCron(): void {
  const intervaloMs = Math.max(env.syncIntervalMinutes, 5) * 60 * 1000;
  const rodada = () => reconciliarSeguro('cron');
  setInterval(rodada, intervaloMs);
  setTimeout(rodada, 10_000);
  console.log(`[cron] reconciliação agendada a cada ${env.syncIntervalMinutes} min.`);
}

app.listen(env.port, () => {
  console.log(`Servidor financeiro em http://localhost:${env.port}`);
  console.log(`Dashboard:            http://localhost:${env.port}/`);
  iniciarCron();
});
