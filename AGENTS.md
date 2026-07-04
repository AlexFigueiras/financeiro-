# AGENTS.md — fonte única da verdade

> Este arquivo é a fonte canônica de regras do projeto **Painel Financeiro** (SaaS de controle
> financeiro pessoal e reconciliação bancária, multi-tenant). Toda IA (Claude, Gemini, Cursor,
> Windsurf...) que trabalhar neste repositório **obedece integralmente** ao que está aqui.
> `CLAUDE.md` e `GEMINI.md` são apenas ponteiros — a verdade mora só neste arquivo.

---

## 0. LEIA ISTO PRIMEIRO

1. **`docs/STATUS.md`** — o que já está pronto, parcial ou a fazer. **Não reconstrua o que está ✅.**
2. **`docs/DECISIONS.md`** — histórico de decisões arquiteturais e gotchas descobertos.
3. O `CONTEXT.md` do domínio que você vai tocar (mapa na Seção 4 abaixo).

Sem ler o STATUS antes de propor/implementar uma feature, a tarefa é considerada incompleta.

---

## 1. VISÃO E PRINCÍPIOS OPERACIONAIS

**O que o sistema faz:** centraliza transações bancárias (extrato OFX ou PDF/imagem lido por IA),
extrai itens de cupons fiscais via OCR (Google Gemini) e reconcilia automaticamente cada cupom
com a transação correspondente — por **tenant** (cada cliente do SaaS tem seus dados isolados).

**Princípios:**
- **Boundaries explícitos > convenção implícita.** Toda regra é verificável por máquina
  (`scripts/verify-rules.js`), não confiada à memória de quem editou.
- **Automação é a única regra que sobrevive.** Toda lei tem um *enforcer* (verify-rules + CI).
- **Contexto local junto do código.** Cada domínio tem seu `CONTEXT.md`. Leia antes de tocar.
- **Determinismo por scaffolding.** `migrations`, `domains`, `events`, `workers` e `actions`
  nascem de `node scripts/generate.js <tipo>`, nunca escritos à mão do zero.
- **Fail-fast e observável.** O sistema falha cedo, alto e com rastro auditável.
- **Estado visível > estado implícito.** `docs/STATUS.md` é a foto de "onde estamos".

---

## 2. PROTOCOLO MULTIAGENTE (INVIOLÁVEL PARA IAs)

### 2.1. Registro de decisões obrigatório
Toda tarefa que implemente uma rota, altere regra de negócio, mude um contrato, resolva um bug
não-trivial ou tome uma decisão arquitetural **deve** adicionar uma entrada datada no topo de
`docs/DECISIONS.md` (formato ADR resumido — ver `docs/DECISIONS.md` para o template).

### 2.2. Geração obrigatória por CLI
Proibido criar manualmente do zero: `migrations`, `actions`/handlers, `events`, `workers`, novos
`domains`. Use sempre:
```
node scripts/generate.js <tipo> [args]
```
(tipos: `domain`, `migration`, `action`, `event`, `worker`, `sync-skills` — ver `scripts/generate.js`).
Pode editar o arquivo gerado; a base padronizada vem do gerador.

### 2.3. Poluição zero
Arquivos temporários, mocks de teste descartáveis e rascunhos criados durante uma tarefa devem
ser deletados antes da conclusão. Rascunhos que precisem persistir vão para `/scratch/` (gitignored).

### 2.4. Guardrails de dependência
**Nunca** rode `npm install`/`npm add` para dependências de runtime ou novas libs sem consentimento
explícito e prévio do humano. Nova dependência exige aprovação **e** registro em `docs/DECISIONS.md`.

### 2.5. Mudança de schema é evento de primeira classe
Nenhuma alteração de banco fora de uma migration gerada (`node scripts/generate.js migration <tabela>`).
Nada de "ALTER manual no console". Toda migration passa pelo `verify-rules` (tenant_id, RLS, policy).

### 2.6. Pare-e-pergunte
Interrompa e consulte o humano quando precisar: violar uma Lei de Segurança (Seção 7), introduzir
dependência nova, quebrar contrato público de domínio, ou tomar decisão arquitetural irreversível.

