# DECISIONS — log vivo de decisões arquiteturais

> Entradas no topo (mais recente primeiro), formato ADR resumido. Decisões estruturais maiores
> ganham um ADR completo numerado em `docs/adr/`. Ver `AGENTS.md` §2.1 para quando registrar.

---

## [2026-07-05] Fix: Correção de fuso horário e transações duplicadas em limites mensais

- **Status:** accepted
- **Contexto:** ao editar uma transação e alterar seu mês para o primeiro dia de outro mês (ex: 01/08), o item aparecia no mês destino mas também continuava a ser exibido no mês de origem. Além disso, lançamentos manuais sofriam deslocamento de um dia na listagem devido ao fuso UTC/America/Sao_Paulo (dia 05/08 virava 04/08).
- **Decisão:**
  - **Consultas de períodos:** Alterar os castings das datas iniciais e finais de `$2::date` para `$2::timestamp` antes de aplicar `AT TIME ZONE` nas queries SQL de listagem de transações e relatórios do dashboard. Isso evita que o Postgres infira `timestamp without time zone` na data inicial, o que causava uma janela de sobreposição de fuso de 3 horas entre os meses subsequentes.
  - **Normalização de datas de entrada:** Ajustar a validação de data (`validarData`) no backend de transações para que datas em formato `YYYY-MM-DD` sejam interpretadas no fuso de Brasília (`-03:00`) ao meio-dia (`12:00:00`), eliminando o bug de deslocamento de dia (day shift) do fuso local e mantendo paridade com o comportamento do parser de OFX.
- **Arquivos impactados:** `src/domains/transacoes/services/transacoes-service.ts`, `src/domains/transacoes/adapters/transacoes-repository-pg.ts`, `src/domains/dashboard/adapters/dashboard-repository-pg.ts`.

## [2026-07-05] Categorização em lote e regras padrão de semente (seed)

- **Status:** accepted
- **Contexto:** o banco remoto iniciava vazio sem nenhuma regra de categorização, fazendo com que as transações de extratos novos caíssem sempre na categoria 'outros' até o usuário recategorizar manualmente termo por termo. Além disso, o usuário queria uma forma de rodar a categorização retroativa em lote para testar.
- **Decisão:**
  - **Categorização em lote:** Adicionado o endpoint `POST /api/transacoes/recategorizar-tudo` no domínio `transacoes`, mapeado para o método `recategorizarTodas(tenantId)` que executa um update em lote no banco buscando por descrição parcial (case-insensitive `LIKE`).
  - **Seed de regras padrão:** Adicionado um catálogo de termos comuns (`REGRAS_PADRAO`, ex: mercado, uber, posto, netflix) ao método `seedCategoriasPadrao` no domínio `categorias` (`src/domains/categorias/adapters/categorias-seed.ts`).
  - **Idempotência no fluxo:** O método `recategorizarTodas` roda o seed antes de categorizar para garantir que novas contas de desenvolvimento/produção tenham categorias e regras populadas na primeira execução.
  - **Frontend:** Adicionado o botão "Categorizar Lançamentos" na topbar (`public/index.html`) que aciona o backend e atualiza a dashboard.
- **Arquivos impactados:** `src/domains/categorias/**`, `src/domains/transacoes/**`, `public/index.html`, `public/styles.css`, `public/app.js`.

## [2026-07-05] CRUD completo: transações, contas bancárias e itens de cupom

- **Status:** accepted
- **Contexto:** só dava para categorizar transações/itens — editar data, valor, descrição,
  nome/tipo de conta ou nome/quantidade/preço de um item de cupom exigia mexer direto no banco.
  Usuário pediu CRUD completo para poder corrigir lançamentos manualmente.
