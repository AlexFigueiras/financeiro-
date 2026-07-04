# Painel Financeiro — SaaS de Controle Financeiro e Reconciliação Bancária

SaaS multi-tenant que centraliza transações bancárias (extrato em **OFX** ou em **PDF/imagem**
lido por IA), extrai itens de **cupons fiscais/NFC-e por IA (Gemini)** e reconcilia
automaticamente cada cupom com a transação bancária correspondente — por tenant, com dados
isolados via Row-Level Security.

> Arquitetura, protocolo de contribuição e Leis de Segurança inegociáveis estão em
> [`AGENTS.md`](AGENTS.md) — leia antes de mexer no código. Estado por feature em
> [`docs/STATUS.md`](docs/STATUS.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22 + TypeScript (strict) + Express, organizado por domínio (DDD/hexagonal) |
| Banco | PostgreSQL / Supabase — SQL puro via `pg`, multi-tenant com RLS |
| Auth | Supabase Auth (JWT), verificado no backend sem SDK externo |
| OCR | Google Gemini (`gemini-1.5-flash`, JSON estruturado) |
| Frontend | HTML/CSS/JS vanilla + Chart.js vendorizado (denso, estilo ERP, light/dark), PWA |
| Qualidade | ESLint, Vitest (cobertura), `verify-rules.js` (boundaries/RLS/segredos), CI |

## Subindo o sistema

```bash
# 1. Dependências
npm install

# 2. Configuração
cp .env.example .env
# Preencha DATABASE_URL e GEMINI_API_KEY.
# Para dev local SEM configurar Supabase Auth ainda: AUTH_MODE=off (single-user, sem login).
# Para produção/multi-tenant real: AUTH_MODE=supabase + SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_JWT_SECRET.

# 3. Schema do banco (migrations versionadas, idempotentes)
npm run db:migrate

# 4. Servidor
npm run dev               # desenvolvimento com hot-reload
npm start                  # produção (após npm run build)
```

Dashboard em `http://localhost:3000`. Em `AUTH_MODE=supabase`, a tela de login aparece antes do
painel; o primeiro login de cada usuário provisiona automaticamente o tenant dele (self-service).

## Deploy em produção

### Vercel (serverless — recomendado)
`api/index.ts` exporta a mesma aplicação Express via `src/app.ts`; `vercel.json` reescreve
`/api/*`. Configure as variáveis de ambiente do `.env.example` no painel — **use a connection
string do "Transaction pooler" (porta 6543)** do Supabase, não a conexão direta.

### Render / Railway / VPS (servidor tradicional)
Build `npm install && npm run build`, start `npm start`. O cron de reconciliação por
`setInterval` só roda aqui (processo de vida longa).

Detalhes de operação e troubleshooting: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Arquitetura (visão rápida)

```
domains/            Lógica de negócio, um subdiretório por domínio:
  tenancy              resolve/provisiona o tenant do usuário autenticado
  contas               CRUD de contas bancárias
  extrato              ingestão de extrato (OFX ou OCR de PDF/imagem)
  cupons               OCR de cupom fiscal + itens
  categorias           catálogo de categorias de gasto
  transacoes           listagem + categorização de lançamentos
  reconciliacao        motor de match cupom ↔ transação
  dashboard            KPIs e agregações (read model)
  <dominio>/CONTEXT.md   playbook local; index.ts é a única porta de entrada pública
events/              contratos de eventos (Zod) — comunicação entre domínios
shared/              infra transversal sem regra de negócio (auth, logger, env, errors...)
infra/db/            pool Postgres + migrations versionadas
app.ts  index.ts     wiring do Express + cron
api/index.ts         entry point serverless (Vercel)
public/              frontend (dashboard + login)
scripts/             verify-rules.js (análise estática) + generate.js (scaffolding)
```

Diagrama completo de domínios e eventos: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Modelo de dados

- Toda tabela de dados tem `tenant_id` + Row-Level Security (Lei de Segurança, `AGENTS.md`).
- `contas_bancarias` — saldo mantido por trigger a cada insert/update/delete de transação.
- `transacoes_banco` — `valor` positivo = entrada, negativo = saída; `hash_ofx` único por
  `(tenant_id, hash_ofx)` impede duplicidade em reupload; `cupom_id` é o vínculo do match.
- `cupons_fiscais` / `itens_cupom` — cabeçalho + desmembramento produto a produto.
- `tenants` / `tenant_members` — workspace isolado e vínculo usuário↔tenant.
- Todas as colunas temporais são `TIMESTAMPTZ`; datas sem fuso explícito assumem
  `America/Sao_Paulo`.

### Motor de reconciliação (`fn_reconciliar`)

Roda após cada upload de OFX/cupom (por gatilho). Critérios simultâneos, **por tenant**:

1. `ABS(valor)` da saída bancária **igual centavo por centavo** ao `valor_total` do cupom;
2. `data_transacao` dentro de **±48h** da `data_emissao`;
3. em empate, vence a transação mais próxima no tempo;
4. vínculo **1:1** garantido por índice único parcial.

## API

Toda rota `/api/*` (exceto as três abaixo) exige `Authorization: Bearer <token>` do Supabase Auth
quando `AUTH_MODE=supabase`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Liveness (não toca o banco) |
| GET | `/api/health/ready` | Readiness (testa conexão com o banco) |
| GET | `/api/config` | Config pública do frontend (`authMode`, credenciais públicas do Supabase) |
| GET | `/api/contas` | Lista contas e saldos do tenant |
| POST | `/api/contas` | Cria conta (`{nome, tipo}`) |
| GET | `/api/transacoes?mes=YYYY-MM` | Lista unificada; reconciliadas trazem `itens_cupom` embutidos |
| PATCH | `/api/transacoes/:id/categoria` | Recategoriza lançamento sem cupom (aprende a regra) |
| POST | `/api/transacoes/reconciliar` | Dispara o motor manualmente |
| POST | `/api/extrato/upload-ofx` | multipart `arquivo` (.ofx ou PDF/imagem) [+ `conta_id`] |
| POST | `/api/cupons/upload` | multipart `arquivo` (foto/PDF do cupom → Gemini) |
| GET | `/api/cupons/:id` | Cupom com itens desmembrados |
| GET | `/api/cupons/categorias` | Catálogo de categorias do tenant |
| PATCH | `/api/cupons/itens/:id/categoria` | Recategoriza item de cupom (aprende a regra) |
| GET | `/api/dashboard/resumo?mes=YYYY-MM` | KPIs: saldo, ganhos, gastos, balanço |
| GET | `/api/dashboard/fluxo-diario?mes=YYYY-MM` | Série diária ganhos vs gastos |
| GET | `/api/dashboard/gastos-por-categoria?mes=YYYY-MM` | Distribuição por categoria |

## Segurança

Ver Seção 5 de [`AGENTS.md`](AGENTS.md) para a lista completa das Leis de Segurança
(multi-tenant + RLS, credenciais nunca no cliente, gestão de segredos, menor privilégio, TLS do
banco) e como cada uma é verificada automaticamente por `npm run verify-rules` e pelo CI.

## Contribuindo

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
