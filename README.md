# Painel Financeiro — Controle & Reconciliação Bancária Automatizada

Sistema pessoal que centraliza transações da **Caixa Econômica** (upload de OFX),
extrai itens de **cupons fiscais/NFC-e por IA (Gemini)** e reconcilia
automaticamente cada cupom com a transação bancária correspondente —
enriquecendo o extrato macro com os sub-itens reais da compra.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + TypeScript + Express (API-first) |
| Banco | PostgreSQL / Supabase (SQL bruto, sem ORM) |
| OCR | Google Gemini (`gemini-1.5-flash`, JSON estruturado) |
| Frontend | HTML/CSS/JS vanilla + Chart.js vendorizado (denso, estilo ERP, light/dark) |

## Subindo o sistema

```bash
# 1. Dependências
npm install

# 2. Configuração
cp .env.example .env      # preencha DATABASE_URL e GEMINI_API_KEY

# 3. Schema do banco (idempotente — pode reexecutar)
npm run build
npm run db:migrate        # ou: psql "$DATABASE_URL" -f db/schema.sql

# 4. Servidor
npm start                 # produção (dist/)
npm run dev               # desenvolvimento com hot-reload
```

Dashboard em `http://localhost:3000`. O servidor sobe mesmo sem a chave do
Gemini — apenas o OCR de cupons fica indisponível, com mensagem de erro explícita.

## Deploy em produção

### Render / Railway (servidor tradicional — recomendado)

Build command `npm install && npm run build`, start command `npm start`,
variáveis de ambiente (`DATABASE_URL`, `DATABASE_SSL`, `GEMINI_API_KEY`)
configuradas no painel do serviço. O cron de reconciliação roda normalmente,
pois o processo fica de pé.

### Vercel (serverless)

O projeto já vem preparado: `api/index.ts` exporta a mesma aplicação Express
via `src/app.ts`, e `vercel.json` reescreve `/api/*` para essa função — nenhuma
rota muda de endereço.

1. Import do repositório na Vercel, framework preset **Other**.
2. Em **Environment Variables**, adicione `DATABASE_URL`, `DATABASE_SSL=true`,
   `GEMINI_API_KEY`.
3. **Se o banco for Supabase, use a connection string do "Transaction pooler"
   (porta 6543), não a conexão direta (porta 5432)**. Funções serverless abrem
   muitas conexões concorrentes e a conexão direta tem limite baixo — sem o
   pooler, as rotas que tocam o banco falham com 500 mesmo com as variáveis
   corretas. Pegue essa string em Supabase → Settings → Database → Connection
   pooling.