- **Decisão:**
  - **Transações** (`domains/transacoes`): `POST /api/transacoes` (lançamento manual,
    `origem='manual'`), `PATCH /api/transacoes/:id` (edição parcial), `DELETE /api/transacoes/:id`.
    Editar `data_transacao` ou `valor` de uma transação já reconciliada desvincula o cupom
    (`cupom_id=NULL`, `status_reconciliado=false`) — o match do motor de reconciliação (valor
    exato + janela 48h) não é mais garantido válido depois da edição. `transacoesService` passou
    a receber `contasService` (via `index.ts`) para validar `conta_id`.
  - **Contas bancárias** (`domains/contas`): `PATCH /api/contas/:id` (nome/tipo),
    `DELETE /api/contas/:id`. Exclusão é **bloqueada com 409** se a conta tiver transações
    vinculadas (a FK é `ON DELETE CASCADE` — apagaria o extrato inteiro da conta em silêncio;
    preferimos exigir que o usuário limpe/mova as transações primeiro).
  - **Itens de cupom** (`domains/cupons`): `PATCH /api/cupons/itens/:id` (nome/quantidade/preço;
    `valor_total` é recalculado a partir de qtd×preço quando não vem explícito no corpo),
    `DELETE /api/cupons/itens/:id`. Toda edição/exclusão de item recalcula
    `cupons_fiscais.valor_total = SUM(itens_cupom.valor_total)` na mesma transação — mantém a
    consistência que a validação de OCR já impõe na criação (soma dos itens ≈ total, tolerância
    R$0,05). Cupom que fica com zero itens não é auto-excluído (edge case raro, fora de escopo).
  - **Frontend:** novos módulos `public/transacao-form.js` (modal criar/editar lançamento,
    com botão "+ Lançamento" na tabela), `public/item-cupom-form.js` (modal editar item),
    `public/transacoes-tabela.js` (extraído de `app.js` — linhas da tabela + ações ✎/🗑).
    `public/contas-ui.js` ganhou lista de contas existentes com ✎/🗑 dentro do mesmo modal de
    criar conta (um único formulário alterna entre criar/editar via campo oculto `conta-id`).
  - `eslint.config.js`: `confirm` adicionado a `BROWSER_GLOBALS` (usado nas confirmações de
    exclusão) — o projeto mantém uma allowlist explícita de globals de browser, não `env: browser`.
- **Arquivos impactados:** `src/domains/transacoes/**`, `src/domains/contas/**`,
  `src/domains/cupons/**` (types/ports/adapters/services/actions + testes en cada um),
  `public/index.html`, `public/styles.css`, `public/app.js`, `public/contas-ui.js`,
  `public/transacao-form.js` (novo), `public/item-cupom-form.js` (novo),
  `public/transacoes-tabela.js` (novo, extraído de `app.js`), `eslint.config.js`.
- **Consequências / Gotchas:** `GET /api/transacoes` agora também devolve `conta_id` (antes só
  `conta_nome`) — necessário para pré-selecionar a conta certa no formulário de edição; mudança
  aditiva, não quebra nada existente. Extrair a tabela de transações para
  `transacoes-tabela.js` também resolveu de vez o aviso de tamanho de arquivo em `app.js` (311
  → 222 linhas), sem precisar de baseline/ratchet.

## [2026-07-04] Fix: service worker servia CSS/JS obsoleto até um refresh manual

## [2026-07-04] Fix: service worker servia CSS/JS obsoleto até um refresh manual

- **Status:** accepted
- **Contexto:** após corrigir o bug de CSS do toggle login↔dashboard (entrada anterior deste
  arquivo), o usuário relatou que a tela de login só sumia depois de um refresh manual — o
  próprio bug parecia ter voltado. Causa: `public/sw.js` usava cache-first para os assets do
  "shell" (`caches.match(request)` retornava o cache IMEDIATAMENTE, sem esperar a rede) —
  então qualquer deploy que mudasse `styles.css`/`app.js`/etc. só aparecia depois que o SW
  buscasse a rede em segundo plano E o usuário navegasse de novo (um único load ficava preso
  na versão cacheada anterior). A navegação (HTML) já usava network-first corretamente; só os
  assets estáticos (JS/CSS) tinham a estratégia errada.
- **Decisão:** trocar a estratégia dos assets estáticos para network-first com fallback em
  cache (mesmo padrão já usado pela navegação) — a rede sempre vence quando disponível; o
  cache só serve se a rede falhar (offline). `CACHE_VERSION` "v2" → "v3" para evacuar de
  imediato qualquer cache antigo já na máquina dos usuários.
- **Arquivos impactados:** `public/sw.js`.
- **Consequências / Gotchas:** deploys futuros de frontend não dependem mais de bump manual
  de `CACHE_VERSION` para chegar aos usuários — a troca de estratégia resolve a causa raiz.
  Sacrifica um pouco de velocidade de load offline-first (sempre tenta rede primeiro) em troca
  de nunca mais servir UI desatualizada — aceitável para uma app financeira, onde
  correção > velocidade de cache.

