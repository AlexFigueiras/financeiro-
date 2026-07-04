# Tenancy — CONTEXT

## Propósito
Resolver e provisionar o tenant (conta/workspace) de cada usuário autenticado.

## Modelo
- `tenants`: um workspace isolado (dados financeiros de um cliente do SaaS).
- `tenant_members`: vínculo usuário ↔ tenant (papel `owner` | `member`). Hoje só criamos `owner` — múltiplos membros por tenant é possível no schema mas sem UI ainda.

## API pública
`index.ts` expõe `tenantService.resolverOuProvisionar(userId, email)`. NÃO expõe o repository diretamente — quem precisar de dados de tenant passa pelo service.

## Eventos
Publica `tenant.criado.v1` ao provisionar um tenant novo (consumido hoje pelo domínio `categorias` para seed do catálogo padrão).

## Regras locais
- RLS em `tenants`/`tenant_members`: policy `p_membro_tenant` usa `auth.uid()` (Supabase Auth) para o caminho PostgREST; policy `p_isolamento_app` usa `current_setting('app.tenant_id')` para o caminho da aplicação.
- Provisionamento é lazy: primeiro login sem tenant existente = tenant novo automaticamente (self-service signup).

## Gotchas
- Corrida em provisionamento duplo (dois primeiros-logins simultâneos do mesmo usuário) pode criar dois tenants — cenário raro, sem risco de vazamento de dado entre tenants, mas o usuário ficaria com um tenant "órfão" vazio. Se isso aparecer em produção, adicionar `UNIQUE` parcial ou lock consultivo.
