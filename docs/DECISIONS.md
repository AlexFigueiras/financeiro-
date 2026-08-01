# DECISIONS — log vivo de decisões arquiteturais

> Entradas no topo (mais recente primeiro), formato ADR resumido. Decisões estruturais maiores
> ganham um ADR completo numerado em `docs/adr/`. Ver `AGENTS.md` §2.1 para quando registrar.

## [2026-08-01] Lançamento automático quando o cupom sobe sem transação correspondente

- **Status:** accepted
- **Contexto:** ao subir um cupom fiscal (manual, upload de foto/PDF via OCR ou QR Code da NFC-e),
  o backend tentava casar com uma transação bancária já existente
  (`reconciliacaoService.reconciliarSeguro` → `fn_reconciliar`); sem match, o cupom ficava
  pendente, sem nenhum lançamento vinculado — e como o dashboard soma direto de
  `transacoes_banco.valor`, o gasto só entrava nos KPIs do mês quando o usuário importasse o
  extrato bancário depois (fluxo real do usuário: cupom no dia da compra, extrato do mês inteiro
  só depois). O usuário pediu que o lançamento seja criado e já vinculado no momento do upload do
  cupom, independente do método de envio.
- **Decisão:**
  - **Lançamento placeholder:** `transacoesService.criarAutoDeCupom` (domínio `transacoes`) cria
    um lançamento com `valor = -valor_total do cupom`, `data_transacao = data_emissao`,
    `descricao_bruta = estabelecimento`, `categoria = 'outros'` (dashboard usa a categoria de
    cada item do cupom, não a da transação, quando há vínculo — `gastosPorCategoria` em
    `dashboard-repository-pg.ts`), já com `cupom_id`/`status_reconciliado=true` e
    `origem='cupom'` (novo valor no CHECK constraint de `transacoes_banco.origem`, antes só
    `'ofx'|'manual'` — migration `0006_reconciliacao_lancamento_automatico.sql`). Sem lançamento
    quando `valor_total <= 0` (cupom manual criado sem itens ainda).
  - **Orquestração em `cupons-actions.ts`:** as 3 rotas de criação de cupom (`POST /`, `/upload`,
    `/nfce`) chamam um helper local `garantirLancamento` — roda `reconciliarSeguro` primeiro; se
    não achar match, resolve a conta via `contasService.resolverContaId` e chama
    `criarAutoDeCupom`. Best-effort: qualquer falha (ex.: tenant sem nenhuma conta cadastrada) é
    logada e nunca derruba a criação do cupom, mesmo espírito de `reconciliarSeguro`.
  - **Evita contar o gasto duas vezes:** o risco central é o extrato bancário real chegar depois
    (fluxo comum do usuário) e duplicar o gasto (placeholder + transação real, cada um contando
    separado no dashboard). `fn_reconciliar` foi reescrita para tratar um cupom cuja única
    transação vinculada é um placeholder (`origem='cupom'`) como ainda elegível para match; ao
    casar com uma transação real, apaga o placeholder (a trigger `trg_atualiza_saldo` reverte o
    valor dele) e vincula a real no lugar — implementado como um único statement SQL com CTEs de
    DML encadeadas (a remoção do placeholder e o UPDATE final mexem em PKs disjuntas, então a
    ordem de execução entre elas não importa). O mesmo cuidado foi replicado no vínculo manual
    (`PATCH /api/transacoes/:id` com `cupom_id`, usado no fluxo "+ Item"): `atualizar` em
    `transacoes-repository-pg.ts` agora apaga qualquer placeholder remanescente do mesmo
    `cupom_id` ao setar um vínculo manual.
  - **Conta do lançamento (decisão do usuário):** como nenhum formulário de cupom pedia conta,
    perguntei ao usuário como resolver isso; a escolha foi sempre mostrar um modal dedicado
    ("De qual conta é este cupom?") antes de enviar, em TODOS os pontos de entrada — não só um
    fallback silencioso — pré-selecionado com a conta padrão do tenant. Componente novo
    `public/conta-cupom-modal.js` (`window.ContaCupomModal.abrir(chamarApi)`, promise-based),
    reaproveitado pelos 3 fluxos: `cupons-ui.js` (criação manual, só quando não é vínculo direto
    a uma transação existente), `app.js` (`configurarDropzone` ganhou o parâmetro opcional
    `obterCamposExtras`, usado só no dropzone de cupom — o de extrato OFX não muda) e
    `nfce-scanner.js` (antes do POST, tanto no fluxo de câmera quanto no de colar link). O
    `conta_id` só é de fato usado se `garantirLancamento` precisar criar o placeholder — se a
    reconciliação já achou uma transação existente, é ignorado.
