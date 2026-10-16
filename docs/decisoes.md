# Log de decisões

Histórico preservado abaixo. Em caso de decisão substituída, prevalecem D29 a D35, aprovadas em 2026-10-16. D29 substitui o armazenamento de aprovação no Redis; D30 adia RN-14 para v2; D31 e D33 a D35 atualizam identidade, aprovação, agenda, bloqueio e visibilidade.

| Data | Sessão | Decisão | Aprovado por |
|---|---|---|---|
| 2026-09-30 | Pré-projeto | RFC-002 e RN-01 a RN-12 aprovados como base | Mateus |
| 2026-09-30 | Pré-projeto | Compromisso sempre vinculado a lead (RN-13); resolve RN-09 e RN-10 sem tabela de tarefas | Mateus |
| 2026-09-30 | Pré-projeto | Remarcar atualiza as mesmas linhas de lembrete; UNIQUE mantida | Mateus |
| 2026-09-30 | Pré-projeto | RN-12 passa a ser ciclo de vida por entidade (tabela no RFC) | Mateus |
| 2026-09-30 | Pré-projeto | tenant_id em lead_interactions e appointment_reminders; e-mail de usuário único global no MVP | Mateus |
| 2026-09-30 | Pré-projeto | Responsável padrão do tenant para formulário e CSV; defaults de origem e necessidade (RN-07) | Mateus |
| 2026-09-30 | Pré-projeto | Lead nunca contatado conta inatividade a partir da criação (RN-03) | Mateus |
| 2026-09-30 | Pré-projeto | Evento criado direto no Google é ignorado (RN-14) | Mateus |
| 2026-09-30 | Pré-projeto | Token de aprovação no Redis com TTL 24h e GETDEL | Mateus |
| 2026-09-30 | Pré-projeto | Avisos via interface Notifier: LogNotifier até a sessão 6 | Mateus |
| 2026-09-30 | Pré-projeto | Índice de expressão para a RN-03 | Mateus |
| 2026-09-30 | Pré-projeto | Fallback do responsável padrão (RN-15); seed preenche default_owner_user_id | Mateus |
| 2026-09-30 | Pré-projeto | Remarcação com lembrete vencido vira CANCELLED (RN-08) | Mateus |
| 2026-09-30 | Pré-projeto | Excluir ou perder lead cancela compromissos futuros; GANHO mantém (RN-16); RN-10 para lead GANHO avisa o responsável | Mateus |
| 2026-10-16 | Documentação | D29: remover Redis do MVP e a variável REDIS_URL. Fila pg-boss no Postgres atrás de JobQueue, permitindo trocar por BullMQ sem mudar regras de negócio. Sessões em sessions, cookie HttpOnly opaco e índice por user_id. Aprovação e convites em tabelas com hash, TTL e uso único | Mateus |
| 2026-10-16 | Documentação | D30: sync unidirecional OperaON -> Google no MVP. Polling, syncToken e RN-14 passam para v2 | Mateus |
| 2026-10-16 | Documentação | D31: workspaces multi-tenant estilo Dropbox. users global sem tenant_id e e-mail único; tenant_members com tenant_id, user_id, papel OWNER/ADMIN/MEMBER, status PENDING/ACTIVE/BLOCKED, created_at e unicidade por vínculo. invitations com tenant_id, email, role, token_hash, expires_at e accepted_at. ADMIN_EMAIL aprova workspaces; OWNER/ADMIN aprovam e convidam membros. Sem workspace, pessoa pode solicitar criação pendente ou aceitar convite. Sessão guarda workspace ativo, interface tem seletor, RLS usa SET LOCAL app.tenant_id por transação, visibilidade e fuso são configurações locais. Aprovação sai de users para tenant_members. Sessão 2 ampliada para workspaces, membros e convites | Mateus |
| 2026-10-16 | Documentação | D32: API sem estado para várias réplicas, índices compostos iniciando por tenant_id para dados de workspace, webhooks idempotentes, limite de requisições por workspace, logs estruturados com tenant_id/user_id, healthcheck e readiness separados; PgBouncer previsto na sessão 8 | Mateus |
| 2026-10-16 | Documentação | D33: conexão Google por usuário, refresh token criptografado permanece em users, uma autorização por pessoa. Agenda dedicada por vínculo: `OperaON · <nome do workspace>`, com google_calendar_id em tenant_members, criada no primeiro acesso autorizado ao workspace | Mateus |
| 2026-10-16 | Documentação | D34: OWNER/ADMIN bloqueiam só o membro do seu workspace, limpando o workspace ativo das sessões afetadas e retornando ao seletor; demais workspaces continuam acessíveis. Admin da plataforma usa users.platform_status ACTIVE/BLOCKED; bloqueio global derruba todas as sessões por user_id. Ambas as ações registradas em audit_log | Mateus |
| 2026-10-16 | Documentação | D35: visibilidade proprios como padrão: MEMBER vê e edita só seus leads, OWNER/ADMIN todos do workspace. Em compartilhado, todo membro ACTIVE vê e edita todos os leads locais. Nos dois modos, só OWNER/ADMIN trocam o responsável | Mateus |
