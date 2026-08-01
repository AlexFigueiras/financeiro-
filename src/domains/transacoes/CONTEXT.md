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

`criarAutoDeCupom` cria um lançamento com `origem='cupom'` já vinculado (`cupom_id`) e reconciliado
(`status_reconciliado=true`) para um cupom fiscal sem transação correspondente — chamado só pelo
domínio `cupons` (via `index.ts`) como passo best-effort logo após o upload/criação de um cupom.
Sem lançamento (retorna `null`) quando `valorTotal <= 0`. `atualizar` apaga qualquer lançamento
`origem='cupom'` remanescente do mesmo `cupom_id` sempre que um `cupom_id` é setado manualmente
(ex.: fluxo "+ Item") — evita duas transações contando o mesmo cupom. Ver `domains/reconciliacao/CONTEXT.md`
para a limpeza equivalente no motor automático (`fn_reconciliar`).

## Gotchas
`origem` aceita `'ofx' | 'manual' | 'cupom'` (CHECK constraint em `infra/db/migrations/0006_...sql`) —
`'cupom'` marca um lançamento nunca digitado pelo usuário nem vindo de extrato, só existe pra
cobrir um cupom sem transação correspondente ainda.