## [2026-07-04] Fix crítico: BIGINT vira string no driver `pg` e derruba a publicação de eventos

- **Status:** accepted
- **Contexto:** todo upload de extrato (OFX ou PDF) e todo upload de cupom fiscal que
  extraísse pelo menos uma transação/item real terminava em `500 Erro interno do servidor`
  em produção — meus testes anteriores não pegaram isso porque só usavam arquivos vazios/
  inválidos (falhavam antes de chegar nesse trecho). Reproduzi com um OFX real (via `curl`
  contra produção) e confirmei pelos logs da Vercel (`vercel logs --json`): `Evento
  extrato.importado.v1 com payload inválido: contaId — expected number, received string`.
  Causa raiz: `contas_bancarias.id`, `cupons_fiscais.id` etc. são `BIGINT GENERATED ALWAYS AS
  IDENTITY` (`infra/db/migrations/0001_schema_base.sql`); o driver `pg` devolve BIGINT como
  **string** por padrão (evita perda de precisão acima de `Number.MAX_SAFE_INTEGER`), apesar
  do tipo TypeScript dizer `number` — uma mentira de tipo que só se manifesta em runtime. Isso
  já era visível no `GET /api/contas` retornando `"id":"7"` (com aspas) desde o início, mas só
  quebrava de forma visível quando esse id "number" caía num schema Zod de evento
  (`contaId: z.number()`, `cupomId: z.number()`) — `resolverContaId`'s fallback
  (`contas[0].id`, sem `parseInt`) e `cupom-repository-pg.ts`'s `RETURNING id` eram os pontos
  de entrada, mas o problema é do driver, não desses dois call sites.
- **Decisão:** registrar um parser de tipo global para OID 20 (BIGINT) em `infra/db/pool.ts`:
  `types.setTypeParser(20, (val) => parseInt(val, 10))`. Fix sistêmico (uma linha, no módulo
  central de infra) em vez de `Number(...)` espalhado nos call sites — nossos BIGINT são só
  IDs autoincrementados pequenos, sem risco de estourar `Number.MAX_SAFE_INTEGER`. Cobre
  extrato, cupom e qualquer uso futuro de id BIGINT, presente ou futuro.
- **Arquivos impactados:** `src/infra/db/pool.ts` + novo
  `src/infra/db/__tests__/pool.test.ts` (guarda de regressão, testa o parser isoladamente
  sem precisar de conexão real).
- **Consequências / Gotchas:** o campo `id` nas respostas JSON da API (`/api/contas` etc.)
  passa a vir como número (`"id":7`), não mais como string (`"id":"7"`) — mudança de shape
  correta/esperada, mas qualquer consumidor externo que dependesse do formato string precisa
  se ajustar (nenhum conhecido hoje). Reproduzido e validado em produção após o deploy: upload
  de OFX real com uma transação válida passou a responder `201` em vez de `500`.

## [2026-07-04] Fix: 504 no upload de extrato/cupom — limite de arquivo maior que o teto real da Vercel

## [2026-07-04] Fix: 504 no upload de extrato/cupom — limite de arquivo maior que o teto real da Vercel

- **Status:** accepted
- **Contexto:** upload de PDF de extrato retornava 504 (Gateway Timeout) sem nenhuma mensagem
  útil. Investigando (logs da Vercel via `vercel logs`, docs oficiais via WebFetch, reprodução
  direta com `curl` contra o domínio de produção), confirmei duas coisas: (1) o multer aceitava
  até 15 MB (`extrato-actions.ts`, `cupons-actions.ts`), mas a Vercel rejeita qualquer corpo de
  requisição acima de **4,5 MB** com `413 FUNCTION_PAYLOAD_TOO_LARGE` — texto puro, fora do
  `errorHandler`, sem JSON — confirmado enviando um arquivo de 6 MB (fotos de celular de um
  extrato de várias páginas passam fácil dos 4,5 MB); (2) `vercel.json` limitava a função a 60s
  e o cliente Gemini abortava em 55s — margem apertada demais para OCR de PDFs maiores/multi-
  página; se a plataforma mata a função antes do nosso `AbortSignal` dar a mensagem amigável, o
  navegador recebe um 504 cru, sem corpo, e a UI não tem o que mostrar. Um upload de PDF pequeno
  (teste sintético) completou em 2,4s sem problema — o pipeline em si funciona.
