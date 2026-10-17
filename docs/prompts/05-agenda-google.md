Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 5: agenda e sincronização com o Google.

Escopo:
1. RN-20/D33: conexão Google por pessoa, refresh token criptografado em users; criar `OperaON · <nome do workspace>` no primeiro acesso autorizado a cada vínculo e guardar google_calendar_id em tenant_members. Reutilizar autorização já concedida, sem misturar agendas.
2. CRUD de compromissos espelhado no Google (criar, editar, cancelar), sempre vinculado a um lead (RN-13), e RN-16 ao excluir ou perder o lead.
3. RN-11: falha no Google salva local com sync_status PENDING e job reprocessa via JobQueue/pg-boss com backoff e idempotência.
4. D30: sync unidirecional OperaON -> Google. Alterações no Google não retornam ao OperaON. Polling, syncToken e RN-14 ficam fora do MVP, reservados à v2.
5. Renovação de access token e tratamento de refresh token revogado (marca a pessoa para reautorizar a conexão compartilhada pelos vínculos).
6. Usar tenant_id/user_id do compromisso para resolver agenda do vínculo. API e worker usam RLS com SET LOCAL app.tenant_id por transação e logs estruturados; índices de agenda iniciam por tenant_id.

Critérios de aceite:
- Testes com a API do Google simulada (mock) para criação, edição, exclusão e erro.
- Vitest cobre RN-11, RN-13, RN-16, RN-20 e RN-22: pessoa com dois workspaces tem agendas distintas com uma conexão Google; criação inicial idempotente, retry sem evento duplicado e isolamento.
- Validar em staging o envio OperaON -> Google, inclusive edição e cancelamento. Alterações feitas no Google não são importadas; não criar polling nem campo syncToken no MVP.
- Nenhum evento é criado na agenda principal do usuário.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
