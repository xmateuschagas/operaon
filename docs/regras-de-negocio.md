# Regras de negócio

| RN | Regra | Onde é garantida |
|---|---|---|
| RN-01 | Lead fora de GANHO/PERDIDO não salva sem próximo passo (data e descrição) | Banco (CHECK) + API + tela |
| RN-02 | Toda interação atualiza `data_ultimo_contato` e grava o próximo passo prometido, na mesma transação | API |
| RN-03 | Inativo = `COALESCE(data_ultimo_contato, created_at)` há mais de 7 dias (lead nunca contatado conta a partir da criação), fora de GANHO/PERDIDO e com `nutricao_ate` vazio ou vencido | Consulta da revisão |
| RN-04 | Nutrição adia a revisão em 15 ou 30 dias (`nutricao_ate`) | API |
| RN-05 | PERDIDO exige motivo do enum (preço, sem retorno, timing, concorrente, outro) | Banco (CHECK) + API |
| RN-06 | Telefone salvo em E.164; duplicado bloqueia a criação e sugere o lead existente. No CSV, linha com telefone duplicado é pulada, nunca atualiza o lead existente e consta no relatório de importação (D6) | Banco (índice único) + API + serviço de captura (CSV) |
| RN-07 | Lead do formulário entra como NOVO, origem "Formulário do site", responsável = `tenants.default_owner_user_id`; o webhook grava `data_proximo_passo` = agora + 1h e `descricao_proximo_passo` = "Primeiro contato" no próprio INSERT, e necessidade vazia vira "Não informada" (D2). No CSV: coluna `responsavel_email` opcional (vazia = responsável padrão), `origem` vazia = "Importação CSV", `necessidade` vazia = "Não informada". Opt-in (D5): checkbox "Cliente autorizou mensagens no WhatsApp" no cadastro manual, campo `whatsapp_opt_in` no formulário (ausente = false) e coluna opcional `opt_in` no CSV (sim/não; vazia = não) | Serviço de captura (webhook e CSV) + tela de cadastro |
| RN-08 | Um lembrete por tipo por compromisso. Na criação, lembrete com horário já passado não é criado; na remarcação, a linha existente cujo novo horário já passou vira `CANCELLED` | Banco (UNIQUE) + serviço |
| RN-09 | WhatsApp só para `whatsapp_opt_in = true`, obtido de forma explícita (D5) e conferido no envio; resposta "SAIR" desliga. Respostas normalizadas (trim, minúsculas, sem acento), aceitando "1", "2" e "sair" (D10) | Worker + webhook do WhatsApp |
| RN-10 | Resposta "1" confirma; "2" marca REMARCAR. Lead em aberto: `data_proximo_passo` = agora, descrição "Remarcar: <título do compromisso>" (aparece na fila de hoje). Lead GANHO: não volta ao funil; o responsável recebe aviso pelo Notifier e o compromisso aparece destacado na agenda. Lead PERDIDO ou excluído: resposta ignorada e registrada em log (D4). Associação (D7): telefone, lead único do tenant (RN-06), compromisso futuro não cancelado com o lembrete `SENT` mais recente; sem correspondência, ignora e registra em log | Webhook do WhatsApp |
| RN-11 | Falha no Google salva local com `sync_status = PENDING` e reprocessa com backoff de 1 min, 5 min, 15 min, 1 h e depois a cada 6 h; após 24 h vira `ERROR` com aviso na agenda (D11). `invalid_grant` marca `users.google_reauth_required = true` e sync e criação ficam `PENDING` até nova autorização (D12) | Serviço + worker |
| RN-12 | Nada é apagado sem rastro: cada entidade segue o ciclo de vida da seção 5 do RFC, e toda exclusão ou bloqueio vai para o `audit_log` | API |
| RN-13 | Todo compromisso pertence a um lead; telefone e opt-in do WhatsApp vêm do lead | Banco (NOT NULL) + API |
| RN-14 | Evento criado direto na agenda "OperaON" pelo Google é ignorado pelo sync e registrado em log | Worker de sync |
| RN-15 | Lead do formulário ou CSV vai para `default_owner_user_id`. Se estiver vazio ou o usuário não estiver ACTIVE, vai para o admin ACTIVE mais antigo do tenant. Sem nenhum: webhook responde 503 e o CSV é recusado com mensagem clara. É proteção em tempo de execução: o admin inicial vem de `ADMIN_EMAIL` e o seed já preenche `default_owner_user_id` (D1) | Serviço de captura |
| RN-16 | Lead excluído (`deleted_at`) ou marcado PERDIDO tem os compromissos futuros cancelados, com lembretes `CANCELLED` e evento removido do Google. Lead GANHO mantém os compromissos | API + worker |
