# Transações — CONTEXT

## Propósito
Listagem paginada do extrato consolidado (com itens de cupom embutidos quando reconciliado) e categorização manual/aprendida de lançamentos sem cupom.

## Modelo
Read model sobre `transacoes_banco` + `cupons_fiscais` + `itens_cupom`. Não possui tabela própria.

## API pública
`index.ts` expõe `transacoesService` (listar, atualizarCategoria) e `transacoesRouter`.

## Eventos
Não publica nem consome eventos hoje.

## Regras locais
Ao recategorizar uma transação, a regra é "aprendida" em `regras_categorizacao` (por tenant) e aplicada retroativamente a outras transações sem cupom com a mesma descrição. Validação de categoria válida é feita via `categoriasService.existe` (API pública do domínio `categorias`, importada em `index.ts`) — nunca acessando o repository interno dele.

## Gotchas
Nenhum conhecido no momento.
