Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 1: fundação do projeto.

Escopo:
1. Monorepo pnpm: apps/api (Fastify sem estado local), apps/web (React + Vite + Tailwind + TanStack Query), apps/worker (pg-boss atrás de JobQueue), packages/shared (schemas Zod).
2. docker-compose.dev.yml com Postgres 16 em rede interna. Sem Redis.
3. Drizzle com schema da seção 5 do RFC: users global (platform_status, sem tenant_id), tenants, tenant_members, sessions, invitations, approval_tokens e tabelas de negócio. Enums, constraints, índices compostos por tenant_id, índice sessions(user_id), triggers de updated_at e migrations reversíveis. RLS com USING/WITH CHECK e SET LOCAL app.tenant_id em cada transação, role sem BYPASSRLS e sem propriedade das tabelas. Incluir base de contexto transacional para API, workers e webhooks.
4. Seed fictício: 1 workspace ACTIVE com timezone America/Sao_Paulo e visibilidade proprios, 1 usuário ACTIVE com vínculo OWNER ACTIVE e default_owner_user_id apontando para ele, 4 produtos e 10 leads em etapas variadas (incluindo 1 nunca contatado criado há mais de 7 dias). ADMIN_EMAIL é configuração da plataforma, não papel de tenant_members.
5. GitHub Actions: lint, typecheck e testes em todo PR.
6. .env.example com todas as variáveis da seção 7.

Fora de escopo: autenticação, integrações, telas (só um "hello" no web).

Critérios de aceite:
- docker compose up + pnpm dev sobem api, web e worker sem erro.
- pnpm db:migrate e pnpm db:rollback funcionam.
- Testes provam RN-01, RN-05 e RN-06 no nível do banco.
- Vitest verifica RN-22: RLS nega acesso sem contexto e entre workspaces, incluindo leitura e escrita. Fixtures de teste podem usar outro workspace para demonstrar isolamento e unicidade por tenant.
- Contrato JobQueue permite agendar, cancelar e retry sem dependência do provedor nas regras de negócio. Implementação pg-boss usa Postgres; dependência justificada no PR.
- Schema não inclui google_sync_token nem google_calendar_id em users; agenda por vínculo em tenant_members e refresh token criptografado em users (D33).
- CI verde.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
