# Sessão 1: fundação

Plano autoaprovado no handoff autônomo de 2026-10-16, após auditoria abaixo.

1. Criar monorepo pnpm com API Fastify, web React/Vite/Tailwind/Query/Router, worker e shared TypeScript strict. Web apenas inicial nesta sessão.
2. Drizzle para schema tipado; migration SQL inicial reversível baseada no RFC, com constraints compostas para impedir referências entre tenants, índices, triggers e RLS forçada. Role de runtime sem propriedade/BYPASSRLS. Banco de testes local/CI não é produção.
3. Contexto transacional com set_config local equivalente a SET LOCAL parametrizado, testes reais Postgres de RN-01, RN-05, RN-06 e RN-22. Identity/onboarding serão implementados na sessão 2 com operações restritas.
4. Interface JobQueue e adaptador pg-boss, agenda/cancelamento/retry e teste de contrato persistente. Seed fictício do RFC, CLI migrate/rollback/seed e Compose de dev em rede interna, sem portas públicas de banco.
5. ESLint, typecheck, Vitest e CI com Postgres 16. .env.example só com placeholders, instruções locais e justificativas de dependências no PR.

## Autoauditoria

- Escopo conferido com prompt 01: monorepo, Compose, schema, seed, CI e env incluídos. Nenhuma tela final, regra de autenticação ou integração real nesta sessão.
- D29: pg-boss somente atrás de JobQueue; sessões e tokens no schema Postgres. D31/D33/D34: users global, vínculo com agenda e bloqueio global separados. D32: índices por tenant e base de API sem estado. D35: default proprios no schema.
- RN-01/05/06 exercitadas por violações reais de constraints; RN-22 por role sem privilégios e tentativas de leitura/escrita cruzadas e sem contexto. Migração up/down/up e seed validados.
- Riscos: Docker local pode estar indisponível; usar Postgres de teste isolado ou CI, registrar limitação sem substituir evidência real por mocks de banco. Node local 24, alvo Node 22 no CI/containers.
- Dependências justificadas: Fastify/Zod/Drizzle/pg/pg-boss e stack web conforme RFC; tsx para execução TS, TypeScript/ESLint/Vitest e tipos para verificação. Supertest reservado para quando necessário; Fastify inject permite teste HTTP sem abrir porta.
- Resultado: APROVAR para implementação da sessão 1. Sem conflito impeditivo com o RFC.

## Autoauditoria da entrega

- Schema do RFC implementado com FKs compostas adicionais, índices de acesso compartilhado e grants restritos para histórico/auditoria. Migration up/down/up validada em Postgres 16.
- Sete testes passam: RN-01/05/06/22, seed, health/readiness e contrato de fila. Tentativa de referência cruzada também rejeitada pelo banco.
- Lint, typecheck e build web passam. Smoke test: API /ready e web retornaram 200, worker iniciou. Adaptador pg-boss usa política stately para deduplicar trabalhos pendentes por chave.
- Desvio técnico: dependências centralizadas no package.json raiz; pacotes apps mantêm links workspace. Lockfile fixa versões. Fastify inject substitui Supertest por evitar listener nos testes HTTP, sem dependência extra.
- Evidência local usa Node 24.19 e Postgres 16 isolado; CI fixa Node 22. Nenhuma integração externa real foi acessada.
- Validação adicional Linux identificou dependência de CRLF no checksum das migrations. Corrigido no runner com normalização para LF e .gitattributes. A migration SQL continua sem alterações após sua publicação inicial.
