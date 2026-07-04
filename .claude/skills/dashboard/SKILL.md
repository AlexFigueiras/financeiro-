---
name: dashboard
description: Contexto do domínio "dashboard" (sincronizado automaticamente de domains/dashboard/CONTEXT.md — não edite aqui, edite lá).
---

# Dashboard — CONTEXT

## Propósito
Agregações (KPIs, séries, distribuição por categoria) para os gráficos do frontend. É um domínio de "leitura" (read model), sem regra de negócio própria.

## Modelo
Nenhuma tabela própria — projeta `contas_bancarias`, `transacoes_banco`, `cupons_fiscais`, `itens_cupom` via SQL de agregação.

## API pública
`index.ts` expõe `dashboardService` (resumo, fluxoDiario, gastosPorCategoria) e `dashboardRouter`.

## Eventos
Não publica nem consome eventos.

## Regras locais
Todas as queries são escopadas por `tenant_id` explicitamente (além de RLS) — nunca confiar só na policy do banco para isolamento neste domínio, pois ele lê diretamente via `pool` (sem `withTenantTransaction`, já que são somente SELECTs).

## Gotchas
Este é o único domínio que lê tabelas de outros domínios diretamente por SQL, em vez de passar pelos `index.ts` deles — é uma exceção deliberada de CQRS (read model), não um precedente para lógica de escrita cross-domain.
