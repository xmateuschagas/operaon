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
| 2026-09-30 | Sessão 0 | D1: `ADMIN_EMAIL` define o admin inicial (seed e primeiro login viram ADMIN e ACTIVE); aviso de novo cadastro sempre para `ADMIN_WHATSAPP`; RN-15 é proteção em tempo de execução | Mateus |
| 2026-09-30 | Sessão 0 | D2: webhook grava próximo passo "Primeiro contato" em agora + 1h no INSERT; necessidade vazia = "Não informada" também no formulário | Mateus |
| 2026-09-30 | Sessão 0 | D3: fonte da verdade do próximo passo é `leads`; campos de `lead_interactions` são registro histórico | Mateus |
| 2026-09-30 | Sessão 0 | D4: resposta do WhatsApp de lead PERDIDO ou excluído é ignorada e registrada em log | Mateus |
| 2026-09-30 | Sessão 0 | D5: opt-in explícito (checkbox manual, `whatsapp_opt_in` no formulário com ausente = false, coluna `opt_in` no CSV) e aviso ao criar compromisso para lead sem opt-in | Mateus |
| 2026-09-30 | Sessão 0 | D6: no CSV, telefone duplicado pula a linha, nunca atualiza e consta no relatório | Mateus |
| 2026-09-30 | Sessão 0 | D7: resposta associada por telefone, lead único do tenant e compromisso futuro não cancelado com lembrete SENT mais recente; sem correspondência, log | Mateus |
| 2026-09-30 | Sessão 0 | D8: fila em America/Sao_Paulo: Atrasado < agora, Hoje até 23:59:59, Próximos 7 dias; fila de hoje = Atrasados + Hoje; laranja = Atrasado | Mateus |
| 2026-09-30 | Sessão 0 | D9: capturas do protótipo em `docs/prototipo/` como referência visual | Mateus |
| 2026-09-30 | Sessão 0 | D10: adaptador `WhatsAppProvider` (`send(telefone, texto)`, webhook `{from, text, timestamp}`), respostas normalizadas; stack confirmada antes da sessão 6 | Mateus |
| 2026-09-30 | Sessão 0 | D11: retry de sync PENDING com backoff 1 min, 5 min, 15 min, 1 h e depois 6 h; após 24 h vira ERROR com aviso na agenda | Mateus |
| 2026-09-30 | Sessão 0 | D12: coluna `users.google_reauth_required`; `invalid_grant` marca true, pede nova autorização e deixa sync e criação PENDING | Mateus |
| 2026-09-30 | Sessão 0 | D13: set Redis `user_sessions:<user_id>` para apagar as sessões ao bloquear | Mateus |
| 2026-09-30 | Sessão 0 | D14: worker recria jobs a partir de `appointment_reminders` PENDING com `scheduled_for` futuro após restart | Mateus |
| 2026-09-30 | Sessão 0 | D15: sessão 7 dividida em 7a e 7b; testes das sessões 3 a 6 via API com coleção `.http` em `docs/api/` | Mateus |
| 2026-09-30 | Sessão 0 | D16: backup `pg_dump` diário às 03:00, retenção 7 diários + 4 semanais, envio via SSH ao servidor doméstico, restore testado e documentado | Mateus |
| 2026-09-30 | Sessão 0 | D17: webhook do formulário com telefone duplicado responde HTTP 200 com o id do lead existente, sem alterar o lead | Mateus |
| 2026-09-30 | Sessão 0 | D18: lead importado do CSV entra em NOVO com "Primeiro contato" em agora + 1h | Mateus |
| 2026-09-30 | Sessão 0 | D19: evento conhecido excluído direto no Google vira `status = CANCELLED` (não `deleted_at`), com lembretes CANCELLED | Mateus |
| 2026-09-30 | Sessão 0 | D20: webhook interno do WhatsApp protegido por `WHATSAPP_WEBHOOK_TOKEN` | Mateus |
| 2026-09-30 | Sessão 0 | D21: `tenants.timezone` é a fonte do fuso; `TZ_DEFAULT` só preenche o padrão | Mateus |
| 2026-09-30 | Sessão 0 | D22: trigger de imutabilidade em `lead_interactions` na sessão 1 | Mateus |
| 2026-09-30 | Sessão 0 | D23: sessão 2 entrega só a API de Acessos; a tela fica na 7b | Mateus |
| 2026-09-30 | Sessão 0 | D24: RN-10 com lead GANHO usa `confirmacao_cliente = REMARCAR` para destacar a agenda, sem coluna nova, e avisa o responsável pelo Notifier | Mateus |
| 2026-09-30 | Sessão 0 | D25: RN-16 na sessão 5, cobrindo perda por interação (sessão 3), perda na revisão (sessão 4) e exclusão de lead | Mateus |
| 2026-09-30 | Sessão 0 | D26: no boot, lembrete PENDING vencido vira CANCELLED com `error_log` "vencido durante indisponibilidade", exceto INSTANT_CONFIRMATION de compromisso futuro | Mateus |
| 2026-09-30 | Sessão 0 | D27: `restic` (sessão 8) e Testing Library (sessão 7) aprovados, com justificativa no PR de cada sessão | Mateus |
| 2026-09-30 | Sessão 0 | D28: novos critérios de aceite: índice de expressão da RN-03 (sessão 1), exclusão física auditada de `message_templates` (sessão 3) e alerta de queda da sessão do WhatsApp (sessão 8) | Mateus |
| 2026-10-16 | Documentação | D29: remover Redis do MVP e a variável REDIS_URL. Fila pg-boss no Postgres atrás de JobQueue, permitindo trocar por BullMQ sem mudar regras de negócio. Sessões em sessions, cookie HttpOnly opaco e índice por user_id. Aprovação e convites em tabelas com hash, TTL e uso único | Mateus |
| 2026-10-16 | Documentação | D30: sync unidirecional OperaON -> Google no MVP. Polling, syncToken e RN-14 passam para v2 | Mateus |
| 2026-10-16 | Documentação | D31: workspaces multi-tenant estilo Dropbox. users global sem tenant_id e e-mail único; tenant_members com tenant_id, user_id, papel OWNER/ADMIN/MEMBER, status PENDING/ACTIVE/BLOCKED, created_at e unicidade por vínculo. invitations com tenant_id, email, role, token_hash, expires_at e accepted_at. ADMIN_EMAIL aprova workspaces; OWNER/ADMIN aprovam e convidam membros. Sem workspace, pessoa pode solicitar criação pendente ou aceitar convite. Sessão guarda workspace ativo, interface tem seletor, RLS usa SET LOCAL app.tenant_id por transação, visibilidade e fuso são configurações locais. Aprovação sai de users para tenant_members. Sessão 2 ampliada para workspaces, membros e convites | Mateus |
| 2026-10-16 | Documentação | D32: API sem estado para várias réplicas, índices compostos iniciando por tenant_id para dados de workspace, webhooks idempotentes, limite de requisições por workspace, logs estruturados com tenant_id/user_id, healthcheck e readiness separados; PgBouncer previsto na sessão 8 | Mateus |
| 2026-10-16 | Documentação | D33: conexão Google por usuário, refresh token criptografado permanece em users, uma autorização por pessoa. Agenda dedicada por vínculo: `OperaON · <nome do workspace>`, com google_calendar_id em tenant_members, criada no primeiro acesso autorizado ao workspace | Mateus |
| 2026-10-16 | Documentação | D34: OWNER/ADMIN bloqueiam só o membro do seu workspace, limpando o workspace ativo das sessões afetadas e retornando ao seletor; demais workspaces continuam acessíveis. Admin da plataforma usa users.platform_status ACTIVE/BLOCKED; bloqueio global derruba todas as sessões por user_id. Ambas as ações registradas em audit_log | Mateus |
| 2026-10-16 | Documentação | D35: visibilidade proprios como padrão: MEMBER vê e edita só seus leads, OWNER/ADMIN todos do workspace. Em compartilhado, todo membro ACTIVE vê e edita todos os leads locais. Nos dois modos, só OWNER/ADMIN trocam o responsável | Mateus |
| 2026-10-16 | Sessão 2 | Decisão provisória do agente (revisar): convites expiram em 7 dias; sessões em 7 dias; estado OAuth em 10 minutos. Aprovação mantém 24h do RFC. Opções configuráveis sem alterar os estados e autorização | Autoauditoria do handoff |
| 2026-10-16 | Sessão 2 | Decisão provisória do agente (revisar): impedir bloqueio do último OWNER ACTIVE para evitar workspace sem responsável. Sem implementar transferência de propriedade nesta sessão | Autoauditoria do handoff |
| 2026-10-16 | Sessão 2 | Decisão provisória do agente (revisar): users.google_calendar_authorized registra consentimento de agenda separado do login básico, mantendo refresh token em users e agenda em tenant_members. Escopo mínimo calendar.app.created, suportado pela API oficial para agendas criadas pelo app | Autoauditoria do handoff |
| 2026-10-16 | Execução | Decisão provisória do agente (revisar): CI hospedado falhou antes de executar em três tentativas. Continuar implementação em branches criadas da dev com dependências locais explícitas, mantendo PRs abertos contra dev e proibindo sua integração sem CI verde. Não contornar o gate por status fabricado ou testes locais | Autoauditoria do handoff |
| 2026-10-16 | Sessão 3 | Decisão provisória do agente (revisar): telefone deve incluir DDI, aceitando apenas pontuação de apresentação antes de normalizar; não inferir país. Templates são consultados pelos membros e administrados por OWNER/ADMIN do workspace | Autoauditoria do handoff |
| 2026-10-16 | Sessão 4 | Decisão provisória do agente (revisar): CSV e gestão de integrações restritos a OWNER/ADMIN por atribuírem responsáveis. Reativar altera próximo passo e limpa nutrição, sem inventar último contato; revisão continua regida por RN-03. Importar linhas válidas e relatar ignoradas/erros, revalidando o arquivo no servidor | Autoauditoria do handoff |
| 2026-10-16 | Sessão 4 | Decisão provisória do agente (revisar): tokens próprios por integração/workspace; LEAD_FORM_TOKEN reservado a bootstrap explícito por admin da plataforma que também seja gestor local, evitando divulgar segredo global a gestores de outros workspaces. CSV limitado a 5000 registros e 1000000 caracteres por requisição | Autoauditoria do handoff |
| 2026-10-16 | Sessão 5 | Decisão provisória do agente (revisar): sincronização de saída por outbox transacional com worker imediato, API retorna PENDING até conclusão. Agenda Google usa marcador por vínculo e calendarList somente para recuperar criação após resposta incerta; consentimento incremental inclui calendar.app.created e calendar.calendarlist.readonly. Sem leitura de eventos, polling de entrada ou syncToken | Autoauditoria do handoff |
| 2026-10-16 | Sessão 5 | Decisão provisória do agente (revisar): compromisso pertence ao criador e usa sua agenda por vínculo; acesso segue a visibilidade do lead relacionado. Vínculo ou pessoa bloqueados impedem uso da conexão naquele processamento; manter PENDING até regularização | Autoauditoria do handoff |
| 2026-10-16 | Execução | Repositório tornado público pelo Mateus para resolver cobrança do Actions. Runner fixado em ubuntu-24.04. Se repetir a mesma falha de cobrança, merge na dev pode usar lint, typecheck e testes locais com saídas no PR. Substitui a proibição absoluta de integração durante bloqueio externo registrada acima; não dispensa correção de CI com falha de código | Mateus |
| 2026-10-16 | Sessão 6 | Decisão provisória do agente (revisar): contrato da API WhatsApp existente não fornecido. Implementar ponte normalizada interna com Idempotency-Key persistente obrigatório e correlação reply_to. Limite compartilhado de 30 envios/minuto/workspace. Sem ponte/configuração não enviar mensagens; aprovação segue no painel e convite pode ser copiado. Destinatários de avisos locais têm mapeamento explícito, separado de ADMIN_WHATSAPP. Validar ponte real antes de habilitar envio | Autoauditoria do handoff |
| 2026-10-16 | Sessão 8 | Decisão provisória do agente (revisar): quota HTTP inicial de 300 requisições/minuto/workspace, persistida antes do negócio e com Retry-After. Contadores técnicos têm retenção de dois dias. PgBouncer transaction para domínio, broker/migrations por conexão direta; tsx promovido a runtime explícito. Workflows ficam desabilitados até variáveis de release/deploy serem habilitadas pelo Mateus, sem executar entrega neste handoff | Autoauditoria do handoff |

## Conferência da sessão 09

D1 a D28 recuperadas da branch do PR #2, commit f46872c6d36f1ff38db6d81cd1a486c922a253dc. Relatório individual em docs/conferencia-d1-d28.md. D1/D13 são adaptadas por D29/D31/D34; D19 e RN-14 ficam para v2 por D30.

Decisão provisória do agente (revisar): a retenção e o backup de D16 usam restic via SFTP/SSH, com tag exclusiva operaon-db, 7 diários e 4 semanais. O horário 03h é America/Sao_Paulo no agendador, independente do fuso de cada workspace; habilitação e credenciais permanecem com Mateus. D27 aprova Testing Library, mas sua inclusão não é obrigatória: testes existentes usam React server rendering e React Query reais, sem nova dependência de aplicação.

Decisão provisória do agente (revisar): D20 mantém Bearer por integração como controle obrigatório; WHATSAPP_WEBHOOK_TOKEN, se configurado, exige também X-WhatsApp-Webhook-Token. D7 usa reply_to explícito para evitar escolher um compromisso errado. Falta de autorização Google mantém PENDING conforme D12; outras falhas têm janela D11 de 24h.