### 2.7. Estado é de primeira classe — ler ANTES, atualizar DEPOIS
Antes de propor/implementar qualquer feature, leia `docs/STATUS.md`. Se a feature aparece ✅,
abra os arquivos apontados e parta do que já existe — **nunca reconstrua do zero**. Ao concluir ou
alterar uma feature, atualize a linha correspondente no `STATUS.md` **na mesma tarefa**, junto com
a entrada em `DECISIONS.md`. Sem isso, a tarefa está incompleta. `verify-rules` emite um warning
(nunca bloqueia) quando há mudança em `domains/`/migrations sem toque em `STATUS.md`.

---

## 3. TOPOLOGIA DO REPOSITÓRIO

```
AGENTS.md                  fonte única da verdade (este arquivo)
CLAUDE.md  GEMINI.md        ponteiros → @AGENTS.md
README.md  CONTRIBUTING.md  onboarding
lefthook.yml                hooks versionados (pre-commit, commit-msg)
docs/
  STATUS.md                 mapa de estado por feature — 1ª leitura
  DECISIONS.md               log vivo de decisões (ADR resumido)
  adr/0001-bootstrap.md      ADR completo do bootstrap desta fundação
  ARCHITECTURE.md            visão macro + diagrama de domínios/eventos
  RUNBOOK.md                 operação, deploy, incidentes
domains/                     ❤️ LÓGICA DE NEGÓCIO (ver mapa abaixo)
  <dominio>/
    CONTEXT.md                playbook local
    index.ts                  API PÚBLICA — única porta de entrada
    types.ts  ports/  adapters/  services/  actions/  __tests__/  domain/ (se houver regra pura)
events/                      contratos de eventos compartilhados (registry.ts + <nome>.ts)
shared/                      infra transversal SEM regra de negócio
  config/env.ts               validação de env (Zod, fail-fast)
  observability/              logger, tracing, metrics, audit, health
  security/                   auth-middleware, tenant-middleware, jwt
  errors/                     AppError, asyncHandler, errorHandler
infra/db/                    pool Postgres + migrate.ts (runner de migrations)
infra/db/migrations/         SQL versionado, gerado por scripts/generate.js migration
app.ts  index.ts             wiring (Express, cron) — SEM regra de negócio
api/index.ts                 entry point serverless (Vercel)
worker/                      jobs em background — só wiring, SEM regra
scripts/
  generate.js  verify-rules.js  lib/
public/                      frontend (vanilla JS/HTML/CSS + Chart.js)
.claude/skills/  .gemini/skills/   SKILL.md sincronizado de cada CONTEXT.md
```

**Regra de dependência (hexagonal):** `actions → services → domain (puro)`; `services` fala com o
mundo só via `ports/`; `adapters/` implementam as `ports`. **Tecnologia ≠ negócio**: `app.ts`,
`worker/`, `infra/` só fazem *wiring* — toda regra mora em `domains/`.

### Mapa de contexto

| Domínio | Responsabilidade | CONTEXT.md |
|---|---|---|
| `tenancy` | Resolve/provisiona o tenant do usuário autenticado | `domains/tenancy/CONTEXT.md` |
| `contas` | CRUD de contas bancárias | `domains/contas/CONTEXT.md` |
| `extrato` | Ingestão de extrato (OFX ou OCR de PDF/imagem) | `domains/extrato/CONTEXT.md` |
| `cupons` | OCR de cupom fiscal + itens | `domains/cupons/CONTEXT.md` |
| `categorias` | Catálogo de categorias de gasto | `domains/categorias/CONTEXT.md` |
| `transacoes` | Listagem + categorização de lançamentos | `domains/transacoes/CONTEXT.md` |
| `reconciliacao` | Motor de match cupom ↔ transação | `domains/reconciliacao/CONTEXT.md` |
| `dashboard` | KPIs e agregações (read model) | `domains/dashboard/CONTEXT.md` |

### Boundaries entre domínios
Proibido import direto entre domínios que não seja pelo `index.ts` público (enforced por
`scripts/lib/check-domain-boundaries.js`). Comunicação preferencial: eventos (`events/registry.ts`).
Exceção documentada: `dashboard` lê tabelas de outros domínios via SQL direto (read model/CQRS),
nunca importa a lógica interna de outro domínio.

---

## 4. PADRÕES DE QUALIDADE

- Arquivos de código **> 500 linhas líquidas = proibido** (falha `verify-rules`); **> 300 = warning**.
  Baseline/ratchet para débito legado em `scripts/lib/file-size-baseline.json`.
