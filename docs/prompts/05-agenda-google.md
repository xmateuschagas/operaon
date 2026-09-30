megaplan

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 5: agenda e sincronização com o Google.

Escopo:
1. Criar a agenda dedicada "OperaON" no primeiro acesso autorizado e guardar o id.
2. CRUD de compromissos espelhado no Google (criar, editar, cancelar), sempre vinculado a um lead (RN-13), e RN-16 ao excluir ou perder o lead.
3. RN-11: falha no Google salva local com sync_status PENDING e job reprocessa com backoff.
4. Sync bidirecional por polling a cada 5 min com syncToken; token inválido (410) faz sync completo; eventos criados fora do OperaON são ignorados (RN-14).
5. Renovação de access token e tratamento de refresh token revogado (marca o usuário para reautorizar).

Critérios de aceite:
- Testes com a API do Google simulada (mock) para criação, edição, exclusão e erro.
- Alteração feita no Google aparece no OperaON em até 5 min (teste em staging).
- Nenhum evento é criado na agenda principal do usuário.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
