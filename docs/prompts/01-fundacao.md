megaplan

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 1: fundação do projeto.

Escopo:
1. Monorepo pnpm: apps/api (Fastify), apps/web (React + Vite + Tailwind + TanStack Query), apps/worker (BullMQ), packages/shared (schemas Zod).
2. docker-compose.dev.yml com Postgres 16 e Redis 7 (AOF).
3. Drizzle com o schema completo da seção 5 do RFC: enums, constraints, índices, triggers de updated_at. Migrations reversíveis.
4. Seed com dados fictícios: 1 tenant (com default_owner_user_id apontando para o admin), 1 admin, 4 produtos, 10 leads em etapas variadas (incluindo 1 nunca contatado criado há mais de 7 dias).
5. GitHub Actions: lint, typecheck e testes em todo PR.
6. .env.example com todas as variáveis da seção 7.

Fora de escopo: autenticação, integrações, telas (só um "hello" no web).

Critérios de aceite:
- docker compose up + pnpm dev sobem api, web e worker sem erro.
- pnpm db:migrate e pnpm db:rollback funcionam.
- Testes provam RN-01, RN-05 e RN-06 no nível do banco.
- CI verde.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
