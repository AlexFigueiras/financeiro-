# SYSTEM.md — Arquitetura do Sistema e Histórico de Recursos

Este documento registra a arquitetura do Painel Financeiro, seu modelo de dados e o controle de fases das features do projeto.

---

## 1. Filosofia e Arquitetura

O sistema é construído como uma aplicação Node.js monolítica de estilo ERP:
* **Backend**: Node.js + Express + TypeScript, sem ORMs complexos (SQL puro via `pg`).
* **Frontend**: SPA Vanilla HTML/CSS/JS com gráficos gerados dinamicamente via Chart.js.
* **Processamento**: Extração de dados via OCR inteligente integrado com a API do Google Gemini (`gemini-2.5-flash`).
* **Reconciliação**: Motor 1:1 executado no próprio banco de dados PostgreSQL via função SQL (`fn_reconciliar`).

---

## 2. Modelo de Dados

O banco de dados armazena contas, transações bancárias cruas (importadas via extrato OFX), cabeçalhos de cupons e os sub-itens reais das compras.

* `contas_bancarias`: Saldo calculado dinamicamente via triggers a partir das transações.
* `transacoes_banco`: Extrato consolidado (possui coluna `categoria` para despesas sem cupom).
* `cupons_fiscais`: Cabeçalho do cupom lido pela IA.
* `itens_cupom`: Sub-itens associados a um cupom fiscal.
* `categorias`: Categorias de gastos disponíveis no sistema (incluindo 'combustivel').
* `regras_categorizacao`: Mapeamento automático de nomes de produtos e descrições de transações para categorias.

---

## 17. Tabela de Fases das Features

| Fase | Feature | Descrição | Status |
| :--- | :--- | :--- | :--- |
| **Fase 1** | Importação de Extratos | Ingestão e deduplicação de arquivos OFX da Caixa Econômica. | Concluído |
| **Fase 2** | OCR de Cupons com IA | Processamento de imagens/PDFs via Gemini com validação de soma. | Concluído |
| **Fase 3** | Motor de Reconciliação | Match 1:1 baseado em valor exato e janela temporal de 48 horas. | Concluído |
| **Fase 4** | Categorização Inteligente | Mapeamento automático de itens, regras aprendidas e edição manual inline de itens e transações. | Concluído |

---

## Mudanças Arquiteturais Recentes

### Introdução de Categorias Dinâmicas (Fase 4)
* **Junho/Julho 2026**: Adicionadas tabelas `categorias` e `regras_categorizacao` para evitar o uso de strings brutas e possibilitar aprendizado de máquina local simples (regras baseadas no histórico do usuário).
* **Mapeamento Retroativo & Transações**: Ajustados os endpoints PATCH e processamento de cupons/transações para categorização direta de transações sem cupom e sincronização retroativa.
* **Correção de Fuso Horário**: Correção de desvios e shifts nas datas do frontend usando formatação explícita com `Intl.DateTimeFormat` na zona `America/Sao_Paulo`.
