Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 6: lembretes e WhatsApp.

Escopo:
1. Cliente da API de WhatsApp (instância configurável por variável).
2. Worker pg-boss atrás de JobQueue: confirmação imediata, 24h e 1h antes, com chave de deduplicação de negócio por workspace/compromisso/tipo/horário (seção 6 do RFC) e RN-08. job_id guarda o identificador retornado pelo adaptador, sem acoplar a regra ao formato do provedor.
3. Remarcar atualiza as mesmas linhas de lembrete e troca os jobs; cancelar remove os jobs (seção 6 do RFC).
4. Webhook interno de mensagens recebidas: RN-09 e RN-10.
5. Rate limit de envio, retry com backoff e registro de erro em appointment_reminders.
6. Implementar WhatsAppNotifier e trocar o LogNotifier da sessão 2.
7. Webhook idempotente por workspace e identificador externo persistido (RN-23). Resolver workspace pela integração autorizada, sem usar só telefone; RLS via SET LOCAL app.tenant_id em cada transação de worker/webhook, índices por tenant e logs com tenant_id/user_id.
8. Revalidar estado do compromisso, horário do lembrete e opt-in antes do envio; job antigo já em execução não pode enviar lembrete cancelado ou substituído.

Critérios de aceite:
- Reiniciar o worker não duplica envios.
- Nenhuma mensagem sai para lead sem opt-in.
- Testes para RN-08, RN-09 e RN-10.
- Vitest para RN-22 e RN-23: reentregas e jobs antigos não duplicam efeitos; isolamento entre workspaces, inclusive com o mesmo telefone. Avisos de aprovação distinguem admin da plataforma de OWNER/ADMIN locais.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