- **Arquivos impactados:** `infra/db/migrations/0006_reconciliacao_lancamento_automatico.sql`
  (novo), `src/domains/transacoes/{types,ports/transacoes-repository,adapters/transacoes-repository-pg,services/transacoes-service}.ts`
  e teste, `src/domains/cupons/actions/cupons-actions.ts`, `public/conta-cupom-modal.js` (novo),
  `public/dropzone.js` (novo — `configurarDropzone` extraído de `app.js`, que passou de 300 linhas
  com o parâmetro `obterCamposExtras`; mesmo padrão de extração já usado para `transacoes-tabela.js`,
  ver decisão de 2026-07-05), `public/index.html`, `public/cupons-ui.js`, `public/app.js`,
  `public/nfce-scanner.js`, `public/sw.js` (bump `CACHE_VERSION` → `financeiro-shell-v7`),
  `domains/cupons/CONTEXT.md`, `domains/reconciliacao/CONTEXT.md`, `domains/transacoes/CONTEXT.md`.
- **Consequências / Gotchas:** um cupom "reconciliado" no mês pode agora ser um placeholder ainda
  sem confirmação bancária — não há indicador visual distinto na tabela hoje (usa o mesmo badge
  "🧾 Detalhado" de um cupom casado com uma transação real); se isso confundir o usuário, um badge
  específico por `origem` é um follow-up de baixo custo. Vínculo manual de split-payment (mais de
  uma transação para o mesmo cupom, ver decisão de 2026-07-15) num cupom que já tenha um
  placeholder só é tratado no primeiro vínculo manual (que apaga o placeholder) — vínculos
  manuais adicionais depois disso já operam sem placeholder, comportamento inalterado. `conta_id`
  segue opcional nas 3 rotas (fallback via `contasService.resolverContaId` se vier ausente) como
  defesa em profundidade — o frontend sempre envia, mas o backend não depende disso.

## [2026-08-01] Importação de cupom via QR Code da NFC-e (scraping server-side)

- **Status:** accepted
- **Contexto:** o usuário trouxe um prompt pronto para ler o QR Code da NFC-e via **WebView nativo +
  injeção de JavaScript no DOM** da página da SEFAZ (arquitetura React Native/Flutter). Essa
  arquitetura não é executável neste repo: o projeto é um **PWA vanilla** (`public/*.js`, IIFE +
  globais `window.X`) sobre Express/TypeScript, sem WebView nativo. O núcleo da proposta original
  dependia de furar a *same-origin policy* — algo que só um WebView nativo permite; no navegador,
  o equivalente seria um `<iframe>`, e é impossível ler/injetar script num frame cross-origin de
  `nfce.fazenda.sp.gov.br`, que além disso envia headers que bloqueiam o embed. O script enviado
  também não cumpria a própria especificação (sem timeout de 15s, sem `INVALID_DOM`, sem
  `MutationObserver` pós-CAPTCHA). **Por que não WebView + DOM injection:** simplesmente não existe
  WebView neste stack para injetar o script.
