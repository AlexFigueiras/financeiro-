# PROJECT OS v3 — BOOTSTRAP ARQUITETURAL UNIVERSAL

> **O que é isto:** um meta-prompt único para inicializar QUALQUER projeto de software com uma fundação arquitetural organizada, segura e pronta para escalar — sustentando colaboração entre humanos e agentes de IA por anos.
>
> **Como usar:** preencha o bloco `## 0. PARÂMETROS DE ENTRADA`, cole tudo no agente (Claude, Gemini, etc.) e execute. Identificadores técnicos permanecem em inglês por convenção. Peça uma versão em inglês se precisar de portabilidade entre times.

---

## LEITURA OBRIGATÓRIA — REGRA DE PRECEDÊNCIA

Este documento define um **sistema operacional de desenvolvimento (Dev OS)**, não apenas um boilerplate. A meta primária **não é gerar código**, é instalar a infraestrutura, as automações e as travas (*guardrails*) que mantêm o projeto saudável conforme cresce.

A ordem de execução é **não-negociável**: nenhuma regra de negócio, tela, endpoint, schema ou integração pode ser escrita antes de a fundação descrita aqui estar criada e validada (`verify-rules` passando, CI configurado, hooks versionados ativos).

Em caso de conflito entre instruções, vale esta hierarquia, do mais forte ao mais fraco:

1. **Leis de Segurança** (Seção 7) — invioláveis, sem exceção.
2. **Regras de Boundary e Arquitetura** (Seções 5 e 6).
3. **Padrões de Qualidade** (Seção 4).
4. **Preferências de estilo** do agente.

Quando uma instrução do usuário colidir com 1–3, o agente **para e avisa** em vez de obedecer silenciosamente.

---

## 0. PARÂMETROS DE ENTRADA

Preencha antes de executar. Se algum campo estiver vazio ou ambíguo, o agente **deve perguntar na Fase 0** antes de criar arquivos — nunca inventar.

```yaml
project_name:            # ex: "Atlas CRM"
description:             # 3–5 linhas: o que o sistema faz e para quem
target_scale:           # ex: "multi-tenant SaaS B2B, ~100 tenants no ano 1"
primary_stack:          # ex: "Next.js 15 (App Router) + TypeScript"
runtime:                # ex: "Node 22" | "Python 3.12" | "Go 1.23"
database:               # ex: "PostgreSQL 16 (Supabase)" | "MySQL" | "MongoDB"
package_manager:        # ex: "pnpm" | "npm" | "uv" | "cargo"
deploy_target:          # ex: "Vercel" | "AWS ECS" | "Fly.io" | "on-prem"
conceptual_architecture:# ex: "Monólito modular com domains/ + worker/ + infra/db"
initial_domains:        # ex: [auth, billing, crm, inventory, scheduling]
multi_tenant:           # true | false
auth_provider:          # ex: "Supabase Auth" | "Clerk" | "custom JWT" | "none"
event_transport:        # ex: "in-process bus (fase 1) → SQS/Kafka (fase 2)"
```

---

## 1. PAPEL E PRINCÍPIOS OPERACIONAIS

Atue **simultaneamente** como: **Principal Software Engineer · Staff Engineer · Software Architect · Platform Engineer · AI Collaboration Architect**.

Princípios que guiam toda decisão (cite-os no `AGENTS.md`):

- **Boundaries explícitos > convenção implícita.** Tudo que for regra deve ser verificável por máquina, não confiado à memória de quem (humano ou IA) editou.
- **Automação é a única regra que sobrevive.** Regra que depende de disciplina humana decai. Por isso toda lei tem um *enforcer* (`verify-rules` + CI).
- **Contexto local junto do código.** Cada módulo crítico carrega seu próprio `CONTEXT.md`. A IA lê o contexto do que vai tocar antes de tocar.
- **Determinismo por scaffolding.** Estruturas repetitivas nascem de geradores, não de improviso — isso elimina variação entre contribuidores.
- **Stack-neutral no núcleo, específico na borda.** As leis são universais; o *como* se adapta à stack escolhida via a tabela de Stack Adapter (Fase 0).
- **Fail-fast e observável.** O sistema falha cedo, alto e com rastro auditável, em vez de degradar silenciosamente.
- **Estado visível > estado implícito.** O que já existe e funciona é registrado em `docs/STATUS.md` (§3.4), não deixado na cabeça de alguém nem na memória privada de um agente. Um colaborador novo sabe "onde estamos" lendo **uma** página.

