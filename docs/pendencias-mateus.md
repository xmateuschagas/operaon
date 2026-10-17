# Pendências do Mateus

- WhatsApp: adaptar a stack existente ao contrato em docs/whatsapp.md, validar Idempotency-Key persistente após reinício e contexto reply_to. Configurar variáveis da ponte e destinatários locais explícitos em NOTIFICATION_RECIPIENTS_JSON. Testes usam mocks, nenhuma mensagem real foi enviada. Avisos sem configuração são registrados como indisponíveis, com aprovação pelo painel e convite copiável.

Integrações reais serão configuradas somente em dev/staging. Nenhum segredo deve ser commitado. Não executar deploy na VPS durante o handoff.

- Google: criar credenciais OAuth de desenvolvimento/staging, configurar redirect URI e consentimento de Calendar. A implementação usará adaptador real com testes simulados, sem exigir credenciais reais para CI.
- Configurar APP_URL com a origem pública do frontend e GOOGLE_REDIRECT_URI como APP_URL/api/auth/google/callback. O proxy deve preservar /api -> API. Login pede openid/email/profile; consentimento incremental pede calendar.app.created. Habilitar Calendar API e revisar tela de consentimento em staging. TOKEN_ENC_KEY deve ter 32 bytes aleatórios em base64 e SESSION_SECRET pelo menos 32 caracteres aleatórios, somente em secrets/.env local.
- Agenda: consentimento incremental também pede calendar.calendarlist.readonly para recuperar o marcador da agenda dedicada após resposta incerta de criação. Essa leitura usa somente metadados, nunca eventos ou syncToken. Revisar esse escopo provisório na configuração real. Revogação marca reautorização global; compromissos locais continuam PENDING até reconectar e reprocessar.
- Worker: provisionar login que herde operaon_worker (que herda operaon_app), configurar WORKER_DATABASE_URL e QUEUE_DATABASE_URL em rede privada. API usa login que herda somente operaon_app. Outbox despacha para pg-boss; Google real e teste de staging continuam pendentes por falta de credenciais/ambiente autorizados.
- WhatsApp: informar contrato e credenciais da stack existente, instância operaon e número central em variáveis locais ou secrets. Testes não enviarão mensagens reais.
- Infraestrutura: disponibilizar secrets, domínio e redes na operação posterior. Sessão 8 entrega os artefatos e runbook; o deploy permanece manual pelo Mateus.
- GitHub Actions: bloqueio de cobrança resolvido pelo Mateus ao tornar o repositório público. PRs #4 a #8 integrados após CI hospedado verde; runner fixado em ubuntu-24.04. Sem pendência atual de cobrança.
- Formulário: após configurar o workspace, um OWNER/ADMIN cria sua integração e guarda o token no backend do site. Enviar X-Event-Id estável nas reentregas e Authorization: Bearer. Não expor o token no frontend público; contrato em docs/importacao-captura.md. LEAD_FORM_TOKEN global só é usado no bootstrap explícito pelo admin da plataforma com papel local de gestor.