- **Decisão:** manter o objetivo do usuário (ler QR → cupom completo com itens, sem foto de papel),
  mas mover o scraping para o **servidor**, onde não existe same-origin policy. O PWA lê o QR pela
  câmera (`BarcodeDetector`) e manda só a URL; o backend busca a página da SEFAZ, extrai o texto e
  usa o Gemini (`requisitarGeminiTextoJson`, texto — não imagem) para estruturar os dados,
  reaproveitando **todo** o pipeline de cupons já existente (validação → persistência → evento →
  reconciliação).
  - **Guard de SSRF (obrigatório, AGENTS §5 menor privilégio):** como o servidor passa a buscar uma
    URL vinda do usuário, `domain/nfce-url.ts#interpretarUrlNfce` exige `https:` e valida o host
    contra uma allowlist (`*.fazenda.<uf>.gov.br` / `*.sefaz.<uf>.gov.br`, com UF validada contra a
    lista das 27 unidades federativas) — rejeita IPs, domínios arbitrários e qualquer host fora
    dessa allowlist. `adapters/nfce-sefaz-gemini.ts` revalida o host **depois** de seguir redirects
    (`response.url`), já que a allowlist tem que valer para toda a cadeia, não só a URL original.
  - **Dedup por chave de acesso:** nova coluna `cupons_fiscais.chave_acesso` (migration
    `0005_cupons_chave_acesso.sql`, só `ALTER TABLE` — `check-migrations.js` só exige
    tenant_id/RLS/policy em `CREATE TABLE`, então passa limpo) com índice único parcial por
    `(tenant_id, chave_acesso)`. A chave de 44 dígitos é o identificador natural da nota — mais
    preciso que o hash de arquivo usado no dedup de upload (que não existe neste fluxo, já que não
    há arquivo, só uma URL).
  - **Extração da chave:** suporta QR 2.0 (`?p=<chave>|<versao>|...`) e QR 1.0 (`?chNFe=<chave>`),
    com fallback para o primeiro bloco de 44 dígitos na URL.
  - **`domain/html-para-texto.ts`:** remove `<script>`/`<style>`/comentários, converte tags em
    quebras de linha, decodifica entidades básicas, colapsa espaços e corta em ~60.000 caracteres —
    reduz custo de token e evita mandar lixo de HTML ao Gemini.
  - **Fallback quando a SEFAZ bloquear** (HTTP não-ok, CAPTCHA/challenge detectado no HTML, ou
    ausência de qualquer indício de nota, timeout de 15s): erro claro apontando os caminhos que já
    funcionam (foto do cupom ou lançamento manual) — sem cupom pela metade, sem fila de retentativa
    (não há worker em produção serverless).
- **Arquivos impactados:** `infra/db/migrations/0005_cupons_chave_acesso.sql` (novo),
  `src/domains/cupons/domain/nfce-url.ts` (novo) + teste, `src/domains/cupons/domain/html-para-texto.ts`
  (novo) + teste, `src/domains/cupons/ports/nfce-port.ts` (novo),
  `src/domains/cupons/adapters/nfce-sefaz-gemini.ts` (novo),
  `src/domains/cupons/ports/cupom-repository.ts`, `src/domains/cupons/adapters/cupom-repository-pg.ts`,
  `src/domains/cupons/services/cupom-service.ts` (+ teste), `src/domains/cupons/index.ts`,
  `src/domains/cupons/actions/cupons-actions.ts`, `public/nfce-scanner.js` (novo),
  `public/index.html`, `public/styles.css`, `public/app.js`, `public/sw.js` (bump
  `CACHE_VERSION` → `financeiro-shell-v6`).
- **Consequências / Gotchas:** o botão "Escanear NFC-e" exige contexto seguro (`localhost` ou HTTPS
  em produção) para `getUserMedia`; sem `BarcodeDetector` (iOS/Safari) o modal cai no fallback de
  colar o link manualmente — decodificar QR de imagem sem essa API exigiria uma lib (jsQR), fora de
  escopo aqui (exigiria ADR próprio + aprovação de nova dependência, AGENTS §2.4). Toda edição de
  frame com câmera aberta encerra as tracks (`stream.getTracks().forEach(t => t.stop())`) em todo
  caminho de saída (sucesso, cancelar, erro, `visibilitychange`) para não vazar o LED da câmera.

## [2026-07-31] Edição e Definição de Saldo Inicial / Atual de Contas Bancárias

- **Status:** accepted
- **Contexto:** o formulário de cadastro/edição de contas bancárias no frontend (`public/contas-ui.js`, `public/index.html`) só permitia alterar `nome` e `tipo` da conta. Não havia forma de o usuário definir um saldo inicial (ex: cartão Vale Alimentação com R$ 500,00) ou ajustar o saldo de uma conta existente.
- **Decisão:**
  - Adicionar o campo `Saldo da conta (R$)` (`#conta-saldo`) no formulário do modal de contas bancárias.
  - Atualizar o backend (`src/domains/contas/`) para aceitar o parâmetro `saldo` em `criar` (POST `/api/contas`) e `atualizar` (PATCH `/api/contas/:id`).
  - Quando um saldo é fornecido ao criar uma conta, ou alterado em uma conta existente, o sistema insere ou ajusta a transação de lançamento correspondente (`'Saldo inicial'`) via `transacoes_banco`, mantendo o `saldo_atual` da conta perfeitamente sincronizado pela trigger do banco (`trg_atualiza_saldo`).
