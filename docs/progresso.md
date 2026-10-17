# Progresso do MVP OperaON

## Retomada

Handoff autônomo de 2026-10-16. Ler este arquivo, AGENTS.md, RFC, regras e plano da sessão ativa. Toda sessão usa PR para dev e só pode ser integrada após CI verde e autoauditoria. Ao final, abrir PR dev -> main para revisão do Mateus, sem merge.

| Sessão | Status | Entrega / pendência |
|---|---|---|
| 0 | Concluída | PR #3 auditado contra D29 a D35 e merge documental autorizado; PRs #1 e #2 fechados com comentário solicitado. dev criada da main. Regras autônomas atualizadas. |
| 1 | Bloqueio externo de CI, PR #4 aberto | Monorepo, schema Drizzle/migration reversível, RLS forçada, FKs por tenant, JobQueue/pg-boss, seed e CI. Sete testes reais Postgres, lint, typecheck, build e smoke test passaram no Windows. CI GitHub falhou antes de iniciar qualquer passo em três tentativas, sem logs. Correção de checksum LF em 87de9b4; repetição Linux em andamento. Sem merge na dev. |
| 2 | PR #5 aberto, sem merge | Branch criada da dev com dependência explícita da sessão 1. OAuth real com testes simulados, AES-GCM, sessões Postgres, workspaces, membros, convites, aprovação, bloqueios local/global e UI básica. 17 testes, lint, typecheck e build passaram; entrada/seletor verificados no navegador com fixture. Commit de8d508. |
| 3 | PR #6 aberto, sem merge | CRUD/histórico, fila por fuso, funil, templates e visibilidade. Sete testes novos, total 24; lint/typecheck/build passaram. Commit 20f0028, dependência explícita #5. |
| 4 | Validada, preparando PR | Revisão, nutrição, CSV com prévia/relatório e captura idempotente. Cinco testes novos, total 29; lint/typecheck passaram. Migration 003 reversível e RLS. Dependência explícita #6; sem merge na dev. |
| 5 | Pendente | Agenda e Google. |
| 6 | Pendente | WhatsApp e lembretes. |
| 7a | Pendente | Frontend: identidade, seletor, fila e funil. |
| 7b | Pendente | Frontend: revisão, agenda, acessos, captura e verificação visual. |
| 8 | Pendente | Artefatos operacionais, sem executar deploy. |

## Evidências e retomada técnica

- Base documental: main a673b4c; PR #3 integrado sem código de aplicação.
- PRs de sessão e comandos serão registrados a cada entrega.
- D1 a D28 não aparecem numeradas nos arquivos locais atuais; preservar o histórico disponível e ADRs do RFC, sem inventar decisões ausentes.
- PR #4: https://github.com/xmateuschagas/operaon/pull/4. Run de CI 38985366166: três tentativas sem passos/logs. Diagnóstico das duas anotações solicitado ao Mateus por falta de acesso no conector e navegador sem login. Não marcar CI verde com base nos testes locais.
- Enquanto o CI externo estiver bloqueado, branches continuam criadas da dev e incorporam explicitamente a dependência local anterior para permitir implementação e testes. PRs permanecem abertos contra dev, sem integração até CI verde. Após liberar o CI, integrar em ordem e atualizar as bases. Este ajuste evita parar toda a implementação; não afrouxa o gate de merge.
- Banco Docker isolado: operaon-test-db, Postgres 16, porta 55432 somente 127.0.0.1. Credencial exclusivamente descartável de teste. Banco de validação Linux: operaon_linux_test. Nenhum serviço de produção foi acessado.
- Sessão 1 validada também em Linux/Node 22 no commit 87de9b4: install frozen, lint, typecheck, sete testes e build passaram. CI hospedado é um bloqueio distinto.
