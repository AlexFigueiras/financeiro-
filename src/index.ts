import express from 'express';
import path from 'path';
import { env } from './config/env';
import { pool } from './db/pool';
import { errorHandler } from './middleware/errorHandler';
import { contasRouter } from './routes/contas';
import { transacoesRouter } from './routes/transacoes';
import { extratoRouter } from './routes/extrato';
import { cuponsRouter } from './routes/cupons';
import { dashboardRouter } from './routes/dashboard';
import { reconciliarSeguro } from './services/reconciliacao';

const app = express();

app.use(express.json({ limit: '1mb' }));

// API
app.use('/api/contas', contasRouter);
app.use('/api/transacoes', transacoesRouter);
app.use('/api/extrato', extratoRouter);
app.use('/api/cupons', cuponsRouter);
app.use('/api/dashboard', dashboardRouter);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', banco: 'conectado' });
  } catch (err) {
    res.status(503).json({ status: 'degradado', banco: (err as Error).message });
  }
});

// Frontend estático (dashboard)
app.use(express.static(path.resolve(__dirname, '../public')));

app.use(errorHandler);

/**
 * CRON: roda o motor de reconciliação a cada SYNC_INTERVAL_MINUTES como rede
 * de segurança (o disparo principal acontece após cada upload de OFX/cupom).
 * Falhas são logadas sem derrubar o processo.
 */
function iniciarCron(): void {
  const intervaloMs = Math.max(env.syncIntervalMinutes, 5) * 60 * 1000;
  const rodada = () => reconciliarSeguro('cron');
  setInterval(rodada, intervaloMs);
  // primeira rodada 10s após o boot, sem bloquear o start do servidor
  setTimeout(rodada, 10_000);
  console.log(`[cron] reconciliação agendada a cada ${env.syncIntervalMinutes} min.`);
}

app.listen(env.port, () => {
  console.log(`Servidor financeiro em http://localhost:${env.port}`);
  console.log(`Dashboard:            http://localhost:${env.port}/`);
  iniciarCron();
});
