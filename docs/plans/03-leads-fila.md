# Sessão 3: leads, interações, fila e funil

Plano autoauditado conforme handoff. Branch criada da dev e dependência explícita da sessão 2 incorporada. PR contra dev; nenhum merge enquanto o CI hospedado e os PRs anteriores não estiverem verdes/integrados.

1. Schemas Zod compartilhados para lead, atualização e interação, com E.164, etapa/motivo e próximo passo obrigatório. CRUD com exclusão lógica e auditoria. Deduplicação por tenant sem expor dados de lead inacessível.
2. Serviço de autorização por visibilidade: proprios restringe MEMBER ao responsável; OWNER/ADMIN e compartilhado permitem leitura/edição local ampla. Só OWNER/ADMIN atribuem lead a outro responsável elegível do workspace. Produtos e responsáveis validados no mesmo tenant.
3. Interação append-only, atualizando último contato, etapa e próximo passo na mesma transação. Falha em qualquer validação desfaz todos os efeitos. Histórico segue a visibilidade do lead.
4. Fila atrasados/hoje/próximos 7 dias com contadores; fronteiras de dia calculadas no fuso IANA do workspace no Postgres, persistindo UTC. Funil com contagem e soma por etapa, mesma autorização.
5. Templates por etapa com variáveis permitidas, gestão local por OWNER/ADMIN e geração de wa.me com URL encoding. Exclusão física de template auditada conforme RN-12.
6. Endpoints sob sessão/vínculo revalidados na transação RLS, logs com tenant_id/user_id. Nenhuma tela final ou integração real nesta sessão.

## Autoauditoria

- Escopo do prompt 03 integralmente coberto. RN-01/02/05/06/12/19/22 previstas nos testes API + banco. Revisão/nutrição/CSV ficam na sessão 4; cancelamento de compromissos ligado a exclusão/perda será integrado na sessão 5 (RN-16), quando houver serviço de agenda.
- Testes: próximo passo ausente, perdido sem motivo, interação atômica, duplicidade por tenant, exclusão/auditoria, referência cruzada, edição/visão em ambos os modos, troca de responsável proibida a MEMBER mesmo em compartilhado e dia local atravessando UTC.
- Decisão provisória: entrada de telefone exige DDI e aceita apenas pontuação de apresentação; não inferir país silenciosamente. Templates administrados por OWNER/ADMIN, consultados pelos membros do workspace. Registrar antes da implementação.
- Índices já cobrem fila por responsável e compartilhada; conferir plano de consultas. Sem dependência nova necessária.
- Resultado: APROVAR implementação. Integração condicionada ao CI, sem pedir aprovação de produto entre etapas.

## Autoauditoria da entrega

- CRUD, histórico transacional, fila por fuso, funil e templates implementados. Schemas Zod strict limitam colunas mutáveis; listas usam Drizzle e operações transacionais usam parâmetros SQL.
- Sete testes novos cobrem RN-01/02/05/06/12/19/22, inclusive duplicidade sem vazamento, template com encoding, auditoria e leitura/escrita em proprios/compartilhado. Total: 24 testes reais/simulados de integrações passaram.
- Lint, typecheck e build passaram. Nenhuma dependência ou migration nova, nenhuma tela final incluída.
- RN-16 continua planejada para integração do serviço de agenda na sessão 5. Esta entrega não cria compromissos nem envia mensagens reais.
- Resultado: APROVAR. PR depende dos anteriores e permanece sem merge enquanto CI hospedado não executar com sucesso.