- **Decisão:** `multer.limits.fileSize` de 15 MB → **4 MB** em `extrato-actions.ts` e
  `cupons-actions.ts` (abaixo do teto real da Vercel, com folga para overhead do multipart) —
  agora um arquivo grande demais recebe a mensagem tratada do nosso `errorHandler` em vez do
  texto cru da plataforma. `vercel.json` `maxDuration` 60 → **120** (Hobby permite até 300s com
  fluid compute — 60s era um teto arbitrário, bem abaixo do que a plataforma realmente permite).
  `AbortSignal.timeout` do cliente Gemini 55s → **110s**, mantendo ~10s de margem para o
  `errorHandler` responder antes do limite da função. Novo tratamento de `MulterError` no
  `errorHandler` (413 com mensagem clara para `LIMIT_FILE_SIZE`, 400 para os demais casos) —
  antes caía no branch genérico de 500 "Erro interno do servidor.", escondendo que era erro do
  cliente (arquivo grande), não do servidor.
- **Arquivos impactados:** `vercel.json`, `src/domains/extrato/actions/extrato-actions.ts`,
  `src/domains/cupons/actions/cupons-actions.ts`, `src/shared/ia/gemini-client.ts`,
  `src/shared/errors/error-handler.ts` + novo `src/shared/errors/__tests__/error-handler.test.ts`.
- **Consequências / Gotchas:** o teto de 4,5 MB é da infraestrutura da Vercel (Serverless
  Functions, Node.js), não configurável — qualquer novo endpoint de upload deve nascer com
  `multer.limits.fileSize` abaixo disso. `maxDuration` em `vercel.json` só vale a partir do
  próximo deploy. Testado em produção: PDF pequeno → 422 tratado em ~2,4s; PDF de 6 MB → 413
  `FUNCTION_PAYLOAD_TOO_LARGE` (comportamento da plataforma, fora do nosso controle, mas agora
  nosso próprio limite de 4 MB barra antes disso na maioria dos casos).

## [2026-07-04] Fix: toggle login↔dashboard preso por especificidade de CSS + UI de criar conta bancária ausente

## [2026-07-04] Fix: toggle login↔dashboard preso por especificidade de CSS + UI de criar conta bancária ausente

- **Status:** accepted
- **Contexto:** após corrigir a auth (ES256), dois problemas bloqueavam o uso real do app.
  (1) Ao logar, `#app-shell` aparecia mas o formulário de login continuava visível na mesma
  tela. Causa: `login-ui.js` só alterna a *IDL property* `hidden` (`tela-login.hidden = true`),
  mas `styles.css` tinha `.tela-login { display: flex; }` — uma regra de classe com a MESMA
  especificidade do seletor `[hidden]` do UA stylesheet; como o autor vem depois do UA na
  cascata, `display: flex` vencia o empate e o elemento nunca escondia de verdade.
  (2) Todo tenant novo nasce sem nenhuma conta bancária; `POST /api/extrato/upload-ofx` já
  recusava com 400 ("Nenhuma conta bancária cadastrada..."), mas o frontend nunca chamava
  `GET/POST /api/contas` — não havia NENHUMA UI para criar a primeira conta, deixando o usuário
  travado (o backend de `contas` já suportava isso, só faltava expor).
- **Decisão:** (1) `.tela-login[hidden] { display: none; }` — especificidade maior, resolve o
  empate a favor de esconder. (2) Novo `public/contas-ui.js` com modal de criar conta bancária
  (nome + tipo, mesmos campos que `contasService.criar` já validava); `app.js` chama
  `ContasUI.garantirConta()` após todo login bem-sucedido (inclusive sessão já válida ao
  recarregar a página) e abre o modal automaticamente se `GET /api/contas` vier vazio; um botão
  "+ Conta" na topbar permite criar contas adicionais depois. Sem CRUD de editar/excluir —
  mesmo escopo que o backend já expunha (ver `STATUS.md`).
- **Arquivos impactados:** `public/styles.css`, `public/index.html`, `public/app.js`,
  `public/contas-ui.js` (novo).