- Sem arquivos "Deus": tipos/schemas/regras/helpers em arquivos isolados.
- Responsabilidade única por módulo.
- `strict: true` no TypeScript; erros de tipo falham o build.
- Componentes de frontend acima de ~150 linhas ou múltiplas responsabilidades: extrair.

---

## 5. LEIS DE SEGURANÇA GLOBAIS (INVIOLÁVEIS)

1. **Multi-tenant:** toda tabela de dados tem `tenant_id`, exceto allowlist global (`tenants`,
   `schema_migrations`). `verify-rules` falha se uma migration criar tabela sem isso.
2. **RLS:** toda tabela com dado de tenant tem Row-Level Security habilitada + ≥1 policy.
3. **Credenciais nunca no cliente:** proibido em `public/**` qualquer `SERVICE_ROLE_KEY`,
   `createAdminClient`, chave admin. A `SUPABASE_ANON_KEY` é a única credencial servida ao
   navegador (via `/api/config`) — é pública por design, protegida pelas policies de RLS.
4. **Segredos:** `.env*` gitignored (exceto `.env.example`); validação de env em boot
   (`shared/config/env.ts`, Zod); secret scanning no CI (gitleaks).
5. **Menor privilégio:** toda rota `/api/*` exige `authMiddleware` + `tenantMiddleware`
   (Bearer JWT do Supabase Auth), exceto `/api/health*` e `/api/config`. `AUTH_MODE=off` existe
   só para dev local single-user e **nunca** deve ser usado em produção.
6. **TLS do banco:** `DATABASE_SSL_REJECT_UNAUTHORIZED=true` por padrão — a conexão valida o
   certificado do Postgres. Desligar exige `DATABASE_CA_CERT` configurado ou decisão explícita
   documentada em `DECISIONS.md`.

---

## 6. COMO RODAR E VERIFICAR

```bash
npm install                    # instala dependências (lockfile congelado no CI)
npm run dev                     # servidor local com hot-reload (AUTH_MODE=off por padrão em dev)
npm run db:migrate              # aplica infra/db/migrations/*.sql (idempotente)

npm run lint                    # eslint
npm run typecheck                # tsc --noEmit
npm test                        # vitest run
npm run test:coverage            # vitest run --coverage (thresholds em vitest.config.ts)
npm run verify-rules             # análise estática do Dev OS (boundaries, RLS, tamanho, secrets)

npm run generate domain <nome>              # novo domínio completo
npm run generate migration <tabela>          # nova migration com tenant_id/RLS/policy
npm run generate action <dominio> <nome>     # nova rota num domínio existente
npm run generate event <nome>                # novo contrato de evento
npm run generate worker <nome>               # novo worker em background
npm run generate sync-skills                 # CONTEXT.md → .claude/.gemini skills
```

Pre-commit (lefthook): `verify-rules` + `typecheck` + `lint` + `sync-skills`. Commit-msg valida
Conventional Commits. CI (`.github/workflows/ci.yml`) roda os mesmos checks + testes + build +
gitleaks — é o gate real (hooks locais são burláveis com `--no-verify`).

---

## 7. STACK ADAPTER

| Lei universal | Nesta stack |
|---|---|
| Runtime | Node.js 22, TypeScript strict, Express |
| Banco | PostgreSQL (Supabase), SQL puro via `pg` — sem ORM |
| Migrations | SQL versionado em `infra/db/migrations/`, runner próprio (`infra/db/migrate.ts`) |
| Auth | Supabase Auth (JWT HS256 verificado sem SDK extra, `shared/security/jwt.ts`) |
| Multi-tenant | `tenant_id` em toda tabela + RLS via `current_setting('app.tenant_id')` e `auth.uid()` |
| Eventos | Bus in-process (`events/bus.ts`), contratos Zod versionados (`events/registry.ts`) |
| Observabilidade | `pino` (logs JSON), `AsyncLocalStorage` (trace/request id), audit_log (Postgres) |
| Testes | Vitest — unit puro em `domain/`, services com fakes de `ports/` |
| CI/CD | GitHub Actions (`ci.yml`) + Dependabot + gitleaks |
| Deploy | Vercel (serverless, `api/index.ts`) ou servidor tradicional (`src/index.ts` + cron) |
