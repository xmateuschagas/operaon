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
| 5 | Validada localmente, preparando PR | Agenda por vínculo, Google de saída, outbox e cancelamento RN-16. Oito testes novos, total 37, incluindo negação da descoberta global à API. |
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

- Atualização do Mateus: falha inicial causada por cobrança do repositório privado. Repositório público; novo push resolveu o CI. Workflow fixado em ubuntu-24.04. Exceção autorizada somente se repetir a mesma falha de cobrança: lint/typecheck/testes locais com saída colada no PR. Não foi necessário usar a exceção nos PRs #4 a #7.

