---
name: reconciliacao
description: Contexto do domínio "reconciliacao" (sincronizado automaticamente de domains/reconciliacao/CONTEXT.md — não edite aqui, edite lá).
---

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

Cupom sem transação correspondente no momento do upload ganha um lançamento **placeholder**
(`transacoes_banco.origem = 'cupom'`, criado por `transacoesService.criarAutoDeCupom` — ver
`domains/cupons/CONTEXT.md`). `fn_reconciliar` trata um cupom cuja ÚNICA transação vinculada é
esse placeholder como ainda elegível para match: quando uma transação REAL (OFX/PDF/manual)
casa com ele, a função apaga o placeholder (a trigger `trg_atualiza_saldo` reverte o valor dele)
e vincula a transação real no lugar — sem isso, o mesmo gasto seria contado duas vezes quando o
extrato bancário chegasse depois do cupom.

## Gotchas
`reconciliarSeguro` nunca propaga erro (usado em gatilhos pós-upload) — se o motor falhar, o upload em si continua tendo sucesso e o usuário só não vê reconciliação automática. Erros aqui só aparecem no log estruturado.

`PATCH /api/transacoes/:id` com `cupom_id` (vínculo manual, ex.: fluxo "+ Item" em
`domains/cupons`) faz a mesma limpeza de placeholder fora do motor SQL — ver
`transacoes-repository-pg.ts#atualizar`. Qualquer novo caminho que vincule uma transação a um
cupom manualmente precisa lembrar dessa mesma limpeza, senão reabre a brecha de double-counting.
