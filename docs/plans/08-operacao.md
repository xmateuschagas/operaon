# Sessão 8: operação e escalabilidade

1. Imagens multi-stage Node 22 para API/worker e Nginx para web, com usuário sem root, secrets por arquivo e build reproduzível via lockfile. Stack Swarm com duas réplicas da API, Traefik/TLS externo e redes privadas Postgres/PgBouncer/WhatsApp. Sem publicar portas internas e sem Redis.
2. API/worker usam PgBouncer transaction pooling para transações de negócio com SET LOCAL; pg-boss usa conexão direta privada ao Postgres para não depender da compatibilidade de recursos de sessão. Logins separados: API herda operaon_app, worker herda operaon_worker, broker apenas seu schema, migration é administrativa. Provisionamento parametrizado sem segredo versionado.
3. Limite HTTP de 300 requisições por minuto por workspace, agregado no Postgres e persistido antes da transação de negócio, incluindo falhas posteriores. Webhooks consomem a mesma quota após resolver integração autorizada. Rotas globais de identidade/health ficam fora da quota de workspace. Resposta 429 e Retry-After. Valores configuráveis, sem regra comercial nova.
4. Health de processo e readiness de dependências separados para API e worker. Logs JSON com tenant_id/user_id; alertar mudança de estado da conexão WhatsApp sem mensagem/token. Não exigir uma conta Google global para readiness.
5. Workflows de build/GHCR e deploy staging/produção prontos com gatilhos e ambientes protegidos, todos com ubuntu-24.04. Não executar publicação ou deploy neste handoff; deploy condicionado à habilitação explícita de variável do repositório pelo Mateus. Main permanece exclusiva do Mateus.
6. Backup pg_dump custom diário e restore somente em banco de teste explicitamente nomeado. Validar round-trip local isolado, registrar comandos/evidência e runbook de rollback, WhatsApp indisponível e Google revogado.
7. Testes reais de RN-18/22/23 em duas instâncias de API e pool: sessões/bloqueios compartilhados, contador agregado, reentrega idempotente e ausência de contexto residual. Testar conexão via PgBouncer local, além dos Dockerfiles e stack config, sem VPS.

## Autoauditoria

- Limite por minuto e dados persistentes cumprem D32; não criar contador por réplica. Workers mantêm geração e idempotência da sessão 6.
- Preservar migrations anteriores; adicionar 007 para quota. Scripts operacionais não apagam branches/histórico nem acessam produção. Não executar workflows remotos de deploy.
- Exceção ao prompt 08 que pede deploy real: limite explícito do handoff prevalece. Entregar artefatos e pendências, sem declarar staging validado.
- Desafio de runtime: shared exporta TypeScript; manter tsx como dependência de runtime justificada, ou compilar bundle. Escolha simples: tsx em produção e imagem contendo somente dependências production e fontes necessárias; Vite só no builder web.
- Resultado: APROVAR plano após 7b. Nenhum segredo real será solicitado ou usado.

Referências: [modos de pooling](https://www.pgbouncer.org/features.html), [configuração PgBouncer](https://www.pgbouncer.org/config.html) e [secrets Swarm](https://docs.docker.com/engine/swarm/secrets/). Não usar SET de sessão para tenant: somente contexto local dentro de BEGIN/COMMIT; reset adicional do servidor protege reutilização do pool. pg-boss e migrations recebem URLs diretas separadas.

## Auditoria da entrega

- Quota persistida, Retry-After e vínculo revalidado em duas réplicas testados em Postgres real. Teste adicional provoca troca de workspace entre quota e operação, confirmando recusa sem acessar o tenant diferente.
- PgBouncer real: 24 transações concorrentes alternaram dois tenants no mesmo backend, sem vazamento de tenant/role, inclusive após rollback. Harness próprio remove apenas seu container e diretório verificado em .local. CI também executa esse teste separado.
- API/worker/web/PgBouncer construídos localmente. API e worker executaram sem root com logins restritos, web como nginx; health/readiness e proxy /api responderam 200. docker stack config validado sem deploy.
- Smoke test revelou CREATE de banco necessário no bootstrap interno do pg-boss. Provisionamento agora concede temporariamente, inicializa objetos como broker e revoga em finally. Verificado que API/worker/broker não possuem superuser, BYPASSRLS ou CREATE de banco após bootstrap.
- Backup custom e restore em banco descartável recuperaram 1 workspace, 10 leads e 7 migrations; RLS retornou zero sem contexto e dez leads com contexto correto. Guardrail recusou restore fora de banco terminado em _restore_test. Scripts shell verificados com sh -n.
- tsx promovido de ferramenta dev a runtime para executar os serviços TypeScript no Node 22; dependência já existente, agora presente nas imagens production. Sem outra dependência npm nova.
- Desvio intencional: workflow de release/deploy desabilitado por variáveis até configuração do Mateus. Não houve publicação GHCR, deploy, acesso à VPS/produção ou mensagens reais. Staging e integração com a stack WhatsApp real permanecem em docs/pendencias-mateus.md.
