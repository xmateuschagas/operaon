Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 4: revisão semanal, nutrição e captura de leads.

Escopo:
1. Endpoint de inativos conforme RN-03 (inclui leads nunca contatados).
2. Ações da revisão: reativar (novo próximo passo), nutrir 15/30 dias (RN-04), encerrar como PERDIDO com motivo.
3. Webhook de formulário do site protegido por LEAD_FORM_TOKEN, com UTM e RN-07 e RN-15 (responsável padrão e fallback).
4. Importação de CSV com pré-visualização, relatório de duplicados e erros por linha.
5. Captura resolve workspace pela integração autorizada, nunca por tenant_id livre. RLS por transação, índices compostos por tenant_id, logs com tenant_id/user_id e webhook idempotente com deduplicação persistida por workspace (RN-22 e RN-23).
6. RN-15 considera vínculo ACTIVE e platform_status ACTIVE: fallback para OWNER/ADMIN elegível mais antigo pelo created_at do vínculo. CSV com responsavel_email exige membro elegível do mesmo workspace. Troca de responsável restrita a OWNER/ADMIN (RN-19).

Critérios de aceite:
- Testes com datas fixas para RN-03 e RN-04.
- Webhook recusa token inválido e aplica RN-06 e RN-07.
- Import de CSV não cria duplicados e informa o que foi ignorado.
- Vitest cobre RN-15, RN-19, RN-22 e RN-23: fallback, ausência de responsável elegível, usuário bloqueado, responsável de outro workspace, reentrega concorrente do webhook e isolamento.
- Revisão e pré-visualização respeitam visibilidade e timezone do workspace; datas no banco em UTC.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