---

## 2. PROTOCOLO MULTIAGENTE (INVIOLÁVEL PARA IAs)

Estas regras governam como qualquer agente de IA trabalha no repositório. Devem ser transcritas integralmente para o `AGENTS.md`.

### 2.1. Registro de Decisões obrigatório
Toda tarefa concluída que implemente uma rota, altere uma regra de negócio, mude um contrato, resolva um bug não-trivial (*gotcha*) ou tome uma decisão arquitetural **deve** adicionar uma entrada datada no **topo** de `docs/DECISIONS.md`, no formato ADR resumido (ver §3.3). Sem entrada = tarefa incompleta.

### 2.2. Geração obrigatória por CLI
É **proibido** criar manualmente do zero: `migrations`, `server actions`/`handlers`, `jobs`, `workers`, `events`, novos `domains`. Sempre usar:
```
node scripts/generate.js <tipo> [args]
```
O agente pode editar o arquivo gerado, mas a base padronizada vem do gerador.

### 2.3. Poluição Zero
Arquivos temporários, mocks de teste e migrations descartáveis criados durante a tarefa devem ser **deletados antes da conclusão**. Rascunhos que precisem persistir vão apenas para `/scratch/` (que está no `.gitignore`). O workspace final fica limpo.

### 2.4. Guardrails de Dependência
O agente **nunca** roda `npm install` / `pnpm add` / `yarn add` / `pip install` / `cargo add` para adicionar **dependências de runtime ou novas libs** sem consentimento explícito e prévio do humano. 
> Exceção única e auto-autorizada: as ferramentas de tooling da fundação listadas na Fase 1 (linter, formatter, hook manager, dependency-cruiser, etc.), que fazem parte deste bootstrap. Mesmo assim, devem ser listadas no log de decisões.

### 2.5. Mudança de schema é evento de primeira classe
Nenhuma alteração de banco acontece fora de uma migration gerada. Nada de "ALTER manual no console". Toda migration passa pelo `verify-rules` (tenant_id, RLS, policies).

### 2.6. Pare-e-pergunte
O agente interrompe e consulta o humano quando: precisar violar uma Lei de Segurança, introduzir uma dependência nova, quebrar um contrato público de domínio, ou tomar uma decisão arquitetural irreversível.

### 2.7. Estado é de primeira classe — ler ANTES, atualizar DEPOIS
**Antes de propor ou implementar qualquer feature**, o agente lê `docs/STATUS.md` (§3.4). Se a feature aparece como ✅ pronta, ele **abre os arquivos apontados e parte do que já existe — NUNCA reconstrói do zero**. Ao concluir ou alterar uma feature, **atualiza a linha correspondente no `STATUS.md`** (estado + arquivos) na MESMA tarefa, junto com a entrada no `DECISIONS.md`. Sem isso = tarefa incompleta.
> **Por que esta regra existe (lição real):** contexto é "pull" — disponibilizar um arquivo **não força** a leitura. Um agente que só leu regras/padrões (mas não o estado) sugere construir o que já funciona. Por isso o STATUS é a **1ª linha** do protocolo, fica no topo do `AGENTS.md`, e o `verify-rules` emite um **lembrete (warning)** quando há mudança de código sem atualização do STATUS (§9.1).

---

## 3. CONTEXT ENGINE DE 3 CAMADAS

Crie na raiz a ancoragem de contexto que toda IA consome.

### 3.1. `AGENTS.md` — fonte única da verdade
Arquivo canônico. Toda IA obedece. Deve conter, nesta ordem:
1. Visão do projeto + princípios operacionais (Seção 1).
2. Protocolo Multiagente integral (Seção 2).
3. **Ponteiro de PRIMEIRA leitura** para `docs/STATUS.md` (§3.4 — estado por feature) e `docs/DECISIONS.md` (histórico). Deixe explícito: *"leia o STATUS antes de propor/implementar; não reconstrua o que está ✅"*.
4. **Mapa de Contexto** (tabela: domínio → responsabilidade → caminho do `CONTEXT.md`).
5. Topologia do repositório (Seção abaixo) com a regra "infra não contém regra de negócio".
6. Padrões de Qualidade (Seção 4).
7. Leis de Segurança invioláveis (Seção 7).
8. **Como rodar e verificar**: comandos de dev, lint, typecheck, test, `verify-rules`, `generate`.
9. Stack Adapter preenchido (Fase 0).

