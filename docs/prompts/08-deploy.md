Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 8: deploy e operação.

Escopo:
1. Dockerfiles de produção (multi-stage) para api, web e worker.
2. Stack do Docker Swarm com Traefik (TLS), rede interna para Postgres, PgBouncer e WhatsApp, segredos via Docker secrets. Sem Redis nem REDIS_URL. pg-boss e sessões usam Postgres; prever PgBouncer e validar compatibilidade com pg-boss e SET LOCAL em transações.
3. GitHub Actions: build, push para GHCR e deploy em staging automático; produção manual com aprovação.
4. Healthcheck do processo e readiness de dependências separados. Logs estruturados com tenant_id/user_id (nulos quando não houver contexto), sem tokens ou segredos, e alerta quando a sessão do WhatsApp cair.
5. Script de backup diário (pg_dump) e documento de restore testado.
6. docs/runbook.md: WhatsApp desconectou, token Google revogado, rollback de deploy.
7. API sem estado com várias réplicas; sessões, deduplicação de webhooks e limites por workspace compartilhados no Postgres. Definir quotas e janela no plano aprovado; responder 429 ao exceder. RLS não pode vazar tenant entre conexões reutilizadas.

Critérios de aceite:
- Deploy em staging a partir de merge na main.
- Restore do backup testado e documentado.
- Nenhuma porta de Postgres, PgBouncer ou WhatsApp exposta publicamente.
- Em staging, validar sessões e bloqueios entre réplicas, limite agregado por workspace, reentrega idempotente de webhook e separação de healthcheck/readiness.
- Vitest cobre RN-18, RN-22 e RN-23 nas condições de múltiplas réplicas e pool, incluindo ausência de vazamento de contexto RLS. Conferir índices compostos por tenant_id nas consultas de workspace.
- Agentes acessam somente dev e staging. Configurar o fluxo manual de produção sem executá-lo nesta sessão.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
