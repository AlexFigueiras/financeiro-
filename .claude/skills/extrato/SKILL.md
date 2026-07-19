---
name: extrato
description: Contexto do domínio "extrato" (sincronizado automaticamente de domains/extrato/CONTEXT.md — não edite aqui, edite lá).
---

# Extrato — CONTEXT

## Propósito
Ingestão de extratos bancários: arquivo OFX (parser próprio, puro) ou PDF/imagem (OCR via Gemini), com deduplicação.

## Modelo
`TransacaoOfx` (data, valor, descrição, fitid) é o formato intermediário comum entre as duas origens (OFX e OCR) antes de virar `transacoes_banco`.

## API pública
`index.ts` expõe `extratoService.importarArquivo` e `extratoRouter`. O parser puro (`domain/ofx-parser.ts`) pode ser importado por outros domínios/testes SEM I/O.

## Eventos
Publica `extrato.importado.v1` (ver `src/events/extrato-importado.ts`) após cada importação bem-sucedida.

## Regras locais
- Dedup por `hash_ofx` = sha256(data|valor|descricao|conta), UNIQUE por `(tenant_id, hash_ofx)` — evita duplicar transações individuais.
- Dedup por **arquivo**: `extratoService.importarArquivo` calcula sha256 do conteúdo bruto do upload (`shared/arquivos/hash-arquivo.ts`) e consulta `arquivos_importados` ANTES de rodar o parser OFX/OCR. Se já foi enviado, lança `AppError` 409 (`details.duplicado=true`) — evita reprocessar um extrato inteiro por engano. Passar `forcar=true` no upload pula a checagem.
- OFX 1.x da Caixa costuma vir em latin-1; detectado pelo header `CHARSET`/`ENCODING`.
- Linhas de "SALDO ..." são descartadas mesmo que a IA as devolva (reforço no código, não só no prompt).

## Gotchas
Sem indicação de fuso, datas OFX assumem America/Sao_Paulo (-03:00) fixo — não segue horário de verão (o Brasil não usa mais DST desde 2019, então isso é seguro).
