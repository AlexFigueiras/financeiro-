import express from 'express';
import path from 'path';
import { env } from './shared/config/env';
import { tracingMiddleware } from './shared/observability/tracing';
import { authMiddleware } from './shared/security/auth-middleware';
import { tenantMiddleware } from './shared/security/tenant-middleware';
import { errorHandler } from './shared/errors/error-handler';
import { liveness, readiness } from './shared/observability/health';
import { snapshot } from './shared/observability/metrics';
import { registrarListenerSeedCategorias } from './domains/categorias';
import { contasRouter } from './domains/contas';
import { extratoRouter } from './domains/extrato';
import { cuponsRouter } from './domains/cupons';
import { transacoesRouter } from './domains/transacoes';
import { reconciliacaoRouter } from './domains/reconciliacao';
import { dashboardRouter } from './domains/dashboard';

// Assinantes de eventos são registrados uma única vez, no bootstrap do app.
registrarListenerSeedCategorias();

/**
 * Cria a aplicação Express, sem chamar listen() nem iniciar o cron — para
 * poder ser reaproveitada tanto por um servidor tradicional (src/index.ts)
 * quanto por uma função serverless (api/index.ts, usada pelo Vercel).
 */
export function criarApp() {
  const app = express();

  app.use(tracingMiddleware);
  app.use(express.json({ limit: '1mb' }));

  // Health checks ficam FORA de auth/tenant (usados por probes/monitoramento).
  app.get('/api/health', liveness);
  app.get('/api/health/ready', readiness);
  app.get('/api/metrics', (_req, res) => res.json(snapshot()));

  /**
   * Config pública do frontend: authMode + credenciais PÚBLICAS do Supabase
   * (a anon key é feita para rodar no navegador — protegida pelas policies de
   * RLS, nunca pela obscuridade). Nenhum segredo de servidor sai por aqui.
   */
  app.get('/api/config', (_req, res) => {
    if (env.authMode === 'off') {
      res.json({ authMode: 'off' });
      return;
    }
    res.json({ authMode: 'supabase', supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey });
  });

  // Lei 7.5 (menor privilégio): toda rota de negócio exige identidade + tenant resolvido.
  app.use('/api', authMiddleware, tenantMiddleware);

  app.use('/api/contas', contasRouter);
  app.use('/api/transacoes', transacoesRouter, reconciliacaoRouter);
  app.use('/api/extrato', extratoRouter);
  app.use('/api/cupons', cuponsRouter);
  app.use('/api/dashboard', dashboardRouter);

  // Frontend estático (dashboard) — só relevante fora do Vercel, que já serve
  // public/ diretamente como assets estáticos antes de chegar à função.
  app.use(express.static(path.resolve(__dirname, '../public')));

  app.use(errorHandler);

  return app;
}

export default criarApp();
