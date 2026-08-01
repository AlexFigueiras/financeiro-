# STATUS — o que está pronto, parcial ou a fazer
> LEIA ISTO PRIMEIRO (antes de propor/implementar qualquer feature).
> Estado por feature. Histórico do *porquê* fica em DECISIONS.md; visão do produto, no plano.
> Legenda: ✅ pronto/funcionando · 🟡 parcial · ⬜ a fazer · 🚫 fora de escopo
> Última auditoria: 2026-07-04 (backfill brownfield ao adotar o Dev OS)

| Feature / fluxo | Estado | Onde (código) | Notas / decisão |
|---|---|---|---|
| Cadastro/login (Supabase Auth) | ✅ | `public/auth.js`, `public/login-ui.js`, `src/shared/security/auth-middleware.ts`, `src/shared/security/jwks.ts` | JWT ES256 (signing keys, via JWKS) e HS256 legado verificados sem SDK externo. Tela de login em `public/index.html`. |
| Self-service signup (tenant automático) | ✅ | `src/domains/tenancy/`, evento `tenant.criado.v1` | Primeiro login sem tenant provisiona um novo automaticamente. |
| Isolamento multi-tenant (RLS) | ✅ | `infra/db/migrations/0002_multi_tenant_rls.sql` | `tenant_id` em toda tabela + policy dupla (app + `auth.uid()`). |
| Convite de múltiplos membros por tenant | 🟡 | `tenant_members` (schema pronto) | Schema suporta `papel` (owner/member); **sem rota/UI de convite ainda**. |
| Importação de extrato OFX | ✅ | `src/domains/extrato/domain/ofx-parser.ts` | Parser próprio (SGML/XML), dedup por hash `(tenant_id, hash_ofx)` por transação. |
| Importação de extrato via PDF/imagem (OCR) | ✅ | `src/domains/extrato/adapters/extrato-ocr-gemini.ts` | Descarta linhas de saldo mesmo se a IA as incluir. |
| OCR de cupom fiscal | ✅ | `src/domains/cupons/` | Valida soma dos itens vs. total (tolerância R$ 0,05). Suporta upload de múltiplas fotos sequenciais de cupons longos com deduplicação via Gemini. |
| Aviso de reenvio do mesmo arquivo (extrato/cupom) | ✅ | `src/shared/arquivos/hash-arquivo.ts`, `arquivos_importados` (`infra/db/migrations/0004_arquivos_importados.sql`) | Dedup por hash do **conteúdo** do arquivo (não nome/tamanho), checado ANTES do parser/OCR — 409 amigável com opção "processar mesmo assim" (`forcar=true`) na UI. Migration aplicada em produção via `DATABASE_URL` do Transaction pooler (porta 6543). |
| Motor de reconciliação (match cupom↔transação) | ✅ | `infra/db/migrations/*.sql` (`fn_reconciliar`), `src/domains/reconciliacao/` | Match automático 1:1. Suporta vínculo manual 1:N (múltiplas transações/contas por cupom). |
| Lançamento automático para cupom sem transação correspondente | ✅ | `src/domains/transacoes/services/transacoes-service.ts` (`criarAutoDeCupom`), `src/domains/cupons/actions/cupons-actions.ts` (`garantirLancamento`), `infra/db/migrations/0006_reconciliacao_lancamento_automatico.sql` | Ao subir um cupom (manual, upload de foto/PDF ou QR Code da NFC-e) sem transação correspondente, cria um lançamento já vinculado (`origem='cupom'`) para contar no mês; frontend sempre pergunta a conta via modal `ContaCupomModal` (pré-selecionando a conta padrão). `fn_reconciliar` substitui esse placeholder pela transação real quando o extrato bancário chega depois, evitando contar o gasto duas vezes. |
| Categorização inteligente (IA Gemini) + aprendida | ✅ | `src/shared/ia/categorizador-transacoes.ts`, `src/domains/transacoes/`, `src/domains/extrato/` | Analisa descrições dos lançamentos com Gemini IA. Aplica regras aprendidas em `regras_categorizacao` e classifica semanticamente estabelecimentos (ex: Drogalira → Farmácia). Acionado na importação e no botão "Categorizar Lançamentos". |
| Dashboard (KPIs, gráficos, tabela) | ✅ | `src/domains/dashboard/`, `public/charts.js` | Sem paginação de gráfico por período customizado (só mês). |
| CRUD de transações (lançamentos) + Limpar Mês | ✅ | `src/domains/transacoes/`, `public/transacao-form.js`, `public/transacoes-tabela.js`, `public/app.js` | Criar manual, editar (data/valor/descrição/conta/categoria), excluir e botão para limpar todos os dados do mês de referência (oculto no Perfil). |
| CRUD de contas bancárias | ✅ | `src/domains/contas/`, `public/contas-ui.js`, `public/index.html` | Criar, listar, editar (nome/tipo/saldo) e excluir contas com UI. Suporta definição de saldo inicial e ajuste de saldo por conta (inclusive Vale Alimentação/Refeição). |
| CRUD de categorias de gasto | ✅ | `src/domains/categorias/`, `public/categorias-ui.js`, `public/index.html` | Criar, listar, editar (nome/cor) e excluir categorias do tenant com UI e botão "+ Categoria". Seed padrão (`categorias-seed.ts`) com 26 categorias (consumo + educação/doação/saúde/assinaturas/pets/impostos/investimentos/viagem/presentes/salário) aplicado a todo tenant novo. |
| CRUD de cupons fiscais e itens | ✅ | `src/domains/cupons/`, `public/cupons-ui.js`, `public/item-cupom-form.js` | Criar cupom manual sem OCR, adicionar novos itens, editar produtos/quantidades/preço, excluir itens/cupons e reconciliação automática. |
| Importação de cupom via QR Code da NFC-e | ✅ | `src/domains/cupons/domain/nfce-url.ts`, `src/domains/cupons/adapters/nfce-sefaz-gemini.ts`, `public/nfce-scanner.js` | Câmera lê o QR (`BarcodeDetector`), backend busca a página da SEFAZ (guard de SSRF por allowlist de host) e extrai via Gemini (texto). Dedup por `chave_acesso` (44 dígitos), reaproveita o pipeline de cupons. Fallback (iOS/Safari sem `BarcodeDetector`): colar o link manualmente. |
| Cron de reconciliação periódica | 🟡 | `src/index.ts` | Só roda em `AUTH_MODE=off` (servidor tradicional single-tenant dev). Em produção multi-tenant, reconciliação dispara só por upload — sem varredura periódica por tenant ainda. |
| Cobrança/assinatura (billing) | ⬜ | — | Produto hoje não cobra; nenhuma integração de pagamento. |
| PWA instalável | ✅ | `public/manifest.webmanifest`, `public/sw.js`, `docs/pwa-play-store.md` | Inclui guia para publicação como app na Play Store (TWA). |
| Deploy serverless (Vercel) | ✅ | `api/index.ts`, `vercel.json` | `/api/*` reescrito para a função; frontend servido como estático. |
| Deploy servidor tradicional | ✅ | `src/index.ts` | Necessário para o cron funcionar continuamente. |
| Observabilidade (logs/trace/audit/health) | ✅ | `src/shared/observability/` | `audit_log` grava eventos sensíveis; sem APM/OTel externo plugado ainda. |
| Fundação Dev OS (verify-rules, generate, CI, hooks) | ✅ | `scripts/`, `.github/workflows/ci.yml`, `lefthook.yml` | Ver `AGENTS.md` §6. |
