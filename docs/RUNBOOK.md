# RUNBOOK — operação e incidentes

## Setup local

```bash
npm install
cp .env.example .env      # preencha DATABASE_URL, GEMINI_API_KEY
                            # AUTH_MODE=off para dev single-user sem configurar Supabase Auth
npm run db:migrate
npm run dev
```

## Deploy

### Vercel (serverless — recomendado)
`api/index.ts` exporta o mesmo Express app via `src/app.ts`; `vercel.json` reescreve `/api/*`.
Variáveis obrigatórias no painel: `DATABASE_URL`, `DATABASE_SSL=true`, `GEMINI_API_KEY`,
`AUTH_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`. Use a connection
string do **Transaction pooler** (porta 6543) — funções serverless abrem muitas conexões
concorrentes e a conexão direta (5432) tem limite baixo.

### Servidor tradicional (Render/Railway/VPS)
Build `npm install && npm run build`, start `npm start`. O cron de reconciliação por
`setInterval` só roda aqui (hoje escopado ao tenant de `AUTH_MODE=off` — ver gap conhecido em
`docs/STATUS.md`).

## Incidente: `/api/health/ready` retorna "self-signed certificate in certificate chain"

**Causa:** `DATABASE_SSL_REJECT_UNAUTHORIZED` (padrão `true`, ver Lei de Segurança 6 no
`AGENTS.md`) valida o certificado do Postgres, e o CA do Supabase não está configurado.

**Correção definitiva:**
1. No painel do Supabase: **Settings → Database → SSL Configuration** → baixe o certificado CA.
2. Cole o conteúdo do `.crt` na variável `DATABASE_CA_CERT` (uma linha, com `\n` nas quebras, ou
   como o provedor de env permitir multi-linha).
3. Reinicie o processo. `/api/health/ready` deve responder `{"status":"ok"}`.

**Workaround temporário (dev local apenas, nunca produção):**
`DATABASE_SSL_REJECT_UNAUTHORIZED=false` no `.env` local — reproduz o comportamento anterior ao
Dev OS (sem validação de certificado). Não usar em produção: vulnerável a man-in-the-middle na
conexão com o banco.

## Incidente: usuário não consegue logar / "Sessão expirada"

- Confirme que `SUPABASE_JWT_SECRET` no backend é **exatamente** o mesmo de
  Settings → API → JWT Secret no painel Supabase (não a anon key, não a service role key).
- Tokens expiram; o frontend (`public/auth.js`) tenta renovar automaticamente via refresh token
  quando faltam menos de 60s para expirar. Se o refresh falhar, o usuário volta para a tela de
  login.

## Incidente: reconciliação automática não aconteceu após upload

- Reconciliação roda por gatilho após cada upload (`reconciliarSeguro`) e nunca propaga erro —
  falhas ficam só no log estruturado (`escopo: "reconciliacao"`). Busque por
  `"falha na reconciliação"` nos logs.
- Dispare manualmente: `POST /api/transacoes/reconciliar` (autenticado).
- Critérios do match: valor idêntico centavo a centavo + janela de 48h — divergências fora disso
  não casam por design (ver `infra/db/migrations/0002_multi_tenant_rls.sql`, `fn_reconciliar`).

## Rotação de segredos

`GEMINI_API_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`: trocar no painel do provedor e nas
variáveis de ambiente do deploy; não há cache de segredo na aplicação (lidos sob demanda via
`shared/config/env.ts`), então uma reinicialização do processo já pega o valor novo.