### 3.2. Ponteiros por ferramenta
Crie na raiz, contendo **apenas** a referência à fonte canônica:
- `CLAUDE.md` → conteúdo: `@AGENTS.md`
- `GEMINI.md` → conteúdo: `@AGENTS.md`
- (opcional, se aplicável) `.cursorrules`, `.windsurfrules` → `@AGENTS.md`

Assim há **uma** verdade e N ponteiros — nunca documentação duplicada que diverge.

### 3.3. `docs/DECISIONS.md` + `docs/adr/`
Log vivo de decisões. Crie `docs/` e o arquivo. Entradas no topo, formato ADR resumido:

```md
## [YYYY-MM-DD] <título curto da decisão>
- **Status:** accepted | superseded by #NNNN
- **Contexto:** que problema/força gerou a decisão
- **Decisão:** o que foi decidido
- **Arquivos impactados:** caminhos
- **Consequências / Gotchas:** trade-offs e armadilhas descobertas
```

Decisões estruturais maiores ganham um ADR próprio numerado em `docs/adr/NNNN-titulo.md` (formato completo: Context / Decision / Consequences / Status). A **primeira entrada** registra, com a data de hoje, o setup desta arquitetura.

### 3.4. `docs/STATUS.md` — mapa de ESTADO por feature (a foto de "onde estamos")

**Problema que resolve:** `DECISIONS.md` é **histórico** (decisões em ordem cronológica) e os `CONTEXT.md`/skills ensinam **como** fazer — mas nenhum responde, de relance, **"o que já está pronto vs. o que falta"**. Sem essa foto, um agente novo lê regras e padrões, não enxerga o estado, e **sugere reconstruir features que já funcionam**. Este foi um furo real do Dev OS: o container de contexto existia, mas o **estado** nunca era escrito num lugar discoverable.

**Crie `docs/STATUS.md`**: uma foto viva do estado de cada feature/módulo, com ponteiro para o código. É a **PRIMEIRA leitura** de qualquer agente (§2.7 e DoR §16) e o `AGENTS.md` aponta para ela no topo.

Template:
```md
# STATUS — o que está pronto, parcial ou a fazer
> LEIA ISTO PRIMEIRO (antes de propor/implementar qualquer feature).
> Estado por feature. Histórico do *porquê* fica em DECISIONS.md; visão do produto, no plano.
> Legenda: ✅ pronto/funcionando · 🟡 parcial · ⬜ a fazer · 🚫 fora de escopo
> Última auditoria: AAAA-MM-DD

| Feature / fluxo | Estado | Onde (código) | Notas / decisão |
|---|---|---|---|
| <feature de usuário ou fluxo> | ✅/🟡/⬜ | `caminho/arquivos-chave` | gotcha, link p/ entrada do DECISIONS |
```

Regras de uso:
- **Greenfield (projeto do zero):** começa quase tudo ⬜; cada feature concluída vira ✅ na MESMA tarefa que a entrega (faz parte do DoD).
- **Brownfield (adotando o Dev OS em código que já existe):** a **1ª tarefa** é **AUDITAR o código** (varrer rotas/handlers/migrations + `grep` das integrações) e **backfillar** o STATUS — promovendo para o repo o que só vivia na memória privada de um agente ou na cabeça de alguém. Marque ✅ **apenas o que você confirmou no código**; na dúvida, 🟡/⬜ (um STATUS impreciso é pior que ausente).
- **Granularidade:** uma linha por feature de usuário ou fluxo de negócio — não por arquivo.
- **Papéis distintos:** STATUS = *estado* · DECISIONS = *histórico/porquê* · plano/visão = *o produto* · CONTEXT/skills = *como fazer*. Não os funda.
- **Enforcement:** o `verify-rules` tem um check (warning) que lembra de atualizar o STATUS quando há mudança de código sem atualização dele (§9.1).

---

## 4. PADRÕES DE QUALIDADE (verificáveis por máquina)

- **Limite de linhas — regra única e consistente:**
  - `> 300 linhas` (código líquido, ignorando comentários e linhas em branco) = **alerta** (warning no `verify-rules`).
  - `> 500 linhas` = **proibido** (falha o `verify-rules` com exit 1).
  - Ao atingir o limite: modularizar — extrair componentes, serviços, hooks, schemas e tipos para arquivos próprios.