- **Arquivos impactados:**
  - [public/index.html](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/index.html)
  - [public/contas-ui.js](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/contas-ui.js)
  - [src/domains/contas/ports/contas-repository.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/contas/ports/contas-repository.ts)
  - [src/domains/contas/adapters/contas-repository-pg.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/contas/adapters/contas-repository-pg.ts)
  - [src/domains/contas/services/contas-service.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/contas/services/contas-service.ts)
  - [src/domains/contas/actions/contas-actions.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/contas/actions/contas-actions.ts)
  - [src/domains/contas/__tests__/contas-service.test.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/contas/__tests__/contas-service.test.ts)
- **Consequências / Gotchas:** o usuário agora pode definir o saldo inicial ou ajustar o saldo corrente de qualquer conta bancária diretamente pelo modal "Contas bancárias".

---

## [2026-07-31] Categorização Semântica Inteligente de Lançamentos via Gemini IA

- **Status:** accepted
- **Contexto:** a categorização de transações bancárias utilizava apenas filtro estático SQL de palavras-chave (`regras_categorizacao`). Lançamentos cujos nomes de estabelecimentos não eram palavras idênticas (ex: `"DROGALIRA"`, `"POSTO SHELL"`, `"UBER TRIP"`) eram categorizados incorretamente (ex: `"transporte"`) ou caíam na categoria fallback `"outros"`. O botão **"CATEGORIZAR LANÇAMENTOS"** também utilizava apenas esse filtro estático SQL.
- **Decisão:**
  - Adicionar suporte a chamadas de texto estruturado puro no cliente Gemini (`requisitarGeminiTextoJson` em `src/shared/ia/gemini-client.ts`).
  - Criar o módulo `categorizarTransacoesComIA` (`src/shared/ia/categorizador-transacoes.ts`), que envia em lote as descrições dos lançamentos junto ao catálogo de categorias do tenant para que o Gemini AI identifique a categoria mais adequada (ex: `"DROGALIRA"` $\rightarrow$ `"farmacia"`).
  - Atualizar a importação de extratos (`src/domains/extrato/adapters/extrato-repository-pg.ts`) para aplicar regras aprendidas primeiro e, nos lançamentos sem regra manual, consultar a categorização do Gemini IA antes de inserir.
  - Atualizar o método `recategorizarTodas` (`src/domains/transacoes/adapters/transacoes-repository-pg.ts`) acionado pelo botão **"CATEGORIZAR LANÇAMENTOS"** para passar os lançamentos do tenant pelo modelo da IA Gemini.
- **Arquivos impactados:**
  - [src/shared/ia/gemini-client.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/shared/ia/gemini-client.ts)
  - [src/shared/ia/categorizador-transacoes.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/shared/ia/categorizador-transacoes.ts)
  - [src/domains/transacoes/adapters/transacoes-repository-pg.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/transacoes/adapters/transacoes-repository-pg.ts)
  - [src/domains/extrato/adapters/extrato-repository-pg.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/extrato/adapters/extrato-repository-pg.ts)
  - [src/shared/ia/__tests__/categorizador-transacoes.test.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/shared/ia/__tests__/categorizador-transacoes.test.ts)
- **Consequências / Gotchas:** descrições de lançamentos passam a ser analisadas semanticamente pela IA; se a API da IA estiver indisponível ou desativada em ambiente local, o sistema aplica o fallback automático para a correspondência estática por regras/outros.

---

## [2026-07-30] CRUD de Cupons Fiscais (Criação Manual, Adição de Itens e Vínculo Direto a Lançamentos)

- **Status:** accepted
- **Contexto:** o sistema dependia exclusivamente do OCR via IA (Gemini) para gerar cupons fiscais. Nos casos em que o cupom impresso foi perdido, amassado ou ilegível, o usuário não tinha uma forma de cadastrar o cupom manualmente ou vincular itens diretamente a lançamentos bancários existentes que ainda não possuíam cupom.
- **Decisão:**
  - Adicionar ao repositório e serviço de cupons (`src/domains/cupons/`) os métodos `criarManual`, `adicionarItem` e `excluirCupom`.
  - Expor as rotas REST `POST /api/cupons` (com suporte opcional ao parâmetro `transacao_id` para vincular o cupom manualmente e diretamente ao lançamento), `POST /api/cupons/:id/itens` (adição individual de produto ao cupom) e `DELETE /api/cupons/:id` (exclusão transacional do cupom).
  - Incluir a ação `+ Item` em todas as linhas da tabela de transações (`public/transacoes-tabela.js`). Para lançamentos sem cupom, clicar em `+ Item` abre o modal pré-preenchido com descrição, valor e categoria da transação, criando o cupom e convertendo o lançamento em `🧾 Detalhado`.
