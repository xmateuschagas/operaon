# Progresso do MVP OperaON

## Retomada

Handoff autônomo de 2026-10-16. Ler este arquivo, AGENTS.md, RFC, regras e plano da sessão ativa. Toda sessão usa PR para dev e só pode ser integrada após CI verde e autoauditoria. Ao final, abrir PR dev -> main para revisão do Mateus, sem merge.

| Sessão | Status | Entrega / pendência |
|---|---|---|
| 0 | Concluída | PR #3 auditado contra D29 a D35 e merge documental autorizado; PRs #1 e #2 fechados com comentário solicitado. dev criada da main. Regras autônomas atualizadas. |
| 1 | Integrada na dev | PR #4, CI 38988489995 verde no Ubuntu 24.04. Fundação validada também localmente em Windows e Linux/Node 22. |
| 2 | Integrada na dev | PR #5, CI 38988657714 verde. OAuth, sessões, workspaces, convites, aprovações e bloqueios; 17 testes acumulados. |
| 3 | Integrada na dev | PR #6, CI 38988673220 verde. Leads, histórico, fila, funil e templates; 24 testes acumulados. |
| 4 | Integrada na dev | PR #7, CI 38988678940 verde. Revisão, nutrição, CSV e captura idempotente; 29 testes acumulados. |
| 5 | Integrada na dev | PR #8, CI 38988883401 verde. Agenda por vínculo, Google de saída, outbox e RN-16; 37 testes acumulados. |
| 6 | Integrada na dev | PR #9, CI 38989450345 verde. WhatsApp/lembretes e Notifier, 44 testes. Ponte real pendente de configuração/validação externa. |
| 7a | Integrada na dev | PR #10, CI 38990191972 verde. Interface de execução e cache por workspace, 49 testes acumulados. |
| 7b | Integrada na dev | PR #11, CI 38991441001 verde. Revisão, agenda, CSV, configurações, acessos e diretório restrito da plataforma. 52 testes e QA desktop/mobile. |
| 8 | Integrada na dev | PR #12, CI 38992986360 verde. 58 testes de aplicação, pooling real separado, imagens/config validadas e backup/restore local. Sem deploy. |
| 9 | Implementada, aguardando CI do PR | Branch sessao-09-conferencia. D1 a D28 recuperadas do PR #2, relatório individual em docs/conferencia-d1-d28.md e correções com migration 008. 72 testes locais aprovados; PR para dev, sem merge na main. |

## Evidências e retomada técnica

- Base documental: main a673b4c; PR #3 integrado sem código de aplicação.
- PRs de sessão e comandos serão registrados a cada entrega.
- D1 a D28 estavam ausentes da base original e foram recuperadas na sessão 09 da branch do PR #2, commit f46872c. Histórico restaurado em docs/decisoes.md e conferido individualmente em docs/conferencia-d1-d28.md.
- PR #4: https://github.com/xmateuschagas/operaon/pull/4. Run de CI 38985366166: três tentativas sem passos/logs. Diagnóstico das duas anotações solicitado ao Mateus por falta de acesso no conector e navegador sem login. Não marcar CI verde com base nos testes locais.
- Enquanto o CI externo estiver bloqueado, branches continuam criadas da dev e incorporam explicitamente a dependência local anterior para permitir implementação e testes. PRs permanecem abertos contra dev, sem integração até CI verde. Após liberar o CI, integrar em ordem e atualizar as bases. Este ajuste evita parar toda a implementação; não afrouxa o gate de merge.
- Banco Docker isolado: operaon-test-db, Postgres 16, porta 55432 somente 127.0.0.1. Credencial exclusivamente descartável de teste. Banco de validação Linux: operaon_linux_test. Nenhum serviço de produção foi acessado.
- Sessão 1 validada também em Linux/Node 22 no commit 87de9b4: install frozen, lint, typecheck, sete testes e build passaram. CI hospedado é um bloqueio distinto.

- Atualização do Mateus: falha inicial causada por cobrança do repositório privado. Repositório público; novo push resolveu o CI. Workflow fixado em ubuntu-24.04. Exceção autorizada somente se repetir a mesma falha de cobrança: lint/typecheck/testes locais com saída colada no PR. Não foi necessário usar a exceção nos PRs #4 a #7.

## Evidências da sessão 8

- pnpm lint e pnpm typecheck: exit 0. pnpm test: 57 aprovados e 1 teste de pooling separado ignorado nessa execução; novo teste de logs executado depois, 1 aprovado. pnpm test:pool: 1 aprovado contra PgBouncer real (24 transações, dois tenants, um backend). CI final do commit 51da187 confirmou 58 testes aprovados e o pooling separado aprovado (run 38992986360).
- docker build: API, worker, web e PgBouncer aprovados; docker stack config validado. API/worker como node e web como nginx, todos com health/readiness 200 e proxy web /api/ready 200. URLs de smoke test só em loopback; logins de API/worker/broker sem superuser, BYPASSRLS ou CREATE no banco após bootstrap.
- Backup custom e restore isolado: 1 workspace, 10 leads, 7 migrations. RLS: zero leads sem contexto, dez com contexto; restore-test recusou banco fora do sufixo _restore_test. Evidências locais ignoradas: .local/restore-validated.dump e .local/backup-db-names.txt.
- Handoff não executou release.yml, publicação GHCR ou deploy. Configuração real/staging e decisões provisórias aguardam revisão do Mateus. PR #12 integrado na dev em e9f2a95 após CI verde. Implementação concluída; entrega final dev -> main reservada à revisão do Mateus, sem merge do agente.

## Entrega final

Todas as sessões do handoff estão integradas na dev após autoauditoria e CI verde. Aguardando revisão final do Mateus no PR dev -> main chamado OperaON MVP: revisão final do Mateus. A main permanece sem merge de código de aplicação pelo agente. Pendências externas e decisões provisórias estão em docs/pendencias-mateus.md e docs/decisoes.md; operação em docs/runbook.md. Nenhum deploy foi executado.

## Conferência D1 a D28, sessão 09

Plano e autoauditoria em docs/plans/09-conferencia.md. Relatório antes/depois com evidências por decisão em docs/conferencia-d1-d28.md. Na base dev 6018dad: 9 implementadas, 5 de outra forma aceitável e 14 lacunas parciais/completas. Correções incluem D8 (instante do atraso e filtro diário), D20 (segredo interno adicional sem perder Bearer por workspace), D22 (trigger real) e D26 (boot), além de captura/opt-in, D11, TZ_DEFAULT, exemplos HTTP e backup restic/SSH com retenção. Sem acesso externo de operação ou alteração em graft/.

Verificação local da sessão 09: pnpm lint, pnpm typecheck e pnpm build aprovados; pnpm test com 72 aprovados e 1 pooling ignorado nessa execução; pnpm test:pool separado também aprovado, com PgBouncer real. Docker build da imagem operacional aprovado; deploy/test-backup.sh com restic real validou criptografia/restore de dump fictício, retenção 7/4, preservação de outra aplicação e interrupção quando pg_dump falha. Um payload do teste novo foi corrigido para informar campos nullable obrigatórios da interação; sem mudança na regra para contornar teste. CI hospedado será registrado antes de qualquer merge na dev.