- **Componentes visuais:** acima de ~150 linhas ou com mais de uma responsabilidade, extrair subcomponentes locais.
- **Sem arquivos "Deus":** tipos, schemas (Zod/Pydantic), regras e helpers moram em arquivos isolados (`types.ts`, `schema.ts`, `utils.ts`). Proibido concentrar tudo num só.
- **Responsabilidade Única:** cada módulo tem um propósito declarável em uma frase. Se precisa de "e" para descrever, divida.
- **Sem `any` implícito / tipagem fraca** (em stacks tipadas): `strict` ligado; erros de tipo falham o build.

> Os próprios `scripts/generate.js` e `scripts/verify-rules.js` devem respeitar estes limites: se crescerem, quebram em `scripts/lib/`. O Dev OS pratica o que prega.
>
> **Adoção em código legado (brownfield):** arquivos que já nascem acima do limite entram num **baseline (catraca/ratchet)** — viram *warning* (não falham) mas **não podem CRESCER** além do valor registrado; arquivos novos seguem 300/500 normalmente. Assim a regra entra **sem quebrar** um sistema em produção, e a dívida só diminui. O baseline mora em `scripts/lib/file-size-baseline.json` e é reduzido conforme os arquivos são modularizados.

---

## 5. ARQUITETURA POR DOMÍNIO (DDD + Hexagonal)

A organização **primária** do sistema é por **domínio de negócio**, não por tecnologia.

### 5.1. Topologia do repositório

```
<project-root>/
├── AGENTS.md                      # fonte única da verdade (toda IA lê primeiro)
├── CLAUDE.md  GEMINI.md           # ponteiros → @AGENTS.md
├── README.md  CONTRIBUTING.md  CHANGELOG.md
├── .env.example  .gitignore  .editorconfig
├── lefthook.yml                   # hooks VERSIONADOS (ver Seção 9)
├── package.json | pyproject.toml  # conforme stack
│
├── docs/
│   ├── STATUS.md                  # 📍 mapa de ESTADO por feature (✅/🟡/⬜) — 1ª leitura
│   ├── DECISIONS.md               # log vivo (entradas estilo ADR)
│   ├── adr/0001-bootstrap.md      # ADRs numerados
│   ├── ARCHITECTURE.md            # visão macro + diagramas
│   └── RUNBOOK.md                 # operação / incidentes
│
├── domains/                       # ❤️ LÓGICA DE NEGÓCIO
│   └── <domain>/
│       ├── CONTEXT.md             # playbook local do domínio
│       ├── index.ts               # API PÚBLICA — única porta de entrada do domínio
│       ├── types.ts
│       ├── schema.ts              # validação (Zod / Pydantic / ...)
│       ├── domain/                # entidades + regras PURAS (zero I/O)
│       ├── services/              # casos de uso / orquestração
│       ├── ports/                 # interfaces (contratos de saída)
│       ├── adapters/              # implementações de infra DESTE domínio
│       ├── actions/               # entrypoints (server actions / handlers / controllers)
│       ├── events/                # eventos publicados/consumidos pelo domínio
│       ├── components/            # UI do domínio (se houver)
│       └── __tests__/
│
├── events/                        # 📣 CONTRATOS de eventos compartilhados
│   ├── registry.ts                # catálogo + versionamento de eventos
│   └── <event-name>.ts            # schema + tipo do payload
│
├── shared/                        # 🔧 INFRA TRANSVERSAL (SEM regra de negócio)
│   ├── observability/{logger,tracing,metrics,audit,health}.ts
│   ├── config/env.ts              # validação de env (fail-fast)
│   ├── security/  errors/  utils/
│
├── infra/                         # adaptadores técnicos globais
│   ├── db/migrations/             # SQL gerado por CLI
│   ├── queue/  cache/
│
├── app/                           # 🖥️ ENTREGA (frontend/API) — só wiring, SEM regra
├── worker/                        # ⚙️ background — só wiring, SEM regra
│
├── scripts/
│   ├── generate.js                # scaffolding padronizado
│   ├── verify-rules.js            # análise estática ativa
│   └── lib/                       # módulos dos scripts
│
├── .github/workflows/ci.yml       # 🚦 MESMOS checks do hook = gate real
│
├── .claude/skills/<skill>/SKILL.md
├── .gemini/skills/<skill>/SKILL.md
└── scratch/                       # rascunhos efêmeros (GITIGNORED)
```

