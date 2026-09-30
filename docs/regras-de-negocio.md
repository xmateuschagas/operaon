# Regras de negócio

| RN | Regra | Onde é garantida |
|---|---|---|
| RN-01 | Lead fora de GANHO/PERDIDO não salva sem próximo passo (data e descrição) | Banco (CHECK) + API + tela |
| RN-02 | Toda interação atualiza `data_ultimo_contato` e grava o próximo passo prometido, na mesma transação | API |
| RN-03 | Inativo = `COALESCE(data_ultimo_contato, created_at)` há mais de 7 dias (lead nunca contatado conta a partir da criação), fora de GANHO/PERDIDO e com `nutricao_ate` vazio ou vencido | Consulta da revisão |
| RN-04 | Nutrição adia a revisão em 15 ou 30 dias (`nutricao_ate`) | API |
| RN-05 | PERDIDO exige motivo do enum (preço, sem retorno, timing, concorrente, outro) | Banco (CHECK) + API |
| RN-06 | Telefone salvo em E.164; duplicado bloqueia a criação e sugere o lead existente | Banco (índice único) + API |
| RN-07 | Lead do formulário entra como NOVO, origem "Formulário do site", responsável = `tenants.default_owner_user_id`, próximo passo "Primeiro contato" em +1h. No CSV: coluna `responsavel_email` opcional (vazia = responsável padrão), `origem` vazia = "Importação CSV", `necessidade` vazia = "Não informada" | Webhook |
| RN-08 | Um lembrete por tipo por compromisso. Na criação, lembrete com horário já passado não é criado; na remarcação, a linha existente cujo novo horário já passou vira `CANCELLED` | Banco (UNIQUE) + serviço |
| RN-09 | WhatsApp só para `whatsapp_opt_in = true`; resposta "SAIR" desliga | Worker + webhook |
| RN-10 | Resposta "1" confirma; "2" marca REMARCAR. Lead em aberto: `data_proximo_passo` = agora, descrição "Remarcar: <título do compromisso>" (aparece na fila de hoje). Lead GANHO: não volta ao funil; o responsável recebe aviso pelo Notifier e o compromisso aparece destacado na agenda | Webhook |
| RN-11 | Falha no Google salva local com `sync_status = PENDING` e reprocessa | Serviço + worker |
| RN-12 | Nada é apagado sem rastro: cada entidade segue o ciclo de vida da seção 5 do RFC, e toda exclusão ou bloqueio vai para o `audit_log` | API |
| RN-13 | Todo compromisso pertence a um lead; telefone e opt-in do WhatsApp vêm do lead | Banco (NOT NULL) + API |
| RN-14 | Evento criado direto na agenda "OperaON" pelo Google é ignorado pelo sync e registrado em log | Worker de sync |
| RN-15 | Lead do formulário ou CSV vai para `default_owner_user_id`. Se estiver vazio ou o usuário não estiver ACTIVE, vai para o admin ACTIVE mais antigo do tenant. Sem nenhum: webhook responde 503 e o CSV é recusado com mensagem clara | Serviço de captura |
| RN-16 | Lead excluído (`deleted_at`) ou marcado PERDIDO tem os compromissos futuros cancelados, com lembretes `CANCELLED` e evento removido do Google. Lead GANHO mantém os compromissos | API + worker |
