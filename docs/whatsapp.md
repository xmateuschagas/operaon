# Contrato da ponte WhatsApp

A stack existente não tem contrato de API fornecido neste repositório. O adaptador usa uma ponte interna configurada por WHATSAPP_API_URL, WHATSAPP_API_TOKEN e WHATSAPP_INSTANCE. Nenhuma chamada real faz parte dos testes.

POST /messages recebe instance, phone, text e chave Idempotency-Key. Responde JSON com id estável da mensagem. A ponte deve persistir a chave antes de enviar e devolver o mesmo resultado em reentregas, inclusive após reinício. Sem essa garantia do provedor/ponte, não é possível garantir ausência de duplicação após queda entre envio externo e commit local. Não habilitar envios reais antes de validar esse contrato.

POST /notifications recebe instance, phone e text com a mesma garantia. Aprovação de workspace usa somente ADMIN_WHATSAPP. Convites e avisos de remarcação usam NOTIFICATION_RECIPIENTS_JSON, mapa explícito por e-mail ou user_id para telefone E.164. Sem destinatário/configuração, a aprovação permanece no painel e o convite pode ser copiado pelo gestor; a aplicação registra somente indisponibilidade sanitizada. Não armazena links com tokens em outbox/logs.

O gestor cria a integração em POST /integrations/whatsapp. O segredo retornado uma única vez autentica POST /webhooks/whatsapp/:integration_id com Bearer e X-Event-Id. Corpo normalizado: phone (E.164), text e reply_to (ID da mensagem enviada). A ponte deve preservar o contexto da resposta; telefone sozinho não seleciona compromisso ou workspace. Mensagens sem correlação não alteram confirmação; SAIR opta por desligar o telefone no workspace autorizado mesmo sem reply_to.

A entrega de lembretes tem limite de 30 mensagens por minuto por workspace, compartilhado no Postgres. Retry/backoff da JobQueue respeita a revalidação local. Payloads, telefones e segredos não entram nos logs operacionais.