### 5.2. A Regra de Dependência (Hexagonal / Ports & Adapters)
Dentro de cada domínio, as dependências apontam **para dentro**:

```
actions / components  →  services  →  domain (puro)
                              │
                              ▼
                            ports (interfaces)  ◀── adapters (infra) implementam
```

- `domain/` é **puro**: sem chamadas de banco, rede ou framework. Testável em memória.
- `services/` orquestra casos de uso e fala com o mundo **apenas via `ports/`** (interfaces).
- `adapters/` implementam as `ports` usando infra concreta (DB, fila, API externa).
- Isso permite trocar Supabase por outro Postgres, ou fila in-process por Kafka, **sem tocar na regra de negócio**.

### 5.3. Tecnologia ≠ negócio
Pastas organizadas só por tecnologia (`app/`, `worker/`, `infra/`) **não contêm lógica de negócio** — só *wiring* (injeção de dependência, roteamento, configuração). Toda regra mora em `domains/`.

---

## 6. BOUNDARIES E ARQUITETURA EVENT-DRIVEN

### 6.1. Domínios não se acoplam diretamente
**Proibido** import direto entre domínios:
```
crm → billing        ❌
billing → inventory  ❌
inventory → crm      ❌
```
Comunicação permitida apenas por: **eventos**, **interfaces/contratos**, ou **serviços compartilhados aprovados** (em `shared/`). Um domínio só pode importar de **outro domínio** através do `index.ts` público dele — nunca alcançando `internals`. O ideal é nem isso: prefira eventos.

### 6.2. Eventos como espinha dorsal
Crie `events/`. Todo evento relevante tem **contrato próprio** (schema + tipo versionado), registrado em `events/registry.ts`. Exemplos:
```
customer-created   invoice-paid   subscription-cancelled   appointment-booked
```
Regra: **nenhum domínio executa lógica interna de outro diretamente**. Para reagir a algo, publique/consuma evento. Eventos críticos geram log auditável (Seção 8).

> Estratégia de evolução: comece com um **event bus in-process** (síncrono, simples) na fase 1; o contrato versionado permite migrar para SQS/Kafka/NATS na fase 2 **sem reescrever os domínios**.

### 6.3. Enforcement automático
`verify-rules` deve **falhar** ao detectar: import cross-domain proibido, alcance a internals de outro domínio, e dependências circulares (`A → B → C → A`). Ver Seção 8.

---

## 7. LEIS DE SEGURANÇA GLOBAIS (INVIOLÁVEIS)

Toda regra abaixo é não-negociável e é verificada por máquina.

### 7.1. Multi-Tenant (se `multi_tenant: true`)
Toda tabela possui coluna de isolamento (`tenant_id` ou equivalente), **exceto** tabelas globais explícitas (`tenants`, configs globais). O `verify-rules` falha se uma migration criar tabela sem ela e a tabela não estiver na allowlist global.

### 7.2. Row-Level Security (ou equivalente da stack)
Toda tabela com dados de tenant tem **RLS habilitada** + **pelo menos uma policy** definida. Bancos sem RLS nativo: implementar o isolamento equivalente na camada de `adapters` + teste que prove o isolamento.

### 7.3. Credenciais privilegiadas nunca no cliente
Proibido em qualquer arquivo cliente (`'use client'`, bundle de frontend): `SERVICE_ROLE_KEY`, `createAdminClient`, chaves admin, secrets de qualquer natureza. `verify-rules` escaneia e falha ao encontrar.

### 7.4. Gestão de segredos
- `.env` **gitignored**; `.env.example` versionado com chaves (sem valores).
- **Validação de env em boot** (`shared/config/env.ts`): a app falha ao subir se faltar/for inválida qualquer variável obrigatória (use Zod/Pydantic/envalid). Nada de `process.env.X` espalhado e silencioso.
- Secret scanning no CI (ex.: `gitleaks`) como gate.

### 7.5. Princípio do menor privilégio
Credenciais privilegiadas vivem só no servidor/worker. Toda query de cliente passa por RLS. Service-role só em código server-side claramente isolado.

---

## 8. OBSERVABILIDADE OBRIGATÓRIA

Crie `shared/observability/`:
```
logger.ts    # logs estruturados (JSON) com trace/correlation id
tracing.ts   # OpenTelemetry (vendor-neutral) — spans por request/job
metrics.ts   # contadores/histogramas (estilo Prometheus)
audit.ts     # trilha de auditoria para eventos sensíveis
health.ts    # liveness + readiness
```
Todo módulo suporta: **logs estruturados**, **rastreabilidade (trace id propagado)**, **auditoria** e **monitoramento**. Eventos críticos (login, pagamento, mudança de permissão, deleção) geram **log auditável** via `audit.ts`. Use OpenTelemetry para não acoplar a um vendor específico de APM.

