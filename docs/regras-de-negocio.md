# Regras de negócio

| RN | Regra | Onde é garantida |
|---|---|---|
| RN-01 | Lead fora de GANHO/PERDIDO não salva sem próximo passo (data e descrição) | Banco (CHECK) + API + tela |
| RN-02 | Toda interação atualiza `data_ultimo_contato` e grava o próximo passo prometido, na mesma transação | API |
| RN-03 | Inativo = `COALESCE(data_ultimo_contato, created_at)` há mais de 7 dias (lead nunca contatado conta a partir da criação), fora de GANHO/PERDIDO e com `nutricao_ate` vazio ou vencido | Consulta da revisão |
| RN-04 | Nutrição adia a revisão em 15 ou 30 dias (`nutricao_ate`) | API |
| RN-05 | PERDIDO exige motivo do enum (preço, sem retorno, timing, concorrente, outro) | Banco (CHECK) + API |
| RN-06 | Telefone salvo em E.164; duplicado no mesmo workspace bloqueia a criação. Só sugere dados do lead existente se o membro puder vê-lo conforme RN-19 | Banco (índice único por tenant) + API |
| RN-07 | Lead do formulário entra como NOVO, origem "Formulário do site", responsável = `tenants.default_owner_user_id`, próximo passo "Primeiro contato" em +1h. No CSV: coluna `responsavel_email` opcional (vazia = responsável padrão), `origem` vazia = "Importação CSV", `necessidade` vazia = "Não informada" | Webhook |
| RN-08 | Um lembrete por tipo por compromisso. Na criação, lembrete com horário já passado não é criado; na remarcação, a linha existente cujo novo horário já passou vira `CANCELLED` | Banco (UNIQUE) + serviço |
| RN-09 | WhatsApp só para `whatsapp_opt_in = true`; resposta "SAIR" desliga | Worker + webhook |
| RN-10 | Resposta "1" confirma; "2" marca REMARCAR. Lead em aberto: `data_proximo_passo` = agora, descrição "Remarcar: <título do compromisso>" (aparece na fila de hoje). Lead GANHO: não volta ao funil; o responsável recebe aviso pelo Notifier e o compromisso aparece destacado na agenda | Webhook |
| RN-11 | Falha no Google salva local com `sync_status = PENDING` e reprocessa | Serviço + worker |
| RN-12 | Nada é apagado sem rastro: cada entidade segue o ciclo de vida da seção 5 do RFC, e toda exclusão ou bloqueio vai para o `audit_log` | API |
| RN-13 | Todo compromisso pertence a um lead; telefone e opt-in do WhatsApp vêm do lead | Banco (NOT NULL) + API |
| RN-14 (v2) | Na futura sincronização de entrada, evento criado direto no Google será ignorado e registrado em log. Fora do MVP, junto com polling e syncToken (D30) | Worker de sync da v2 |
| RN-15 | Lead do formulário ou CSV vai para default_owner_user_id com vínculo ACTIVE no workspace e platform_status ACTIVE. Se indisponível, usa o OWNER/ADMIN elegível mais antigo pelo created_at do vínculo. Sem nenhum: webhook responde 503 e CSV é recusado com mensagem clara. responsavel_email explícito no CSV também exige vínculo ACTIVE no mesmo workspace e pessoa ACTIVE | Serviço de captura |
| RN-16 | Lead excluído (`deleted_at`) ou marcado PERDIDO tem os compromissos futuros cancelados, com lembretes `CANCELLED` e evento removido do Google. Lead GANHO mantém os compromissos | API + worker |
| RN-17 | Usuário é global, e-mail único. ADMIN_EMAIL aprova novos workspaces; OWNER/ADMIN aprovam e convidam membros locais. Só workspace e vínculo ACTIVE autorizam acesso. Sem workspace, usuário pode solicitar criação ou aceitar convite; sessão permite onboarding e seletor | API + tenant_members + RLS |
| RN-18 | Bloqueio de membro revoga só o vínculo e limpa o workspace ativo nas sessões afetadas, voltando ao seletor. Bloqueio de plataforma marca users.platform_status BLOCKED e derruba todas as sessões por user_id. Ambos são auditados; bloqueio global impede novo login | API + sessions + audit_log |
| RN-19 | Em proprios (padrão), MEMBER vê e edita só seus leads e OWNER/ADMIN todos do workspace. Em compartilhado, todo membro ACTIVE vê e edita todos. Só OWNER/ADMIN trocam responsável nos dois modos, sempre para membro elegível do mesmo workspace | API + autorização + RLS |
| RN-20 | Uma conexão Google por pessoa, refresh token criptografado em users. Cada tenant_member tem google_calendar_id de `OperaON · <nome do workspace>`, criado no primeiro acesso autorizado. Sync apenas OperaON -> Google no MVP | OAuth + serviço de agenda + JobQueue |
| RN-21 | Aprovação e convite usam hash no Postgres, TTL e consumo único atômico. Aprovação vale 24h; convite exige expires_at e TTL definido no plano da sessão 2. Aceite vincula somente a conta Google com o e-mail convidado e não remove bloqueio existente | API + transação no Postgres |
| RN-22 | Dados de workspace são isolados por RLS com SET LOCAL app.tenant_id em cada transação autorizada, inclusive workers e webhooks. Datas persistem em UTC; exibição e definição de hoje usam o fuso do workspace, padrão America/Sao_Paulo | Banco + API + worker + interface |
| RN-23 | Reentrega de webhook no mesmo workspace não duplica efeitos. Limite de requisições por workspace é compartilhado entre réplicas | Banco + API + JobQueue |

Requisitos técnicos D29 e D32: fila pg-boss atrás de JobQueue, sessões no Postgres com cookie HttpOnly opaco e índice user_id, API sem estado, índices compostos de workspace iniciando por tenant_id, logs estruturados com tenant_id/user_id, healthcheck e readiness separados e PgBouncer previsto na sessão 8. Não há Redis no MVP.
