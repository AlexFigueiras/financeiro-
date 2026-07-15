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
| Importação de extrato OFX | ✅ | `src/domains/extrato/domain/ofx-parser.ts` | Parser próprio (SGML/XML), dedup por hash `(tenant_id, hash_ofx)`. |
| Importação de extrato via PDF/imagem (OCR) | ✅ | `src/domains/extrato/adapters/extrato-ocr-gemini.ts` | Descarta linhas de saldo mesmo se a IA as incluir. |
| OCR de cupom fiscal | ✅ | `src/domains/cupons/` | Valida soma dos itens vs. total (tolerância R$ 0,05). |
| Motor de reconciliação (match cupom↔transação) | ✅ | `infra/db/migrations/*.sql` (`fn_reconciliar`), `src/domains/reconciliacao/` | Match automático 1:1. Suporta vínculo manual 1:N (múltiplas transações/contas por cupom). |
| Categorização manual + aprendida | ✅ | `src/domains/transacoes/`, `src/domains/cupons/` | Regra aprendida por tenant em `regras_categorizacao`. |
| Dashboard (KPIs, gráficos, tabela) | ✅ | `src/domains/dashboard/`, `public/charts.js` | Sem paginação de gráfico por período customizado (só mês). |
| CRUD de transações (lançamentos) | ✅ | `src/domains/transacoes/`, `public/transacao-form.js`, `public/transacoes-tabela.js` | Criar manual, editar (data/valor/descrição/conta/categoria) e excluir. Editar data/valor de transação reconciliada desvincula o cupom. |
| CRUD de contas bancárias | ✅ | `src/domains/contas/`, `public/contas-ui.js`, `public/index.html` | Criar/listar/editar/excluir com UI. Suporta tipos especiais (vale alimentação/refeição e cartão de crédito). |
| CRUD de itens de cupom fiscal | ✅ | `src/domains/cupons/`, `public/item-cupom-form.js` | Editar nome/quantidade/preço unitário e excluir item; `cupons_fiscais.valor_total` é recalculado a cada mudança. |
| Cron de reconciliação periódica | 🟡 | `src/index.ts` | Só roda em `AUTH_MODE=off` (servidor tradicional single-tenant dev). Em produção multi-tenant, reconciliação dispara só por upload — sem varredura periódica por tenant ainda. |
| Cobrança/assinatura (billing) | ⬜ | — | Produto hoje não cobra; nenhuma integração de pagamento. |
| PWA instalável | ✅ | `public/manifest.webmanifest`, `public/sw.js`, `docs/pwa-play-store.md` | Inclui guia para publicação como app na Play Store (TWA). |
| Deploy serverless (Vercel) | ✅ | `api/index.ts`, `vercel.json` | `/api/*` reescrito para a função; frontend servido como estático. |
| Deploy servidor tradicional | ✅ | `src/index.ts` | Necessário para o cron funcionar continuamente. |
| Observabilidade (logs/trace/audit/health) | ✅ | `src/shared/observability/` | `audit_log` grava eventos sensíveis; sem APM/OTel externo plugado ainda. |
| Fundação Dev OS (verify-rules, generate, CI, hooks) | ✅ | `scripts/`, `.github/workflows/ci.yml`, `lefthook.yml` | Ver `AGENTS.md` §6. |