4. O cron por `setInterval` **não existe no Vercel** (funções são efêmeras).
   Isso não é um problema: a reconciliação já dispara automaticamente a cada
   upload de OFX/cupom. Se quiser também uma varredura periódica, configure um
   [Vercel Cron Job](https://vercel.com/docs/cron-jobs) apontando para
   `POST /api/transacoes/reconciliar`.

## Arquitetura

```
db/schema.sql                  Schema completo: tabelas, índices, trigger de saldo,
                               fn_reconciliar() (o motor de match vive no banco)
api/index.ts                   Entry point serverless (Vercel) — reexporta src/app.ts
vercel.json                    Reescreve /api/* para a função acima
src/
  app.ts                       Monta o Express app (rotas, estático, error handler)
  index.ts                     Entry point tradicional: app.listen() + cron
  config/env.ts                Validação de variáveis de ambiente
  db/pool.ts                   Pool pg + helper de transação
  middleware/errorHandler.ts   AppError, asyncHandler, tratamento 23505 etc.
  services/
    ofx.ts                     Parser OFX SGML/XML próprio + dedup por hash
    gemini.ts                  OCR estruturado + validação soma dos itens
    reconciliacao.ts           Invoca fn_reconciliar() após cada ingestão e no cron
  routes/                      contas, transacoes, extrato, cupons, dashboard
  scripts/migrate.ts           Aplica db/schema.sql
public/                        Dashboard (index.html, styles.css, app.js, Chart.js)
```

### Modelo de dados

- `contas_bancarias` — saldo mantido por **trigger** a cada insert/update/delete de transação.
- `transacoes_banco` — `valor` positivo = entrada, negativo = saída; `hash_ofx`
  **UNIQUE** = sha256(data|valor|descrição|conta) impede duplicidade em qualquer
  reupload (regra antitransbordamento); `cupom_id` é o vínculo lógico do match.
- `cupons_fiscais` — cabeçalho + `json_bruto_ia` (JSONB) para auditoria da extração.
- `itens_cupom` — desmembramento produto a produto com categoria.
- Índices em data, valor, e **índice parcial** sobre transações pendentes
  (`WHERE status_reconciliado = FALSE`) para o motor de reconciliação.
- Todas as colunas temporais são `TIMESTAMPTZ`; datas sem fuso explícito são
  interpretadas como `America/Sao_Paulo`.

### Motor de reconciliação (`fn_reconciliar`)

Roda após cada upload de OFX, cada cupom processado e no cron periódico.
Critérios simultâneos:

1. `ABS(valor)` da saída bancária **igual centavo por centavo** ao `valor_total` do cupom;
2. `data_transacao` dentro de **±48h** da `data_emissao` (janela de compensação);
3. em empate, vence a transação **mais próxima no tempo**;
4. vínculo **1:1** garantido por índice único parcial (um cupom nunca liga a duas transações).

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Status do serviço e do banco |
| GET | `/api/contas` | Lista contas e saldos |
| POST | `/api/contas` | Cria conta (`{nome, tipo}`) |
| GET | `/api/transacoes?mes=YYYY-MM` | Lista unificada; reconciliadas trazem `itens_cupom` embutidos |
| POST | `/api/transacoes/reconciliar` | Dispara o motor manualmente |
| POST | `/api/extrato/upload-ofx` | multipart `arquivo` (.ofx) [+ `conta_id`] |
| POST | `/api/cupons/upload` | multipart `arquivo` (foto/PDF do cupom → Gemini) |
| GET | `/api/cupons/:id` | Cupom com itens desmembrados |
| GET | `/api/dashboard/resumo?mes=YYYY-MM` | KPIs: saldo, ganhos, gastos, balanço |
| GET | `/api/dashboard/fluxo-diario?mes=YYYY-MM` | Série diária ganhos vs gastos |
| GET | `/api/dashboard/gastos-por-categoria?mes=YYYY-MM` | Categorias dos cupons reconciliados + agregado "não detalhado" |

### Exemplos

```bash
# Upload de extrato OFX da Caixa (idempotente)
curl -F "arquivo=@extrato.ofx" http://localhost:3000/api/extrato/upload-ofx

# Upload de cupom fiscal (foto)
curl -F "arquivo=@cupom.jpg" http://localhost:3000/api/cupons/upload
```

## Segurança e tratamento de erros

- Tokens **somente** via `.env` (nunca em código; `.env` está no `.gitignore`).
- Todas as queries usam **parâmetros posicionais** (sem interpolação de SQL).
- Uploads com limite de tamanho (OFX 5 MB, cupom 15 MB) e validação de MIME type.
- Erros de API externa (401/403, 429, timeout, rede) mapeados para respostas
  HTTP explícitas (502/503) com mensagens acionáveis.
- Validação da extração da IA: JSON malformado, campos ausentes e **divergência
  entre soma dos itens e valor total** (tolerância R$ 0,05) são rejeitados com 422.
- Escritas multi-tabela (cupom + itens) em **transação** com rollback automático.

## Cron

A cada `SYNC_INTERVAL_MINUTES` (padrão 30) o servidor executa a reconciliação
como rede de segurança. Alternativa server-side: agendar
`SELECT * FROM fn_reconciliar();` via `pg_cron` no Supabase.