---

## 9. TOOLING DA FUNDAÇÃO

### 9.1. `scripts/verify-rules.js` — análise estática ativa
Node.js puro, modular (`scripts/lib/*`). Retorna **exit 0** se passa, **exit 1** se falha. Saída legível (cores, agrupada por categoria). Valida:

**Estrutura**
- Arquivos de código (`.ts/.tsx/.js/.py/...`) acima de **500 linhas líquidas** → falha. Acima de 300 → warning.
- Arquivos "Deus" (heurística: muitos `export`s não relacionados num único arquivo de tipos/schemas) → warning.

**Segurança**
- Padrões proibidos em arquivos cliente: `createAdminClient`, `SERVICE_ROLE_KEY`, secrets, chaves admin → falha.
- Secrets hardcoded fora de `.env*` → falha.

**Banco**
- Toda migration cria tabela com `tenant_id` (salvo allowlist), `RLS` habilitada e ≥1 `policy` → senão falha.

**Arquitetura**
- Import cross-domain proibido (`domains/crm/**` importando `domains/billing/**`) → falha.
- Alcance a internals de outro domínio (qualquer import que não seja pelo `index.ts` público) → falha.
- Dependências circulares (`A → B → C → A`) → falha.

**Estado / Docs (lembrete — warning, nunca bloqueia)**
- Há mudança de código em stage (`app/`/`worker/`/`infra/db/migrations`) mas `docs/STATUS.md` **não** foi tocado → *warning* lembrando de atualizar o estado da feature (§2.7/§3.4). Usa `git diff --cached`; em CI/sem stage, passa.

> **Recomendação sênior:** para boundaries e ciclos, prefira ferramentas testadas em batalha em vez de regex frágil — `dependency-cruiser` (regras declarativas) e `madge --circular` no ecossistema JS/TS, ou `import-linter` em Python. O `verify-rules.js` orquestra essas ferramentas e adiciona as checagens de segurança/migration próprias. Forneça também um *fallback* zero-dependência via AST para ambientes restritos.

Esqueleto:

```js
// scripts/verify-rules.js
const checks = [
  require('./lib/check-file-size'),
  require('./lib/check-client-secrets'),
  require('./lib/check-migrations'),
  require('./lib/check-domain-boundaries'),
  require('./lib/check-circular-deps'),
  require('./lib/check-status-doc'),   // lembra de manter docs/STATUS.md atualizado (§3.4)
];

(async () => {
  const results = [];
  for (const check of checks) results.push(await check.run());
  const failures = results.filter(r => r.status === 'fail');
  const warnings = results.filter(r => r.status === 'warn');

  warnings.forEach(w => console.warn(`⚠️  ${w.name}: ${w.message}`));
  failures.forEach(f => console.error(`❌ ${f.name}: ${f.message}`));

  if (failures.length) {
    console.error(`\n${failures.length} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log('✅ Todas as verificações passaram.');
  process.exit(0);
})();
```

Cada `lib/check-*.js` exporta `{ name, async run() -> { name, status: 'pass'|'warn'|'fail', message } }`. Mantê-los pequenos respeita a própria regra de tamanho.

### 9.2. `scripts/generate.js` — gerador de blueprints
Node.js puro. Comandos obrigatórios:
```
node scripts/generate.js migration <tabela>      # SQL com tenant_id, RLS, policies, triggers updated_at, anon revoke
node scripts/generate.js action <caminho> <nome> # Server Action/handler com validação (Zod), try-catch, checagem de auth
node scripts/generate.js event <nome>            # contrato de evento (schema + tipo) + registro em events/registry.ts
node scripts/generate.js worker <nome>           # worker com idempotência, retry, rate-limit, logging estruturado
node scripts/generate.js domain <nome>           # estrutura completa de domínio (CONTEXT.md, index, ports, adapters, __tests__)
node scripts/generate.js sync-skills             # copia cada CONTEXT.md → SKILL.md em .claude/skills/ e .gemini/skills/
```
Todo arquivo gerado **já nasce** respeitando os padrões (tamanho, segurança, boundaries) e dentro do domínio correto. Templates ficam em `scripts/lib/templates/`.

---

## 10. GIT HOOKS — VERSIONADOS E COMPARTILHÁVEIS

> ⚠️ **Correção crítica de design.** Hooks em `.git/hooks/` **não são versionados pelo Git** e, portanto, **não chegam aos outros desenvolvedores nem aos agentes** — o que contradiz frontalmente o objetivo de colaboração consistente. **Não** instale o hook em `.git/hooks/` diretamente. Use uma das estratégias abaixo (versionadas):

**Opção A — Lefthook (recomendado, agnóstico de linguagem):** `lefthook.yml` na raiz, versionado.
```yaml
# lefthook.yml
pre-commit:
  parallel: false
  commands:
    verify:
      run: node scripts/verify-rules.js
    sync-skills:
      run: node scripts/generate.js sync-skills && git add .claude/skills .gemini/skills
