# CONTRIBUTING

Este projeto segue o Dev OS descrito em `AGENTS.md` — leia-o primeiro (contém as regras
inegociáveis: segurança, boundaries entre domínios, geração por CLI).

## Fluxo de trabalho

1. `git checkout -b feat/minha-mudanca` (ou `fix/`, `chore/`... conforme Conventional Commits).
2. Leia `docs/STATUS.md` — confirme que não está reconstruindo algo que já existe.
3. Leia o `CONTEXT.md` do(s) domínio(s) que vai tocar.
4. Para estruturas novas (domínio, migration, action, event, worker), use
   `node scripts/generate.js <tipo>` — nunca crie manualmente do zero.
5. Escreva/atualize testes. Rode `npm test` e `npm run verify-rules` antes de commitar.
6. Atualize `docs/STATUS.md` (linha da feature) e adicione uma entrada em `docs/DECISIONS.md`
   se a mudança envolveu uma decisão arquitetural ou um contrato novo/alterado.
7. Commit com Conventional Commits (validado pelo hook `commit-msg`):
   `feat|fix|chore|refactor|docs|test|ci|build|perf|style(escopo): descrição`.
8. Abra um PR — o CI roda lint, typecheck, verify-rules, testes com cobertura, build e
   secret-scan. Todos precisam passar antes do merge.

## Rodando as travas localmente

```bash
npm run lint            # eslint
npm run typecheck        # tsc --noEmit
npm run verify-rules     # boundaries, RLS, tamanho de arquivo, segredos
npm test                 # vitest
npm run test:coverage     # com thresholds de cobertura
```

Os hooks de `pre-commit`/`commit-msg` (lefthook) rodam automaticamente após `npm install`
(`npm run prepare`). Eles são **versionados** em `lefthook.yml` — nunca edite `.git/hooks/`
diretamente; isso não seria compartilhado com o time.

## Dependências

Nova dependência de runtime (`npm install <pacote>`) exige aprovação explícita do humano **e**
uma entrada em `docs/DECISIONS.md` explicando por quê. Ferramentas de dev já aprovadas (eslint,
vitest, lefthook, etc.) não precisam de nova aprovação para atualizar de versão — isso é coberto
pelo Dependabot.

## Dúvidas de arquitetura

Se uma mudança exigir violar uma Lei de Segurança (`AGENTS.md` Seção 5), quebrar o contrato
público de um domínio (`index.ts`), ou tomar uma decisão irreversível — pare e pergunte antes de
implementar.