- **Arquivos impactados:**
  - [src/domains/cupons/actions/cupons-actions.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/cupons/actions/cupons-actions.ts)
  - [public/cupons-ui.js](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/cupons-ui.js)
  - [public/transacoes-tabela.js](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/transacoes-tabela.js)
  - [public/index.html](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/index.html)
  - [src/domains/cupons/ports/cupom-repository.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/cupons/ports/cupom-repository.ts)
  - [src/domains/cupons/adapters/cupom-repository-pg.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/cupons/adapters/cupom-repository-pg.ts)
  - [src/domains/cupons/services/cupom-service.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/cupons/services/cupom-service.ts)
  - [src/domains/cupons/actions/cupons-actions.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/cupons/actions/cupons-actions.ts)
  - [public/cupons-ui.js](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/cupons-ui.js)
  - [public/index.html](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/index.html)
- **Consequências / Gotchas:** permite resolver falhas de leitura do OCR e lançar notas perdidas com reconciliação imediata com transações bancárias.

---

## [2026-07-30] Priorizar coluna "Favorecido" na descrição extraída por OCR de extrato

- **Status:** accepted
- **Contexto:** ao ler extratos em PDF/imagem via Gemini (`extratoOcrGemini`), a IA vinha extraindo a coluna de Histórico/Tipo genérico (ex: "COMPRA CARTAO", "PIX ENVIADO") como descrição da transação, ignorando a coluna de Favorecido/Recebedor/Beneficiário quando presente no extrato. Isso prejudicava a categorização automática, já que o nome do favorecido (ex: "UBER", "IFOOD", "POSTO SHELL") entrega a categoria com muito mais precisão do que um histórico genérico.
- **Decisão:** ajustar `SYSTEM_PROMPT_EXTRATO` em `src/domains/extrato/adapters/extrato-ocr-gemini.ts` para instruir o modelo a sempre priorizar o nome do Favorecido/Recebedor/Beneficiário na descrição retornada, combinando-o com o histórico (formato "Histórico - Favorecido") quando ambos existirem no extrato.
- **Arquivos impactados:** [src/domains/extrato/adapters/extrato-ocr-gemini.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/extrato/adapters/extrato-ocr-gemini.ts)
- **Consequências / Gotchas:** melhora a taxa de acerto da categorização automática de transações importadas via OCR; não afeta extratos OFX (parser determinístico, sem IA).

---

## [2026-07-30] CRUD de Categorias de Gasto e Rotas REST no Domínio Categorias

- **Status:** accepted
- **Contexto:** não existia uma interface nem rotas de escrita para o usuário criar, editar ou excluir categorias de gasto customizadas (ex: "Educação"). As categorias eram fixas e semeadas via migration/listener.
- **Decisão:**
  - Expandir o domínio `categorias` com portas e adaptadores (`criar`, `atualizar`, `excluir`) operando com isolamento multi-tenant (`tenant_id`).
  - Gerar chave/slug sanitizada automaticamente (ex: "Educação" -> `educacao`) com validação de unicidade por tenant e proteção contra exclusão da categoria padrão `outros`.
  - Criar `src/domains/categorias/actions/categorias-actions.ts` exposto em `GET /api/categorias`, `POST /api/categorias`, `PATCH /api/categorias/:chave` e `DELETE /api/categorias/:chave`.
  - Adicionar o modal visual e o botão `+ Categoria` na topbar do frontend (`public/categorias-ui.js` e `public/index.html`), permitindo que a lista de opções em transações e cupons seja atualizada em tempo real ao cadastrar novas categorias.
- **Arquivos impactados:**
  - [src/domains/categorias/ports/categorias-repository.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/categorias/ports/categorias-repository.ts)
  - [src/domains/categorias/adapters/categorias-repository-pg.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/categorias/adapters/categorias-repository-pg.ts)
  - [src/domains/categorias/services/categorias-service.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/categorias/services/categorias-service.ts)
  - [src/domains/categorias/actions/categorias-actions.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/categorias/actions/categorias-actions.ts)
  - [public/categorias-ui.js](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/categorias-ui.js)
  - [public/index.html](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/index.html)