- **Consequências / Gotchas:** especificidade empatada entre seletor de classe e `[hidden]` é
  uma armadilha geral — qualquer novo `display`/`visibility` em classe aplicada a um elemento
  que também é escondido via atributo `hidden` deve levar um par `[hidden] { display: none; }`
  explícito. Testado localmente com `AUTH_MODE=off`: tenant sem conta → upload de extrato 400 →
  `GET /api/contas` vazio → modal abriria → `POST /api/contas` cria e desbloqueia o upload.

## [2026-07-04] Backend valida ES256 via JWKS (supersede a rotação para HS256)

- **Status:** accepted — supersede a entrada seguinte ("rotacionar signing key para HS256"),
  decidida no mesmo dia e revertida a pedido do humano antes de ser executada.
- **Contexto:** em vez de rotacionar a signing key do Supabase de volta ao HS256 legado,
  optou-se por adaptar o backend ao padrão atual do Supabase (JWT Signing Keys assimétricas,
  ES256) — caminho recomendado a longo prazo e que dispensa segredo compartilhado.
- **Decisão:** `shared/security/jwt.ts` ganhou `verificarJwtEs256` (ECDSA P-256/SHA-256 com
  crypto nativo, assinatura JWT em formato cru → `dsaEncoding: 'ieee-p1363'`; sem dependência
  nova, §2.4) e `extrairAlgKid`. Novo `shared/security/jwks.ts` busca e cacheia o JWKS público
  do projeto (`/auth/v1/.well-known/jwks.json`, TTL 10 min, refetch com rate-limit de 30 s ao
  ver `kid` desconhecido, fail-closed 503 se o endpoint estiver fora). O `authMiddleware`
  (agora async) despacha por `alg`: ES256 → JWKS; HS256 → `SUPABASE_JWT_SECRET` (legado);
  qualquer outro → 401.
- **Arquivos impactados:** `src/shared/security/jwt.ts`, `src/shared/security/jwks.ts` (novo),
  `src/shared/security/auth-middleware.ts` + testes em `src/shared/security/__tests__/`.
- **Consequências / Gotchas:** `SUPABASE_JWT_SECRET` só é lido se chegar token HS256 — em
  projetos novos (ES256) o valor configurado não é usado. Rotação de signing key no Supabase
  passa a ser transparente (o JWKS é re-buscado). Sessões antigas do navegador continuam
  válidas; basta recarregar o app.

## [2026-07-04] Supabase novo assina JWT com ES256 — rotacionar signing key para HS256

- **Status:** superseded — substituída pela entrada acima (backend valida ES256 via JWKS);
  a rotação nunca foi executada no dashboard.
- **Contexto:** após corrigir as env vars, o login passou a funcionar mas TODA rota `/api/*`
  respondia `401 Algoritmo de token não suportado.` Projetos Supabase criados a partir de 2025
  usam **JWT Signing Keys assimétricas (ES256)** por padrão — o JWKS do projeto
  (`/auth/v1/.well-known/jwks.json`) publica uma chave EC P-256 e o header do access token é
  `{"alg":"ES256"}`. Nosso backend fixa HS256 por decisão registrada
  (`src/shared/security/jwt.ts`, crypto nativo, sem dependência extra) e rejeita o resto.
- **Decisão:** manter o contrato HS256 do backend e **rotacionar a signing key do projeto
  Supabase para "Shared Secret (HS256)"** (Dashboard → Project Settings → JWT Keys → criar
  standby key HS256 → Rotate). O segredo revelado vai em `SUPABASE_JWT_SECRET` na Vercel.
  Alternativa rejeitada por ora: adaptar o backend para verificar ES256 via JWKS (mais
  future-proof, mas muda o contrato de auth; reavaliar se o Supabase deprecar HS256 de vez).
- **Arquivos impactados:** nenhum (configuração no Supabase + env var na Vercel).
- **Consequências / Gotchas:** o valor exibido em "Legacy JWT secret" no dashboard NÃO é o que
  assina os tokens quando o projeto usa signing keys — conferir sempre o `alg` do JWKS. Após a
  rotação, sessões antigas (ES256) continuam aceitas pelo GoTrue até expirar, mas o backend as
  rejeita — basta sair e logar de novo para receber token HS256.

