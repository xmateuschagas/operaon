megaplan

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 2: autenticação e aprovação de acesso.

Escopo:
1. OAuth Google com openid email profile. Fluxo da seção 6 do RFC (PENDING, BLOCKED, ACTIVE).
2. Sessão no Redis com cookie HttpOnly, Secure, SameSite=Lax. Logout e expiração.
3. Consentimento incremental do escopo de agenda após aprovação; refresh token criptografado com AES-256-GCM.
4. Aviso ao admin via interface Notifier (implementação LogNotifier até a sessão 6) com link de uso único guardado no Redis conforme a seção 5 do RFC.
5. Endpoints e tela de Acessos: listar, aprovar, bloquear. Bloquear apaga as sessões do usuário na hora.
6. Middleware de autorização por papel e registro em audit_log.

Fora de escopo: criação da agenda no Google (sessão 5).

Critérios de aceite:
- Testes: PENDING recebe 403 USER_PENDING_APPROVAL; BLOCKED recebe 403 ACCESS_REVOKED; bloquear derruba sessão ativa.
- Token nunca aparece em texto puro no banco nem em logs.
- Link de aprovação expira e não pode ser reutilizado.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