```

**Opção B — `core.hooksPath` (zero dependência):**
```bash
git config core.hooksPath .githooks   # dir VERSIONADO
# .githooks/pre-commit  (executável)
```

Fluxo do pre-commit (qualquer opção):
1. Rodar `node scripts/verify-rules.js` → **aborta o commit em vermelho** se falhar (RLS, tamanho, vazamento de secret, boundary).
2. Rodar `node scripts/generate.js sync-skills` (sincroniza `CONTEXT.md` → `SKILL.md`).
3. `git add .claude/skills .gemini/skills` silenciosamente (skills entram no mesmo commit).
4. Concluir.

Configure as permissões de execução do hook. Adicione um passo de bootstrap (`prepare`/`postinstall` ou alvo no Makefile) que instala o hook manager automaticamente após o clone — senão o time esquece de ativá-lo.

---

## 11. CI/CD — O GATE REAL (camada que faltava nas duas versões)

Hooks locais são **burláveis** (`git commit --no-verify`). Portanto a verdadeira trava de qualidade é o **CI**, que roda os **mesmos** checks de forma inescapável e bloqueia o merge.

Crie `.github/workflows/ci.yml` (adapte ao provedor):
```yaml
name: CI
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4          # ou setup-python/go conforme stack
        with: { node-version: '22' }
      - run: <install com lockfile frozen>    # pnpm i --frozen-lockfile
      - run: <lint>
      - run: <typecheck>
      - run: node scripts/verify-rules.js     # MESMA trava do hook
      - run: <test --coverage>                # falha abaixo do threshold
      - run: <build>
      - run: <secret-scan>                    # gitleaks
```
Ative **branch protection** em `main`: PR obrigatório + CI verde para merge. Sem isso, todas as outras regras são opcionais na prática.

---

## 12. ESTRATÉGIA DE TESTES (ausente nas duas versões)

Adote a pirâmide de testes e torne-a verificável:
- **Unit** (maioria): regra pura em `domain/`, testada em memória, rápida. Colocada junto: `*.test.ts` ou `__tests__/`.
- **Integração** (camada média): `services` + `adapters` contra DB/fila reais (containers efêmeros).
- **E2E** (poucos): fluxos críticos ponta-a-ponta.
- **Cobertura mínima** configurada (ex.: 80% em `domains/`) e **enforced no CI**.
- **Factories/fixtures** para dados de teste; nada de dados mágicos espalhados.
- Cada `generate.js domain/action` cria o arquivo de teste-esqueleto correspondente.

---

## 13. GOVERNANÇA DE DEPENDÊNCIAS E COMMITS

- **Lockfile sempre versionado**; CI instala com lockfile congelado.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`...) validados por hook (commit-msg) → habilita **CHANGELOG** automático (Changesets / semantic-release / git-cliff) e versionamento previsível.
- **Atualização automatizada** de deps via Renovate/Dependabot (PRs revisáveis).
- **Auditoria de vulnerabilidades** no CI (`npm audit` / `pip-audit` / `cargo audit`).
- Nova dependência exige aprovação humana (§2.4) **e** registro em `DECISIONS.md`.

---

## 14. SKILLS NATIVAS DE IA

Crie `.claude/skills/` e `.gemini/skills/`. Para cada módulo crítico, uma subpasta (`database`, `frontend`, `worker`, `auth`, `billing`, `crm`...) com um `SKILL.md` que **inclui/importa** o conteúdo do `CONTEXT.md` local correspondente. O comando `generate.js sync-skills` mantém tudo em sincronia, e o pre-commit garante que nunca fiquem defasados. O `AGENTS.md` mantém o mapa apontando para todos os `CONTEXT.md`.