## [2026-07-04] Deploy Vercel: AUTH_MODE=supabase, chaves Supabase ausentes e Deployment Protection

- **Status:** accepted
- **Contexto:** no deploy de produção o signup falhava com `POST /undefined/auth/v1/signup` (404)
  e o `manifest.webmanifest` era bloqueado por CORS após redirect para `vercel.com/sso-api`.
  Diagnóstico: (1) `AUTH_MODE` estava `off` na Vercel (copiado do `.env` local de dev) →
  `/api/config` devolvia só `{authMode:"off"}`, sem `supabaseUrl`/`supabaseAnonKey`;
  (2) `SUPABASE_ANON_KEY` e `SUPABASE_JWT_SECRET` nunca foram cadastradas na Vercel;
  (3) os testes eram feitos na URL de deployment (`financeiro-kfv864g3c-...vercel.app`),
  protegida por Vercel Authentication (SSO) — os aliases de produção
  (`financeiro-alpha-gules.vercel.app`) são públicos e funcionam normalmente.
- **Decisão:** `AUTH_MODE=supabase` em Production e Preview (Lei 5 — `AUTH_MODE=off` nunca em
  produção); `PORT` removida (irrelevante em serverless); `SUPABASE_ANON_KEY` e
  `SUPABASE_JWT_SECRET` cadastradas na Vercel com os valores do dashboard do Supabase;
  validação do deploy sempre pelo domínio/alias de produção, nunca pela URL de deployment.
- **Arquivos impactados:** nenhum (só configuração na Vercel).
- **Consequências / Gotchas:** variáveis marcadas **Sensitive** na Vercel são write-only —
  `vercel env pull` devolve valor vazio; não confundir com variável vazia. Mudança de env var
  só vale no **próximo** deploy (`vercel --prod`). Smoke test pós-deploy:
  `GET /api/config` deve retornar `authMode:"supabase"` + `supabaseUrl` + `supabaseAnonKey`,
  e `GET /api/health/ready` deve retornar `{"status":"ok","banco":"conectado"}`.

## [2026-07-04] Tratamento robusto de DATABASE_CA_CERT no pool do banco

- **Status:** accepted
- **Contexto:** a conexão da Vercel com o Supabase apresentou erro `self-signed certificate in certificate chain` mesmo após configuração da variável `DATABASE_CA_CERT` na Vercel. Isto ocorreu porque variáveis de ambiente multilinhas (como certificados PEM) ou variáveis coladas com aspas podem ser injetadas com quebras de linha Windows (`\r\n`) ou literais (`\\n`), quebrando o parse de TLS/OpenSSL do Node.js em ambiente Linux.
- **Decisão:** implementar normalização automática do certificado no pool de conexões (`src/infra/db/pool.ts`), removendo aspas externas duplicadas e substituindo quebras de linha inconsistentes por quebras LF padrões (`\n`).
- **Arquivos impactados:** [pool.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/infra/db/pool.ts)
- **Consequências / Gotchas:** garante conexão resiliente sem depender da formatação de entrada manual de segredos em provedores serverless.

## [2026-07-04] Bootstrap do Dev OS + migração para SaaS multi-tenant

- **Status:** accepted — ver ADR completo em `docs/adr/0001-bootstrap-devops-multitenant.md`
- **Contexto:** o software, antes pessoal/single-user, será vendido como produto. Isso exige
  multi-tenancy real, autenticação, RLS e uma fundação de qualidade (testes, CI, boundaries
  verificáveis por máquina) — nenhuma dessas coisas existia antes.
- **Decisão:** aplicar integralmente o PROJECT-OS-v3 (Context Engine, DDD/hexagonal em
  `domains/`, event-driven via `events/`, Leis de Segurança, observabilidade, `verify-rules` +
  `generate.js`, hooks versionados, CI, testes, skills de IA).
- **Arquivos impactados:** todo o `src/` foi reestruturado; `db/schema.sql` virou
  `infra/db/migrations/0001_schema_base.sql` + `0002_multi_tenant_rls.sql`; frontend público
  ganhou tela de login e foi modularizado.
- **Consequências / Gotchas:** ver seção "Consequências / Gotchas" do ADR 0001 — em especial,
  a conexão com o banco pode quebrar até o CA do Supabase ser configurado
  (`DATABASE_CA_CERT`, ver `docs/RUNBOOK.md`).
