Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md, docs/regras-de-negocio.md, docs/decisoes.md e docs/prototipo.md. Considere D29 a D35 como decisões vigentes.
NÃO escreva código nesta sessão.

Entregue docs/plans/00-plano-mestre.md contendo:
1. Contradições, lacunas e ambiguidades encontradas no RFC e nas regras.
2. Riscos técnicos (Google OAuth e escopos, sync de agenda, WhatsApp, fila, sessões).
3. Validação das sessões 1 a 8 do RFC: ordem, dependências e ajustes propostos.
4. Para cada sessão: módulos afetados, testes previstos e critérios de aceite.
5. Perguntas para o arquiteto.

Cubra pg-boss atrás de JobQueue, sessões e tokens no Postgres, sync apenas OperaON -> Google, workspaces/membros/convites na sessão 2, RLS por transação, Google por pessoa com agenda por vínculo, bloqueios local/global e visibilidade de leads. Planeje índices por tenant, webhooks idempotentes, limites compartilhados, logs com tenant_id/user_id, healthcheck/readiness e PgBouncer na sessão 8.
Inclua testes de negócio com Vitest, isolamento entre workspaces e critérios de aceite para RN-17 a RN-23. RN-14, polling e syncToken são da v2. Redis não integra o MVP.

Pare após entregar o plano e aguarde aprovação.
