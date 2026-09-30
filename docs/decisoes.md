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
