# Reconciliação — CONTEXT

## Propósito
Casar transações bancárias de saída com cupons fiscais (match 1:1 por valor exato + janela de 48h).

## Modelo
A lógica de match roda dentro do Postgres (`fn_reconciliar`, em `infra/db/migrations/0002_multi_tenant_rls.sql`) por ser uma operação set-based; o domínio aqui é fino (invoca a função, loga, publica evento).

## API pública
`index.ts` expõe `reconciliacaoService` (reconciliar, reconciliarSeguro) e `reconciliacaoRouter`.

## Eventos
Publica `transacoes.reconciliadas.v1` quando há pelo menos 1 match.

## Regras locais
`fn_reconciliar(p_tenant_id)` é sempre chamada com o tenant corrente — nunca reconciliar entre tenants.

## Gotchas
`reconciliarSeguro` nunca propaga erro (usado em gatilhos pós-upload) — se o motor falhar, o upload em si continua tendo sucesso e o usuário só não vê reconciliação automática. Erros aqui só aparecem no log estruturado.
