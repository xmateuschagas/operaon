megaplan

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 8: deploy e operação.

Escopo:
1. Dockerfiles de produção (multi-stage) para api, web e worker.
2. Stack do Docker Swarm com Traefik (TLS), rede interna para Postgres, Redis e WhatsApp, segredos via Docker secrets.
3. GitHub Actions: build, push para GHCR e deploy em staging automático; produção manual com aprovação.
4. Healthchecks, logs estruturados e alerta quando a sessão do WhatsApp cair.
5. Script de backup diário (pg_dump) e documento de restore testado.
6. docs/runbook.md: WhatsApp desconectou, token Google revogado, rollback de deploy.

Critérios de aceite:
- Deploy em staging a partir de merge na main.
- Restore do backup testado e documentado.
- Nenhuma porta de banco, Redis ou WhatsApp exposta.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
