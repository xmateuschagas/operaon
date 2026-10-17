Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 3: leads, interações e fila diária.

Escopo:
1. CRUD de leads com exclusão lógica (RN-12) e normalização de telefone para E.164 (RN-06, retorna o lead existente ao duplicar).
2. Registrar interação: atualiza data_ultimo_contato, etapa e próximo passo na mesma transação (RN-01, RN-02, RN-05).
3. Endpoint da fila: atrasados, hoje, próximos 7 dias, com contadores.
4. Endpoint do funil agrupado por etapa com quantidade e soma do valor estimado.
5. Templates de mensagem por etapa com variáveis {nome}, {empresa}, {necessidade} e geração do link wa.me.
6. RN-19/D35: em proprios (padrão), MEMBER vê e edita só seus leads e OWNER/ADMIN todos do workspace. Em compartilhado, todo membro ACTIVE vê e edita todos. Só OWNER/ADMIN trocam responsável nos dois modos, para membro ACTIVE do mesmo workspace e pessoa ACTIVE.
7. Todas as operações usam workspace ativo autorizado, RLS com SET LOCAL app.tenant_id na transação, índices compostos por tenant_id e logs com tenant_id/user_id.

Fora de escopo: telas finais (sessão 7), revisão semanal (sessão 4).

Critérios de aceite:
- Testes para RN-01, RN-02, RN-05, RN-06 e RN-12 na API.
- Vitest para RN-19 e RN-22 cobre os dois modos de visibilidade, leitura/edição, troca de responsável e tentativas entre workspaces. Duplicidade não revela dados de lead sem permissão (RN-06).
- Fila usa timezone do workspace para definir "hoje", padrão America/Sao_Paulo; persistência em UTC.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