- **Consequências / Gotchas:** permite total flexibilidade na categorização de despesas sem necessidade de migrations para inclusão de novos tipos de gastos.

---

## [2026-07-30] Registro de AppErrors (4xx) nos logs de observabilidade (Vercel Serverless)

- **Status:** accepted
- **Contexto:** quando ocorria uma exceção de domínio `AppError` (como status 422 na validação de cupons fiscais por OCR), o `errorHandler` respondia com JSON diretamente ao cliente HTTP, mas não gerava registros no `logger`. No ambiente Vercel Serverless, isso resultava na mensagem *"No logs found for this request"*, dificultando o rastreio da razão da recusa no painel do Vercel.
- **Decisão:** adicionar `logger.warn` na captura de `AppError` dentro de `src/shared/errors/error-handler.ts`, garantindo que todas as falhas de validação de domínio e erros 4xx fiquem registradas nos logs do servidor.
- **Arquivos impactados:** [error-handler.ts](file:///c:/Users/pcDev/financeiro-/src/shared/errors/error-handler.ts)
- **Consequências / Gotchas:** permite diagnosticar motivos exatos de recusa de requisições 4xx diretamente pelos logs da Vercel em produção.

## [2026-07-18] Botão de limpar dados do mês atual e menu de perfil circular

- **Status:** accepted
- **Contexto:** o usuário solicitou uma maneira rápida e completa de apagar todas as transações, cupons fiscais e arquivos importados de um mês específico caso tenha feito alguma importação incorreta ou queira resetar o período. Para manter a interface limpa e organizada, esta funcionalidade de risco (destrutiva) deve ficar resguardada dentro de um menu dropdown acessado a partir de um botão circular de Perfil na barra superior, que também contém a opção de logout (Sair).
- **Decisão:**
  - **Função `limparMes` no repositório de transações:** executa em uma única transação de banco (`withTenantTransaction`) a deleção das tabelas `transacoes_banco` (filtro por `data_transacao`), `cupons_fiscais` (filtro por `data_emissao` e exclusão dos itens em cascata via chave estrangeira no Postgres) e `arquivos_importados` (filtro por `criado_em`), todas restritas ao `tenant_id` e à janela temporal do mês selecionado (`YYYY-MM-01` a `YYYY-MM-01 + 1 mês`).
  - **Trigger de consistência:** as triggers existentes no banco (`trg_atualiza_saldo`) recalculam o saldo consolidado das contas de forma consistente e automática ao excluir as transações.
  - **Auditoria:** adicionado o registro de log durável `mes.limpo` na tabela `audit_log` com informações do mês e o total de registros apagados.
  - **Menu de Perfil (Frontend):** adicionado um container `.perfil-container` substituindo o antigo botão "Sair" na barra superior do `index.html`. O botão de Perfil (`btn-perfil`) é circular, com um gradiente premium de fundo, exibindo a inicial do e-mail do usuário. Ao clicar, abre-se um dropdown que exibe o e-mail completo do usuário logado (ou "Modo Local" / inicial "L" se o `authMode === 'off'`), o botão "Limpar Mês Atual" e o botão "Sair" (exibido apenas se o modo de autenticação estiver ativo).
  - **Confirmação preventiva:** no clique do botão "Limpar Mês Atual", exibe-se um modal de confirmação no navegador antes de disparar a chamada de API. Ao concluir, atualiza KPIs e gráficos.
- **Arquivos impactados:**
  - [ports/transacoes-repository.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/transacoes/ports/transacoes-repository.ts)
  - [adapters/transacoes-repository-pg.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/transacoes/adapters/transacoes-repository-pg.ts)
  - [services/transacoes-service.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/transacoes/services/transacoes-service.ts)
  - [actions/transacoes-actions.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/transacoes/actions/transacoes-actions.ts)
  - [transacoes-service.test.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/domains/transacoes/__tests__/transacoes-service.test.ts)
  - [index.html](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/index.html)
  - [styles.css](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/styles.css)
  - [app.js](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/public/app.js)

## [2026-07-18] Aviso amigável de reenvio do mesmo arquivo (extrato ou cupom)

- **Status:** accepted
- **Contexto:** o usuário relatou que, ao reenviar sem querer o mesmo extrato ou o mesmo cupom
  fiscal, o sistema não avisava nada — o dedup existente (`hash_ofx` em transações, validação de
  cupom) só age *depois* de reprocessar o arquivo inteiro (inclusive OCR pago via Gemini no caso
  de cupom/PDF), e mesmo assim não comunica ao usuário que era um reenvio; ele "esperava alto" sem
  entender por que nada mudou no painel.
- **Decisão:**
  - **Nova tabela `arquivos_importados`** (migration `0004_arquivos_importados.sql`): registra
    `(tenant_id, tipo['extrato'|'cupom'], hash_arquivo, nome_arquivo, tamanho_bytes)` com UNIQUE
    `(tenant_id, tipo, hash_arquivo)`. Identifica o arquivo pelo **conteúdo** (sha256), não por
    nome/tamanho/metadados isolados — um arquivo renomeado continua detectado como o mesmo, e dois
    arquivos de mesmo nome mas conteúdo diferente não colidem.
  - **Helper compartilhado** `src/shared/arquivos/hash-arquivo.ts`: `sha256Hex` (um arquivo) e
    `hashConjuntoArquivos` (múltiplos arquivos — cupons longos em várias fotos, ver decisão de
    2026-07-15). O hash do conjunto usa os hashes individuais **ordenados** antes de compor o hash
    final, para que a mesma coleção de fotos enviada em ordem diferente gere o mesmo hash.
  - **Checagem ANTES de processar:** `extratoService.importarArquivo` e `cupomService.processar`
    calculam o hash e consultam `arquivos_importados` **antes** de chamar o parser OFX/OCR Gemini
    — evita gastar OCR pago num reenvio óbvio. Se já existe, lança `AppError` 409 com
    `details: { duplicado: true, nomeArquivo, enviadoEm }` e a mensagem cita quando foi o envio
    anterior.
  - **Escape hatch `forcar`:** ambas as rotas aceitam um campo de formulário `forcar=true` que pula
    a checagem — cobre o caso legítimo (ex.: duas compras idênticas no mesmo estabelecimento no
    mesmo dia, mesmo cupom "por acaso" com o mesmo conteúdo de bytes é extremamente raro mas o
    usuário pode querer forçar mesmo assim).
  - **Frontend:** `chamarApi` (`public/app.js`) agora anexa `status` e `detalhes` ao `Error`
    lançado. `configurarDropzone` detecta `status===409 && detalhes.duplicado`, mostra um
    `confirm()` com a mensagem amigável e, se aceito, reenvia automaticamente com `forcar=true`.
  - **Registro do arquivo** só acontece **depois** do processamento ter sucesso (não bloqueia
    reenvio se a primeira tentativa falhou por outro motivo, ex.: cupom inconsistente).
- **Arquivos impactados:** `infra/db/migrations/0004_arquivos_importados.sql` (novo),
  `src/shared/arquivos/hash-arquivo.ts` (novo) + teste,
  `src/domains/extrato/{types,ports/extrato-repository,adapters/extrato-repository-pg,services/extrato-service,actions/extrato-actions}.ts`,
  `src/domains/cupons/{types,ports/cupom-repository,ports/cupom-ocr-port,adapters/cupom-repository-pg,services/cupom-service,actions/cupons-actions}.ts`,
  `public/app.js`, testes de `extrato-service` e `cupom-service`.
- **Consequências / Gotchas:** a migration não pôde ser aplicada a partir do sandbox de
  desenvolvimento — o host de conexão direta do Supabase (`db.<projeto>.supabase.co:5432`) só tem
  registro DNS `AAAA` (IPv6) e o ambiente não tinha saída IPv6. Resolvido trocando `DATABASE_URL`
  (Vercel **e** `.env` local — são envs separados, atualizar um não propaga para o outro) para a
  connection string do "Transaction pooler" (`aws-*.pooler.supabase.com:6543`, IPv4), já
  recomendada em `.env.example`/`RUNBOOK.md` para deploys serverless por causa do limite de
  conexões concorrentes — troca que resolve os dois problemas de uma vez. Migration aplicada e
  confirmada (`npm run db:migrate` → "Banco já está atualizado").

## [2026-07-15] Suporte a cupons fiscais longos em múltiplas fotos com deduplicação multimodal no Gemini

- **Status:** accepted
- **Contexto:** o usuário relatou que cupons de mercado longos exigem tirar fotos muito distantes (o que reduz a legibilidade) ou aproximadas/fatiadas (o que gera itens duplicados devido às áreas de sobreposição nas transições de corte das fotos consecutivas).
- **Decisão:**
  - **Múltiplas imagens na API Gemini:** Atualizamos a função `requisitarGeminiJson` no client do Gemini para aceitar um lote/array de arquivos base64. O backend agora encaminha esse lote diretamente ao Gemini em uma única requisição multimodal.
  - **Prompt enriquecido:** Atualizamos o `SYSTEM_PROMPT` no domínio de cupons para orientar a IA de que as fotos representam pedaços sequenciais de um único cupom com possíveis áreas de sobreposição e que ela deve filtrar os itens duplicados na costura das transições.
  - **Frontend múltiplo:** Adicionamos o atributo `multiple` ao input de arquivos de cupom no `index.html` e alteramos `configurarDropzone` no `app.js` para enviar todos os arquivos sob o mesmo campo `arquivo` no payload `FormData`.
  - **Backend flexível:** Modificamos o multer de `upload.single('arquivo')` para `upload.array('arquivo', 10)` permitindo o recebimento de até 10 imagens sequenciais para o processamento unificado no `cupomService`.
- **Arquivos impactados:** `public/index.html`, `public/app.js`, `src/shared/ia/gemini-client.ts`, `src/domains/cupons/ports/cupom-ocr-port.ts`, `src/domains/cupons/adapters/cupom-ocr-gemini.ts`, `src/domains/cupons/services/cupom-service.ts`, `src/domains/cupons/actions/cupons-actions.ts`, `src/domains/cupons/__tests__/cupom-service.test.ts`.

## [2026-07-15] Flexibilidade financeira: Reconciliação dividida (Multi-Conta), novos tipos de conta e transferências

- **Status:** accepted
- **Contexto:** o usuário relatou a necessidade de poder dividir custos/compras representados por um mesmo cupom fiscal entre contas ou cartões diferentes (ex: parte pago com vale-alimentação, parte na conta corrente). Também identificamos limitações na categorização de transferências internas e na falta de suporte a tipos específicos de contas (Vale Alimentação, Vale Refeição, Cartão de Crédito).
- **Decisão:**
  - **Reconciliação multi-transação (1:N):** Removemos a restrição de índice único `uq_transacoes_cupom` na tabela `transacoes_banco` para permitir que mais de uma transação se associe ao mesmo cupom. Adaptamos o endpoint de atualização de transação (`PATCH /api/transacoes/:id`) para aceitar e validar o `cupom_id`. Na UI, adicionamos o campo opcional de vínculo ao modal de edição de lançamentos.
  - **Dashboard resiliente:** Alteramos a agregação de `gastosPorCategoria` no Dashboard para usar `EXISTS` em vez de um JOIN direto 1:N no `transacoes_banco`, eliminando o bug de duplicidade dos itens do cupom quando este possui múltiplos pagamentos vinculados.
  - **Novos tipos de conta:** Expandimos `TipoConta` e `TIPOS_CONTA_VALIDOS` no backend (`src/domains/contas/types.ts`) e o select correspondente no frontend (`public/index.html`) para incluir `vale_alimentacao`, `vale_refeicao` e `cartao_credito`.
  - **Suporte a transferências:** Criamos a categoria de sistema `'transferencia'` (inserida na nova migration para todos os tenants existentes e mapeada no seed de novos tenants). Ajustamos as queries de `resumo`, `fluxoDiario` e `gastosPorCategoria` para desconsiderar as transferências, evitando inflar gastos e ganhos gerais.
- **Arquivos impactados:** `infra/db/migrations/0003_flexibilidade_financeira.sql`, `src/domains/contas/types.ts`, `src/domains/dashboard/adapters/dashboard-repository-pg.ts`, `src/domains/transacoes/types.ts`, `src/domains/transacoes/services/transacoes-service.ts`, `src/domains/transacoes/adapters/transacoes-repository-pg.ts`, `src/domains/categorias/adapters/categorias-seed.ts`, `src/domains/cupons/ports/cupom-repository.ts`, `src/domains/cupons/adapters/cupom-repository-pg.ts`, `src/domains/cupons/services/cupom-service.ts`, `src/domains/cupons/__tests__/cupom-service.test.ts`, `public/index.html`, `public/transacao-form.js`.

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
