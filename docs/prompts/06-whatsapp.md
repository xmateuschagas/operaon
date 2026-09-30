megaplan

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 6: lembretes e WhatsApp.

Escopo:
1. Cliente da API de WhatsApp (instância configurável por variável).
2. Worker BullMQ: confirmação imediata, 24h e 1h antes, com jobId determinístico e RN-08.
3. Remarcar atualiza as mesmas linhas de lembrete e troca os jobs; cancelar remove os jobs (seção 6 do RFC).
4. Webhook interno de mensagens recebidas: RN-09 e RN-10.
5. Rate limit de envio, retry com backoff e registro de erro em appointment_reminders.
6. Implementar WhatsAppNotifier e trocar o LogNotifier da sessão 2.

Critérios de aceite:
- Reiniciar o worker não duplica envios.
- Nenhuma mensagem sai para lead sem opt-in.
- Testes para RN-08, RN-09 e RN-10.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
