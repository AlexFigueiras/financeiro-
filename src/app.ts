import express from 'express';
import path from 'path';
import { pool } from './db/pool';
import { errorHandler } from './middleware/errorHandler';
import { contasRouter } from './routes/contas';
import { transacoesRouter } from './routes/transacoes';
import { extratoRouter } from './routes/extrato';
import { cuponsRouter } from './routes/cupons';
import { dashboardRouter } from './routes/dashboard';

/**
 * Cria a aplicação Express, sem chamar listen() nem iniciar o cron — para
 * poder ser reaproveitada tanto por um servidor tradicional (src/index.ts)
 * quanto por uma função serverless (api/index.ts, usada pelo Vercel).
 */
export function criarApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

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

  // Frontend estático (dashboard) — só relevante fora do Vercel, que já serve
  // public/ diretamente como assets estáticos antes de chegar à função.
  app.use(express.static(path.resolve(__dirname, '../public')));

  app.use(errorHandler);

  return app;
}

export default criarApp();
