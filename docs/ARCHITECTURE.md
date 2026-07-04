# ARCHITECTURE — visão macro

## Estilo

Monólito modular, DDD + hexagonal (Ports & Adapters), multi-tenant por linha (`tenant_id` + RLS),
event-driven internamente via bus in-process. Backend Node.js/TypeScript/Express, SQL puro
(`pg`, sem ORM), frontend vanilla JS servido estático.

## Domínios e dependências

```
                     ┌──────────────┐
                     │   tenancy    │  (resolve/provisiona tenant)
                     └──────┬───────┘
                            │ publica: tenant.criado.v1
                            ▼
                     ┌──────────────┐
                     │  categorias  │  (consome tenant.criado.v1 → seed)
                     └──────────────┘
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────┐
│    contas    │    │   extrato    │     │    cupons    │
└──────────────┘    └──────┬───────┘     └──────┬───────┘
                            │ publica: extrato.importado.v1
                            │                    │ publica: cupom.processado.v1
                            ▼                    ▼
                     ┌──────────────────────────────┐
                     │       reconciliacao          │
                     └──────────────┬───────────────┘
                                    │ publica: transacoes.reconciliadas.v1
                                    ▼
                          ┌──────────────────┐
                          │   transacoes      │ (read/write de lançamentos)
                          └──────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │    dashboard      │ (read model — lê tabelas direto)
                          └──────────────────┘
```

Nenhum domínio importa a lógica interna de outro — apenas o `index.ts` público (quando precisa) ou
eventos (`events/registry.ts`). `dashboard` é a única exceção: por ser um read model puro (CQRS),
lê as tabelas de outros domínios diretamente via SQL, sem executar regra de negócio alheia.

## Fluxo de uma requisição autenticada

```
HTTP → tracingMiddleware (request id) → authMiddleware (JWT → req.auth)
     → tenantMiddleware (resolve/provisiona tenant → req.tenantId)
     → router do domínio → service → port → adapter (Postgres/Gemini)
     → errorHandler (AppError → JSON; erro não tratado → log + 500)
```

`/api/health`, `/api/health/ready` e `/api/config` ficam **fora** de auth/tenant (usados por
probes de infraestrutura e pelo bootstrap do frontend antes do login).

## Multi-tenancy e RLS

Duas camadas de isolamento, redundantes de propósito (defesa em profundidade):

1. **Aplicação:** toda query passa `tenant_id` explicitamente nos parâmetros, e escritas usam
   `withTenantTransaction` (`infra/db/pool.ts`), que executa
   `SELECT set_config('app.tenant_id', $1, true)` antes da transação — a policy
   `p_isolamento_app` usa esse valor.
2. **Supabase/PostgREST direto:** policy `p_membro_tenant`, baseada em `auth.uid()` e na tabela
   `tenant_members` — protege o acesso caso alguém bata na API REST automática do Supabase com
   a anon key, ignorando o backend Express.

## Eventos

Bus in-process (`events/bus.ts`) — síncrono, contratos versionados em Zod (`events/registry.ts`).
`publicar()` valida o payload contra o schema antes de notificar assinantes; falha de um
assinante é logada e **não** propaga ao publicador. Estratégia de evolução: quando o volume
justificar, o bus pode virar SQS/Kafka/NATS sem reescrever os domínios — só o transporte muda.

## Observabilidade

- `shared/observability/tracing.ts` — `AsyncLocalStorage` com `request_id`/`user_id`/`tenant_id`
  propagado a todo log da requisição, sem passar parâmetro nenhum manualmente.
- `shared/observability/logger.ts` — `pino`, logs JSON estruturados.
- `shared/observability/audit.ts` — trilha durável (`audit_log`) para eventos sensíveis
  (provisionamento de tenant, etc.), com fallback de log se a escrita falhar.
- `shared/observability/metrics.ts` — contadores/histogramas em memória, expostos em
  `/api/metrics` (diagnóstico; não é Prometheus real ainda).
- `shared/observability/health.ts` — liveness (`/api/health`) e readiness (`/api/health/ready`,
  testa conexão com o banco).

## Frontend

Vanilla JS sem bundler, para manter o deploy simples. Módulos por responsabilidade:
`app.js` (orquestração), `auth.js` (cliente REST do Supabase Auth), `login-ui.js` (tela de
login/logout), `charts.js` (Chart.js), `categoria-select.js` (helper de UI reaproveitado em duas
telas). `demo-data.js` alimenta um modo de demonstração no GitHub Pages, sem backend.
