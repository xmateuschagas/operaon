# OperaON

CRM web da MicrotecON Sistemas Inteligentes. Node 22, pnpm 9.15.9 e Postgres 16.

## Desenvolvimento e verificação

1. Copiar .env.example para .env e preencher somente valores locais. O arquivo local é ignorado pelo Git.
2. No Compose, definir POSTGRES_PASSWORD, MIGRATION_DATABASE_URL para operaon_migrator no host postgres/banco operaon, DATABASE_URL para operaon_api, WORKER_DATABASE_URL para operaon_worker_login e QUEUE_DATABASE_URL para operaon_broker. Em dev podem usar conexão direta privada. Definir também as três passwords de provisionamento, chave AES e configuração OAuth local.
3. `docker compose -f docker-compose.dev.yml up -d postgres` inicia somente o banco privado. Preparar dependências, migrations e logins com `docker compose -f docker-compose.dev.yml run --rm --no-deps api sh -c 'corepack enable && pnpm install --frozen-lockfile && pnpm db:migrate && pnpm exec tsx scripts/start.ts provision'`.
4. `docker compose -f docker-compose.dev.yml up -d api worker web` sobe API em localhost:3000, web em localhost:5173 e worker. O banco não publica portas. Não usar credencial proprietária no runtime; o provisionamento inicializa o broker e depois revoga CREATE de banco.
5. No host, com Postgres isolado de dev no loopback: `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm exec tsx scripts/start.ts provision` e `pnpm dev`. Seed fictício via `pnpm db:seed` exige DATABASE_URL administrativa local, não a credencial restrita da API. Nunca apontar variáveis para produção.
6. Rodar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`. TEST_DATABASE_URL deve apontar para banco isolado com "test" no nome; os testes recriam os dados e exercitam migrations, constraints e RLS.

`pnpm db:rollback` reverte a última migration; checksums impedem editar migrations já aplicadas. O SQL de migration é a autoridade de constraints e RLS; o schema Drizzle fornece os tipos. Histórico e auditoria não permitem UPDATE/DELETE pelo runtime.

CI usa Node 22 e Postgres 16. Progresso e retomada em docs/progresso.md, pendências externas em docs/pendencias-mateus.md. Em modo autônomo, planos são autoauditados, sessões abrem PR para dev e só são integradas com CI verde. Somente o Mateus integra código na main.

O teste adicional `pnpm test:pool` exige a imagem `docker build -f deploy/pgbouncer/Dockerfile -t operaon-pgbouncer:test .` e TEST_DATABASE_URL direto para um banco descartável. Se o banco está em uma rede Docker privada, definir POOL_DOCKER_NETWORK, POOL_UPSTREAM_HOST e POOL_UPSTREAM_PORT. O harness publica o PgBouncer apenas em 127.0.0.1:56432 e remove seus recursos ao terminar. Migrations são feitas na URL direta; o teste alterna tenants no mesmo backend do pool.

## Operação preparada

Dockerfiles em apps/api, apps/worker e apps/web; pool em deploy/pgbouncer; stack em deploy/stack.yml. [Runbook](docs/runbook.md) explica secrets, bootstrap, backup/restore, probes, Google revogado e WhatsApp desconectado. [Contrato WhatsApp](docs/whatsapp.md) e [captura/CSV](docs/importacao-captura.md) descrevem integrações. Release/deploy ficam desabilitados até configuração explícita do Mateus. Nenhum deploy faz parte deste handoff.

## Como esta pasta funciona

| Pasta/arquivo | Para que serve |
|---|---|
| `AGENTS.md` | Regras fixas que o Devin segue em toda sessão |
| `docs/rfc-002.md` | Arquitetura, decisões, modelo de dados, fluxos e variáveis |
| `docs/regras-de-negocio.md` | RN-01 a RN-23; RN-14 reservada para v2 |
| `docs/prototipo.md` | Link do protótipo navegável |
| `docs/decisoes.md` | Log de decisões aprovadas (atualizado pelo Cowork) |
| `docs/prompts/` | Prompts prontos: Sessão 0 a 8 do Devin e o do Cowork |
| `docs/plans/` | Planos e autoauditorias de cada sessão |
| `apps/` | API Fastify, web React/Vite e worker pg-boss |
| `packages/shared/` | Contratos, schema Drizzle, migrations e JobQueue |

## Ciclo de cada sessão

1. Colar o prompt da sessão no Devin (modo plano).
2. Salvar o plano gerado em `docs/plans/NN-nome.md`.
3. Pedir ao Cowork para auditar o plano.
4. Ajustar o que for preciso e aprovar ("Implementar").
5. Revisar o PR, testar em staging e fazer merge.
