# DECISIONS — log vivo de decisões arquiteturais

> Entradas no topo (mais recente primeiro), formato ADR resumido. Decisões estruturais maiores
> ganham um ADR completo numerado em `docs/adr/`. Ver `AGENTS.md` §2.1 para quando registrar.

---

## [2026-07-04] Tratamento robusto de DATABASE_CA_CERT no pool do banco

- **Status:** accepted
- **Contexto:** a conexão da Vercel com o Supabase apresentou erro `self-signed certificate in certificate chain` mesmo após configuração da variável `DATABASE_CA_CERT` na Vercel. Isto ocorreu porque variáveis de ambiente multilinhas (como certificados PEM) ou variáveis coladas com aspas podem ser injetadas com quebras de linha Windows (`\r\n`) ou literais (`\\n`), quebrando o parse de TLS/OpenSSL do Node.js em ambiente Linux.
- **Decisão:** implementar normalização automática do certificado no pool de conexões (`src/infra/db/pool.ts`), removendo aspas externas duplicadas e substituindo quebras de linha inconsistentes por quebras LF padrões (`\n`).
- **Arquivos impactados:** [pool.ts](file:///c:/Users/Pc%20direito/Projetos%20Antigravity/financeiro-/src/infra/db/pool.ts)
- **Consequências / Gotchas:** garante conexão resiliente sem depender da formatação de entrada manual de segredos em provedores serverless.

## [2026-07-04] Bootstrap do Dev OS + migração para SaaS multi-tenant

- **Status:** accepted — ver ADR completo em `docs/adr/0001-bootstrap-devops-multitenant.md`
- **Contexto:** o software, antes pessoal/single-user, será vendido como produto. Isso exige
  multi-tenancy real, autenticação, RLS e uma fundação de qualidade (testes, CI, boundaries
  verificáveis por máquina) — nenhuma dessas coisas existia antes.
- **Decisão:** aplicar integralmente o PROJECT-OS-v3 (Context Engine, DDD/hexagonal em
  `domains/`, event-driven via `events/`, Leis de Segurança, observabilidade, `verify-rules` +
  `generate.js`, hooks versionados, CI, testes, skills de IA).
- **Arquivos impactados:** todo o `src/` foi reestruturado; `db/schema.sql` virou
  `infra/db/migrations/0001_schema_base.sql` + `0002_multi_tenant_rls.sql`; frontend público
  ganhou tela de login e foi modularizado.
- **Consequências / Gotchas:** ver seção "Consequências / Gotchas" do ADR 0001 — em especial,
  a conexão com o banco pode quebrar até o CA do Supabase ser configurado
  (`DATABASE_CA_CERT`, ver `docs/RUNBOOK.md`).
