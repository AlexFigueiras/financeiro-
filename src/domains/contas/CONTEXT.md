# Contas — CONTEXT

## Propósito
CRUD de contas bancárias do tenant e resolução da "conta padrão" para uploads sem conta_id explícito.

## Modelo
`ContaBancaria`: nome (único por tenant), tipo (`corrente|poupanca|pagamento|carteira_digital|outro`), saldo_atual (mantido por trigger no banco a partir de `transacoes_banco`, nunca escrito diretamente por este domínio).

## API pública
`index.ts` expõe `contasService` (listar, criar, resolverContaId) e `contasRouter`. Não expõe o repository.

## Eventos
Não publica nem consome eventos hoje.

## Regras locais
RLS por tenant_id (migration 0002). Unicidade de `nome` é por tenant (`uq_contas_tenant_nome`), não mais global.

## Gotchas
`resolverContaId` cai para "primeira conta do tenant" quando `conta_id` não vem no body — útil para single-account users, mas se o tenant tiver múltiplas contas o comportamento pode surpreender; o frontend deveria sempre enviar `conta_id` explicitamente quando houver mais de uma conta.
