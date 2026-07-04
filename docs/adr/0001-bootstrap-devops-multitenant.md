# ADR 0001 — Bootstrap do Dev OS e migração para SaaS multi-tenant

- **Status:** accepted
- **Data:** 2026-07-04

## Contexto

O "Painel Financeiro" nasceu como um sistema pessoal single-user (uma conta bancária, um
usuário, sem autenticação, deploy único). A decisão de **vender o software** exige repensar a
arquitetura: múltiplos clientes precisam ter seus dados isolados, autenticados e protegidos,
mesmo compartilhando o mesmo banco de dados e o mesmo deploy.

Além disso, o código evoluiu organicamente (rotas/serviços organizados por tecnologia, sem
testes, sem CI de qualidade, sem verificação automática de boundaries ou segurança) — uma
fundação inadequada para um produto que vai operar com dados financeiros de terceiros.

## Decisão

1. **Multi-tenant com RLS.** Toda tabela de dados ganhou `tenant_id` (migration
   `infra/db/migrations/0002_multi_tenant_rls.sql`), com backfill dos dados pré-SaaS para um
   tenant fixo (`00000000-0000-4000-8000-000000000000`). Row-Level Security habilitada em todas
   as tabelas, com policy dupla: isolamento via `current_setting('app.tenant_id')` (caminho da
   aplicação) e via `auth.uid()` (caminho PostgREST/Supabase direto).

2. **Autenticação via Supabase Auth.** JWT HS256 verificado sem SDK externo
   (`shared/security/jwt.ts`, usando só `crypto` nativo — decisão que evita uma dependência de
   runtime a mais). Toda rota `/api/*` passa por `authMiddleware` + `tenantMiddleware`.
   `AUTH_MODE=off` preserva um modo de desenvolvimento local sem auth (nunca em produção).

3. **Self-service signup.** Primeiro login de um usuário sem tenant provisiona um tenant novo
   automaticamente (`domains/tenancy`), publicando `tenant.criado.v1` — consumido pelo domínio
   `categorias` para semear o catálogo padrão. Preferi eventos a acoplamento direto entre
   domínios aqui, seguindo a arquitetura event-driven da Seção 6 do bootstrap.

4. **Reestruturação em DDD/hexagonal.** `src/routes`, `src/services`, `src/middleware`,
   `src/config`, `src/db` (organização por tecnologia) foram substituídos por `domains/<x>/`
   (types, ports, adapters, services, actions, domain/ quando há regra pura, __tests__),
   `shared/` (infra transversal sem regra de negócio) e `infra/db/` (pool + migrations
   versionadas). Oito domínios: tenancy, contas, extrato, cupons, categorias, transacoes,
   reconciliacao, dashboard.

5. **Fundação de Dev OS.** `scripts/verify-rules.js` (tamanho de arquivo, segredos em cliente,
   migrations sem tenant_id/RLS/policy, boundaries cross-domain, ciclos, lembrete de STATUS.md)
   e `scripts/generate.js` (domain, migration, action, event, worker, sync-skills), hooks
   versionados via lefthook, CI (`ci.yml`) com lint/typecheck/testes/build/gitleaks.

6. **Dependências aprovadas** (consentimento explícito do usuário): `zod` (validação de env e
   eventos), `pino` (logs estruturados) como runtime; `eslint`, `lefthook`, `vitest`,
   `@vitest/coverage-v8`, `supertest`, `typescript-eslint` como tooling de dev. `multer`
   atualizado de 1.x para 2.x (CVEs conhecidas na major anterior).

## Consequências / Gotchas

- **TLS do banco ficou mais estrito.** O código anterior conectava ao Postgres com
  `rejectUnauthorized: false` incondicionalmente. O novo padrão exige certificado válido
  (`DATABASE_SSL_REJECT_UNAUTHORIZED=true`), o que **quebrou a conexão local** até o CA correto
  do Supabase ser configurado em `DATABASE_CA_CERT` — ver `docs/RUNBOOK.md`.
- **`app.js` (frontend) foi modularizado** em `app.js` (orquestração), `charts.js` (Chart.js),
  `login-ui.js` (tela de login) e `categoria-select.js` (helper de UI compartilhado) para caber
  no limite de 500 linhas líquidas — o arquivo original já nascia acima do limite (546 linhas).
- **Cobertura de testes:** thresholds de 80% (linhas/statements/functions) e 70% (branches) em
  `vitest.config.ts`, escopados a `domain/`, `services/` e `shared/security/` — a parte
  realisticamente unit-testável sem um Postgres real. Serviços foram testados com fakes dos
  `ports/`, aproveitando a própria arquitetura hexagonal.
- **Ciclos intra-domínio são permitidos.** `check-circular-deps.js` ignora o padrão
  `domains/x/index.ts` ↔ `domains/x/actions/*.ts` (barrel que injeta o service wireado no
  router) — é um detalhe de implementação de um domínio, não a violação de boundary que a
  Seção 6 do bootstrap mira (cross-domain).
