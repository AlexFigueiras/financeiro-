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
`index.ts` expõe `cupomService` (processar, importarPorUrlNfce, obterComItens, atualizarCategoriaItem) e `cuponsRouter`.

## Eventos
Publica `cupom.processado.v1` após persistir um cupom.

## Lançamento automático quando não há transação correspondente
As 3 rotas de criação (`POST /`, `/upload`, `/nfce`, em `actions/cupons-actions.ts`) chamam
`reconciliacaoService.reconciliarSeguro` após criar o cupom; se nenhuma transação bancária já
existente casar, o helper local `garantirLancamento` cria um lançamento auto-gerado e já
vinculado via `transacoesService.criarAutoDeCupom` (domínio `transacoes`), usando `contasService.resolverContaId`
para resolver a conta. Isso garante que o gasto entre no dashboard do mês mesmo sem o extrato
bancário real — ver `domains/reconciliacao/CONTEXT.md` para como esse placeholder é substituído
pela transação real quando ela chegar depois. Best-effort: uma falha nesse passo (ex.: tenant sem
nenhuma conta cadastrada) é logada e nunca derruba a criação do cupom.

As 3 rotas aceitam `conta_id` no corpo/form (o frontend sempre pergunta via o modal
`ContaCupomModal`, pré-selecionando a conta padrão do tenant) — só é de fato usado se o passo
acima precisar criar um lançamento; se a reconciliação já achou uma transação existente, o
`conta_id` enviado é ignorado (a transação existente já tem sua própria conta).

## Regras locais
`domain/validacao-cupom.ts` é puro: exige que a soma dos itens bata com `valor_total` (tolerância R$ 0,05) — reforça no código a mesma regra pedida no prompt da IA, para não confiar só no modelo.

Dedup por **arquivo**: `cupomService.processar` calcula um hash do conjunto de fotos enviadas (`shared/arquivos/hash-arquivo.ts#hashConjuntoArquivos` — estável independente da ordem das fotos) e consulta `arquivos_importados` ANTES de chamar o Gemini, para não gastar OCR pago num reenvio do mesmo cupom. Se já foi enviado, lança `AppError` 409 (`details.duplicado=true`). Passar `forcar=true` no upload pula a checagem (ex.: duas compras idênticas de fato).

## Importação via QR Code da NFC-e
`cupomService.importarPorUrlNfce(tenantId, urlBruta, { forcar })` (rota `POST /api/cupons/nfce`) recebe a URL lida da câmera pelo PWA (`public/nfce-scanner.js`, via `BarcodeDetector`) e reaproveita todo o pipeline: `domain/nfce-url.ts#interpretarUrlNfce` valida `https:` + allowlist de host (`*.fazenda.<uf>.gov.br` / `*.sefaz.<uf>.gov.br`) — **guard de SSRF obrigatório**, já que o servidor busca uma URL vinda do usuário — e extrai a chave de acesso (44 dígitos, QR 2.0 `?p=` ou QR 1.0 `?chNFe=`). `ports/nfce-port.ts` + `adapters/nfce-sefaz-gemini.ts` fazem o fetch da página pública (revalidando o host final após redirects), reduzem o HTML a texto (`domain/html-para-texto.ts`) e chamam `requisitarGeminiTextoJson` — sem OCR de imagem. Dedup por `cupons_fiscais.chave_acesso` (não pelo hash de arquivo, que não existe neste fluxo sem upload).

## Gotchas
Depende do domínio `categorias` (lista/valida chaves de categoria) — import permitido via `index.ts` público dele, nunca alcançando `internals`.

Sem `BarcodeDetector` (iOS/Safari), `public/nfce-scanner.js` cai no fallback de colar o link manualmente — decodificar QR de imagem sem essa API exigiria uma lib nova (jsQR), fora de escopo (exige ADR + aprovação prévia de dependência, AGENTS §2.4). Se a SEFAZ bloquear (CAPTCHA, fora do ar, nota ainda não processada), o erro é claro e não deixa cupom pela metade — sem fila de retentativa (não há worker em produção serverless).
