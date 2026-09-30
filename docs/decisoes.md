# Log de decisões

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
