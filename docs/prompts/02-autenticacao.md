Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 2: autenticação, workspaces, membros, convites e aprovação de acesso (D29, D31, D33 e D34).

Escopo:
1. OAuth Google com openid email profile; users global, e-mail único, platform_status ACTIVE/BLOCKED. Papel e aprovação em tenant_members, nunca users.
2. Sessão na tabela sessions do Postgres com cookie HttpOnly opaco, Secure, SameSite=Lax, logout e expiração. Workspace ativo pode ser nulo para onboarding/seletor. Índice por user_id permite derrubar todas as sessões da pessoa.
3. Usuário sem workspace pode solicitar criação (workspace e vínculo OWNER PENDING) ou aceitar convite. ADMIN_EMAIL aprova o workspace e ativa seu OWNER na mesma transação. OWNER/ADMIN aprovam e convidam membros locais. Aceite exige a conta Google convidada, token válido e não contorna vínculo BLOCKED.
4. Aprovações via Notifier (LogNotifier até a sessão 6) e painel. Tokens em approval_tokens e invitations: somente hash, TTL, consumo atômico único com alteração de estado. Aprovação vale 24h; proponha e obtenha aprovação do TTL dos convites no plano, antes de implementar.
5. Seletor básico e endpoints de workspaces, membros e convites. Ativar apenas workspace e vínculo ACTIVE. Configurações do workspace: lead_visibility proprios (padrão)/compartilhado e timezone (padrão America/Sao_Paulo).
6. Bloqueio local por OWNER/ADMIN: vínculo BLOCKED, limpar active_tenant_id apenas nas sessões desse user_id com o workspace afetado e retornar ao seletor. Outros workspaces continuam acessíveis. Bloqueio global por ADMIN_EMAIL: users.platform_status BLOCKED e exclusão de todas as sessions da pessoa. Auditar as duas ações, com tenant_id nulo apenas na ação global.
7. Middleware valida identidade global, workspace, vínculo e papel a cada requisição; contexto de RLS via SET LOCAL app.tenant_id por transação. Descoberta de vínculos e administração da plataforma usam operações restritas, sem acesso geral entre tenants. ADMIN_EMAIL não concede papel local automaticamente.
8. Consentimento incremental de agenda após aprovação e vínculo ativo, refresh token AES-256-GCM em users, reutilizado por todos os vínculos. Preparar fluxo para criar agenda por tenant_member no primeiro acesso (implementação da criação na sessão 5).

Fora de escopo: criação da agenda no Google (sessão 5).

Critérios de aceite:
- Vitest para RN-17, RN-18, RN-21 e RN-22: sessão sem workspace permite onboarding; workspace/vínculo PENDING nega dados com USER_PENDING_APPROVAL e BLOCKED com ACCESS_REVOKED; impedir ativação de workspace alheio e acesso cruzado.
- Testar pessoa com dois workspaces: bloqueio local volta só as sessões afetadas ao seletor; bloqueio global derruba todas e impede login. Ambas as ações geram audit_log.
- Token nunca aparece em texto puro no banco nem em logs.
- LogNotifier omite tokens e URLs com token; aprovação disponível pelo painel autorizado, sem expor o link em logs.
- Link de aprovação expira e não pode ser reutilizado.
- Testar convites expirados, concorrentes, reutilizados e com e-mail diferente, papéis locais e aprovação exclusiva de workspace por ADMIN_EMAIL. Aplicar RN-19 à autorização de leads da sessão 3.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
