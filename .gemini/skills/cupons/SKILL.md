---
name: cupons
description: Contexto do domínio "cupons" (sincronizado automaticamente de domains/cupons/CONTEXT.md — não edite aqui, edite lá).
---

# Cupons — CONTEXT

## Propósito
OCR inteligente de cupons fiscais (Gemini) com validação de consistência e persistência dos itens.

## Modelo
`cupons_fiscais` (cabeçalho) 1:N `itens_cupom`. `json_bruto_ia` guarda o payload integral retornado pela IA para auditoria/depuração.

## API pública
`index.ts` expõe `cupomService` (processar, obterComItens, atualizarCategoriaItem) e `cuponsRouter`.

## Eventos
Publica `cupom.processado.v1` após persistir um cupom.

## Regras locais
`domain/validacao-cupom.ts` é puro: exige que a soma dos itens bata com `valor_total` (tolerância R$ 0,05) — reforça no código a mesma regra pedida no prompt da IA, para não confiar só no modelo.

Dedup por **arquivo**: `cupomService.processar` calcula um hash do conjunto de fotos enviadas (`shared/arquivos/hash-arquivo.ts#hashConjuntoArquivos` — estável independente da ordem das fotos) e consulta `arquivos_importados` ANTES de chamar o Gemini, para não gastar OCR pago num reenvio do mesmo cupom. Se já foi enviado, lança `AppError` 409 (`details.duplicado=true`). Passar `forcar=true` no upload pula a checagem (ex.: duas compras idênticas de fato).

## Gotchas
Depende do domínio `categorias` (lista/valida chaves de categoria) — import permitido via `index.ts` público dele, nunca alcançando `internals`.
