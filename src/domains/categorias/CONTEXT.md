# Categorias — CONTEXT

## Propósito
Catálogo de categorias de gasto (seed padrão por tenant) consultado por `cupons` e `transacoes` para classificar itens/lançamentos.

## Modelo
`Categoria` (chave única por tenant, nome, cor). Populado no seed da migration (`infra/db/migrations/0001_schema_base.sql`) — hoje sem rota de criação/edição pelo usuário.

## API pública
`index.ts` expõe `categoriasService` (listar, existe). Sem router próprio — a rota pública `GET /api/cupons/categorias` mora no domínio `cupons` e apenas delega aqui.

## Eventos
Consome `tenant.criado.v1` (via `registrarListenerSeedCategorias`, chamado no bootstrap do app) para semear o catálogo padrão no tenant novo — ver `adapters/categorias-seed.ts`.

## Gotchas
Cada tenant novo herda as categorias fixas do seed original (mesmo `chave`) — como a unicidade agora é `(tenant_id, chave)`, tenants diferentes podem ter a mesma `chave` sem conflito.
