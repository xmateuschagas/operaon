# Sessão 5: agenda e Google de saída

Plano autoauditado do handoff. Branch criada da dev com dependência local da sessão 4. PR contra dev, integração só após anteriores e CI verde.

1. CRUD de compromissos com lead obrigatório, início anterior ao fim e autorização seguindo visibilidade do lead. Responsável do compromisso é a pessoa que o criou, com agenda do vínculo correspondente. Não permitir agenda principal nem referência entre tenants.
2. Outbox transacional para salvar compromisso PENDING e pedido de sincronização juntos. Worker entrega via JobQueue/pg-boss, com retry/backoff. Handler lê estado local atual sob lock, evitando que job antigo restaure estado anterior. Nenhuma polling de mudanças Google, syncToken ou RN-14 no MVP.
3. Criação/reuso da agenda dedicada no primeiro acesso autorizado ao vínculo. Refresh token permanece criptografado em users; calendar_id em tenant_members. Lock do vínculo e marcador estável na descrição recuperam criação de agenda após resposta incerta. Eventos têm id determinístico por compromisso e upsert tolerante a 404/409.
4. Adaptador Google real com fetch/timeouts, refresh de access token e marca global de reautorização após invalid_grant. Simulador injetado nos testes. Erros externos mantêm dados locais PENDING e não registram payloads ou tokens nos logs.
5. RN-16 integrada aos três caminhos: excluir lead, marcar PERDIDO e interação que encerra como PERDIDO. Cancelar compromissos futuros, lembretes e gerar jobs de remoção Google na mesma transação. GANHO preserva compromissos.
6. Worker com descoberta restrita de tenants que têm outbox pendente, role própria sem bypass e contexto RLS por processamento. API não recebe SELECT global do outbox. Configuração externa/staging permanece pendência do Mateus.

## Autoauditoria

- Cobertura de RN-11/13/16/20/22 com Google simulado: salvar apesar da falha, retry sem duplicar, dois vínculos/uma conexão, criar/editar/cancelar, recusar lead alheio e impedir uso da agenda principal.
- Decisão provisória: envio assíncrono imediato por outbox, sem depender da disponibilidade do Google na transação HTTP. API retorna PENDING até o worker concluir.
- Idempotência de criação de agenda exige ler metadados de calendarList para recuperar marcador após timeout/crash. Solicitar calendar.app.created e calendar.calendarlist.readonly somente no consentimento incremental. Não ler/importar eventos ou guardar syncToken. Documentar escopo adicional para revisão do Mateus.
- Referências oficiais: https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list e https://developers.google.com/workspace/calendar/api/v3/reference/events/insert.
- Migrations reversíveis novas para outbox, papel worker e flag de reautorização, sem editar migrations existentes. Não há dependência nova obrigatória.
- Resultado: APROVAR implementação.

## Auditoria da entrega

- Oito testes novos, 37 acumulados, todos aprovados contra Postgres 16 real. Lint e typecheck aprovados. Casos incluem falha/retry, duas agendas para uma pessoa, recusa entre tenants, cancelamento RN-16, refresh revogado e privilégio restrito do worker.
- Nenhuma dependência nova. Migration 004 adicionada com down; migrations 001 a 003 preservadas.
- Desvio: validação real em staging depende de credenciais Google e autorização do Mateus; adaptador real implementado e API simulada nos testes. Configuração registrada em docs/pendencias-mateus.md.
- CI das sessões anteriores desbloqueado e integrado em ordem, sem usar a exceção por cobrança. Resultado: APROVAR PR contra dev; aguardar o CI deste PR antes de integrar.
