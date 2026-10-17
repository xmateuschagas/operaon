# OperaON

CRM web da MicrotecON Sistemas Inteligentes. Node 22, pnpm 9.15.9 e Postgres 16.

## Desenvolvimento e verificação

1. Copiar .env.example para .env e preencher somente valores locais. O arquivo local é ignorado pelo Git.
2. No Compose, definir POSTGRES_PASSWORD, MIGRATION_DATABASE_URL para operaon_migrator no host postgres/banco operaon, DATABASE_URL para o login de runtime e QUEUE_DATABASE_URL para o mesmo banco com acesso ao schema pgboss.
3. `docker compose -f docker-compose.dev.yml up` sobe banco privado, API em localhost:3000, web em localhost:5173 e worker. O banco não publica portas. A API executa migration antes de ficar pronta.
4. Provisionar login local sem superuser que herde operaon_app, role criada pela migration. Não usar credencial proprietária no runtime. Operação real usará credenciais separadas para migrations, runtime e fila.
5. No host, com Postgres isolado de dev no loopback: `pnpm install --frozen-lockfile`, `pnpm db:migrate`, `pnpm db:seed` e `pnpm dev`. Nunca apontar variáveis para produção.
6. Rodar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`. TEST_DATABASE_URL deve apontar para banco isolado com "test" no nome; os testes recriam os dados e exercitam migrations, constraints e RLS.

`pnpm db:rollback` reverte a última migration; checksums impedem editar migrations já aplicadas. O SQL de migration é a autoridade de constraints e RLS; o schema Drizzle fornece os tipos. Histórico e auditoria não permitem UPDATE/DELETE pelo runtime.

CI usa Node 22 e Postgres 16. Progresso e retomada em docs/progresso.md, pendências externas em docs/pendencias-mateus.md. Em modo autônomo, planos são autoauditados, sessões abrem PR para dev e só são integradas com CI verde. Somente o Mateus integra código na main.

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