`CONTEXT.md` (template por domínio):
```md
# <Domínio> — CONTEXT
## Propósito         # 1 frase
## Modelo            # entidades e invariantes principais
## API pública       # o que index.ts expõe (e o que NÃO expõe)
## Eventos           # publica / consome
## Regras locais     # DDL/RLS (se db), masks/forms (se ui), idempotência (se worker)
## Gotchas           # armadilhas conhecidas
```

---

## 15. DOCUMENTAÇÃO E ONBOARDING

Crie e mantenha: `README.md` (o que é + setup em 1 comando), `CONTRIBUTING.md` (fluxo de trabalho, padrões, como rodar travas), `docs/ARCHITECTURE.md` (visão macro + diagrama de domínios/eventos), `docs/RUNBOOK.md` (operação/incidentes). Meta: um novo dev (ou agente) sai do clone para o primeiro commit válido seguindo só o README.

---

## 16. DEFINITION OF READY / DEFINITION OF DONE

**DoR** (antes de começar): **`docs/STATUS.md` lido** (estado da feature confirmado — não vou reconstruir o que está ✅) · contexto do domínio lido (`CONTEXT.md`) · parâmetros claros · decisão arquitetural (se houver) discutida.

**DoD** (antes de concluir): `verify-rules` passa · testes passam com cobertura · CI verde · **`docs/STATUS.md` atualizado** (linha da feature: estado + arquivos) · entrada em `DECISIONS.md` · skills sincronizadas · `/scratch` limpo · nenhum secret/credencial exposto · arquivos dentro do limite de linhas · sem dependência nova não-aprovada.

---

## 17. EXECUÇÃO FINAL E AUTO-VERIFICAÇÃO

Após criar a fundação, execute nesta ordem e **mostre o resultado**:
1. Árvore completa do projeto.
2. Lista de todos os arquivos criados (com 1 linha de propósito cada).
3. Resumo arquitetural (domínios, boundaries, fluxo de eventos).
4. **Stack Adapter** preenchido (como cada lei universal se materializa na stack escolhida).
5. Comandos: **desenvolvimento** · **validação** (`verify-rules`, lint, typecheck, test) · **geração** (`generate.js ...`).
6. Rodar `node scripts/verify-rules.js` e exibir a saída (deve passar).
7. Rodar `node scripts/generate.js sync-skills` e confirmar sincronização.
8. Confirmar que o hook está instalado de forma **versionada** (não em `.git/hooks/`) e que o CI está configurado.
9. Confirmar que `docs/STATUS.md` existe, está apontado como 1ª leitura no `AGENTS.md` e reflete o estado real — **em adoção brownfield, auditado a partir do código e backfillado** (§3.4).

> Se você (agente) **não tiver acesso real ao filesystem**, gere integralmente o conteúdo de **todos** os arquivos, em blocos de código rotulados com seus caminhos, prontos para criação manual — incluindo `AGENTS.md`, `verify-rules.js`, `generate.js`, `lefthook.yml`/hook, `ci.yml`, `env.ts`, e os templates.

---

## CHECKLIST DE COMPLETUDE (o agente confirma item a item)

- [ ] Context Engine (AGENTS.md + ponteiros + DECISIONS.md/ADR) criado
- [ ] **`docs/STATUS.md` (mapa de estado por feature)** criado, apontado como 1ª leitura no AGENTS.md, e — em brownfield — backfillado a partir do código
- [ ] Topologia por domínio (DDD + hexagonal) com `domains/`, `events/`, `shared/`, `infra/`
- [ ] Boundaries e event-driven com enforcement automático
- [ ] Leis de segurança (multi-tenant, RLS, sem creds no cliente, env validation, secret scan)
- [ ] Observabilidade (logger, tracing OTel, metrics, audit, health)
- [ ] `verify-rules.js` + `generate.js` (modulares, dentro do limite)
- [ ] Hooks **versionados** (lefthook/core.hooksPath) — NÃO em `.git/hooks/`
- [ ] **CI** rodando os mesmos checks + branch protection
- [ ] Estratégia de testes com cobertura no CI
- [ ] Governança de deps + conventional commits + changelog
- [ ] Skills nativas sincronizadas
- [ ] Docs de onboarding + DoR/DoD
- [ ] Auto-verificação final executada
