# Plano mestre do OperaON (Sessão 0)

Documento de planejamento. Nenhum código de aplicação é escrito nesta sessão.

Fontes lidas: `AGENTS.md`, `docs/rfc-002.md` (citado como "RFC"), `docs/regras-de-negocio.md` (citado como "RN"), `docs/prototipo.md`, `docs/decisoes.md` e `docs/prompts/01` a `08`.

Convenção de citação: "RFC L74" significa linha 74 de `docs/rfc-002.md` e "RN L11" significa linha 11 de `docs/regras-de-negocio.md`, sempre na versão anterior a este plano (commit `b9e5f06` da `main`). As atualizações do RFC e das regras feitas junto com este plano deslocam algumas linhas.

As decisões do arquiteto (D1 a D16) estão na seção final. Cada item abaixo indica a decisão que o resolve.

## 1. Contradições, lacunas e ambiguidades

### 1.1 RN-07 vs RN-15: responsável padrão e fallback (resolvido por D1)

- **Onde:** RFC L74 (comentário de `default_owner_user_id`: "o seed sempre preenche com o admin"); RN-07 (RN L11); RN-15 (RN L19); `docs/decisoes.md` ("Fallback do responsável padrão (RN-15); seed preenche default_owner_user_id").
- **Problema:** se o seed sempre preenche o campo, parece que o fallback e o 503 da RN-15 nunca acontecem. Não é verdade: a coluna aceita NULL e o usuário apontado pode ser bloqueado depois (usuário nunca é excluído, só vira `BLOCKED`, RFC L229). Também não estava definido como o primeiro admin nasce fora do seed nem quem recebe o aviso de novo cadastro quando não há admin `ACTIVE`.
- **Resolução (D1):** o admin inicial vem de `ADMIN_EMAIL`. O seed cria tenant, admin e preenche `default_owner_user_id`. O primeiro login com e-mail igual a `ADMIN_EMAIL` vira `ADMIN` e `ACTIVE`. O aviso de novo cadastro vai sempre para `ADMIN_WHATSAPP`. A RN-15 fica como proteção em tempo de execução (responsável padrão vazio ou não `ACTIVE`).

### 1.2 CHECK `rn01_proximo_passo` exige próximo passo já no INSERT do webhook (resolvido por D2)

- **Onde:** CHECK `rn01_proximo_passo` (RFC L128 a L132); colunas `data_proximo_passo` e `descricao_proximo_passo` sem default (RFC L119 e L120); RN-07 (RN L11); `necessidade_resumo TEXT NOT NULL` (RFC L115).
- **Problema:** um lead NOVO sem próximo passo viola o CHECK. O webhook tem de gravar os dois campos no próprio INSERT, e não em um UPDATE posterior. Também não estava definido se o formulário aceita necessidade vazia.
- **Resolução (D2):** o INSERT do webhook grava `etapa = 'NOVO'`, `data_proximo_passo = agora + 1h` e `descricao_proximo_passo = 'Primeiro contato'` na mesma instrução. Necessidade vazia vira "Não informada" também no formulário.

### 1.3 RN-16 sem mapeamento explícito no RFC (ajuste: RN-16 na sessão 5)

- **Onde:** RN-16 (RN L20); tabela de sessões (RFC L284 a L294) não cita RN-16; o fluxo de compromisso (RFC L247 a L251) também não. Só `docs/prompts/05-agenda-google.md` (item 2) menciona "RN-16 ao excluir ou perder o lead".
- **Resolução:** RN-16 fica explicitamente na sessão 5 (cancelar compromissos futuros, lembretes `CANCELLED`, evento removido do Google, com `sync_status = PENDING` se o Google falhar). Na sessão 6 a mesma rotina passa a remover os jobs do BullMQ pelo `job_id`. A linha da sessão 5 na seção 9 do RFC passa a citar RN-16.

### 1.4 Dupla fonte do próximo passo (resolvido por D3)

- **Onde:** `lead_interactions.proximo_passo_definido` e `data_agendada_passo` (RFC L152 e L153); `leads.data_proximo_passo` e `descricao_proximo_passo` (RFC L119 e L120); imutabilidade de `lead_interactions` (RFC L231); RN-02 (RN L6).
- **Problema:** o próximo passo existe em dois lugares. Ações que mudam o próximo passo sem interação (reativar na revisão, RN-10 "Remarcar: ...", edição manual) deixam a última interação desatualizada, e ela não pode ser editada.
- **Resolução (D3):** a fonte da verdade é `leads.data_proximo_passo` e `leads.descricao_proximo_passo`. Os campos de `lead_interactions` são registro histórico da promessa feita naquela conversa e nunca alimentam a fila.

### 1.5 RN-10 sem cobertura para lead PERDIDO ou excluído (resolvido por D4)

- **Onde:** RN-10 (RN L14) trata lead em aberto e lead GANHO; RN-16 (RN L20) cancela compromissos futuros quando o lead vira PERDIDO ou é excluído.
- **Problema:** um lembrete enviado antes da perda ou da exclusão pode receber "1" ou "2" depois. RN-10 não diz o que fazer.
- **Resolução (D4):** resposta de lead PERDIDO ou excluído é ignorada e registrada em log. Lead e compromisso não mudam.

### 1.6 `whatsapp_opt_in` default FALSE sem fluxo de captura (resolvido por D5)

- **Onde:** `whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE` (RFC L124); RN-09 (RN L13); RN-07 (RN L11) e o fluxo de CSV não citam opt-in.
- **Problema:** nenhum fluxo define quando o opt-in vira `true`. Sem isso nenhum lembrete sai e a sessão 6 não é testável com dados reais.
- **Resolução (D5):** opt-in explícito em três pontos: checkbox "Cliente autorizou mensagens no WhatsApp" no cadastro manual; campo booleano `whatsapp_opt_in` no formulário do site (ausente = false); coluna opcional `opt_in` no CSV (sim/não; vazia = não). Ao criar compromisso para lead sem opt-in, a tela mostra um aviso.

### 1.7 Dedupe de CSV sem comportamento definido (resolvido por D6)

- **Onde:** RN-06 (RN L10: "duplicado bloqueia a criação e sugere o lead existente"); RFC L12 ("importação de CSV com deduplicação por telefone"); `docs/prompts/04-revisao-captura.md` ("não cria duplicados e informa o que foi ignorado").
- **Problema:** não estava definido se a linha duplicada é rejeitada (e o arquivo inteiro falha), pulada ou usada para atualizar o lead existente.
- **Resolução (D6):** telefone duplicado faz a linha ser pulada, nunca atualiza o lead existente e aparece no relatório de importação.

### 1.8 Associação da resposta "1"/"2" ao compromisso não especificada (resolvido por D7)

- **Onde:** RN-10 (RN L14); fluxo "WhatsApp recebido" (RFC L256 e L257).
- **Problema:** a mensagem recebida traz só o telefone. O lead pode ter vários compromissos futuros, e o número é central (ADR-3, RFC L27).
- **Resolução (D7):** telefone leva ao lead único do tenant (RN-06), que leva ao compromisso futuro não cancelado com o lembrete `SENT` mais recente. Sem correspondência, a mensagem é ignorada e registrada em log.

### 1.9 "Fila de hoje" e o laranja de atraso não formalizados (resolvido por D8)

- **Onde:** RN-10 (RN L14, "aparece na fila de hoje"); RFC L257; `docs/prompts/03-leads-fila.md` (atrasados, hoje, próximos 7 dias); `docs/prototipo.md` L10 (laranja só para atraso).
- **Problema:** não havia definição exata dos intervalos nem do critério de atraso.
- **Resolução (D8):** em America/Sao_Paulo: Atrasado = `data_proximo_passo < agora`; Hoje = de agora até 23:59:59; Próximos 7 dias = amanhã 00:00 até +7 dias; "fila de hoje" = Atrasados + Hoje; o laranja do protótipo é Atrasado. Consequência aceita: o lead que a RN-10 coloca com `data_proximo_passo = agora` aparece como Atrasado (laranja) já no minuto seguinte, dentro da fila de hoje.

### 1.10 Protótipo só como link externo (resolvido por D9)

- **Onde:** `docs/prototipo.md` L3 (link `claude.ai/artifact/...`).
- **Risco:** o link pode sair do ar, mudar ou exigir login; a sessão 7 e a auditoria do Cowork ficariam sem referência.
- **Resolução (D9):** capturas do protótipo ficam em `docs/prototipo/` como referência visual (já existem: Login, Cadastro recebido, Fila, Funil de vendas, Revisão semanal, Agenda, Controle de acessos).

### 1.11 Retry de sync PENDING sem política (resolvido por D11)

- **Onde:** RN-11 (RN L15: "reprocessa"); ADR-10 (RFC L34); fluxo "Compromisso" passo 2 (RFC L249); enum `sync_status` com `ERROR` (RFC L63) sem uso definido.
- **Resolução (D11):** backoff de 1 min, 5 min, 15 min, 1 h e depois a cada 6 h. Após 24 h, `sync_status = ERROR` e aviso na agenda.

### 1.12 Refresh token revogado sem política (resolvido por D12)

- **Onde:** `docs/prompts/05-agenda-google.md` item 5 ("marca o usuário para reautorizar"); tabela `users` (RFC L79 a L92) sem coluna para isso.
- **Resolução (D12):** nova coluna `users.google_reauth_required BOOLEAN NOT NULL DEFAULT FALSE`. `invalid_grant` marca `true`, a interface pede nova autorização e sync e criação no Google ficam `PENDING` até a reautorização.

### 1.13 Invalidação de sessões ao bloquear sem estrutura definida (resolvido por D13)

- **Onde:** RFC L245 ("Bloquear usuário apaga as sessões dele na hora"); ADR-7 (RFC L31); `docs/prompts/02-autenticacao.md` item 5.
- **Problema:** com sessões opacas no Redis, apagar "as sessões do usuário" exige saber quais são; sem índice seria preciso varrer todas as chaves.
- **Resolução (D13):** set Redis `user_sessions:<user_id>` com os ids de sessão do usuário; bloquear apaga todas as sessões do set.

### 1.14 Recuperação de jobs BullMQ após restart (resolvido por D14)

- **Onde:** fluxo "Compromisso" passos 3 e 4 (RFC L250 e L251); critério "Reiniciar o worker não duplica envios" (`docs/prompts/06-whatsapp.md`).
- **Problema:** o RFC não diz como o worker se recupera se o Redis perder jobs ou o worker ficar parado.
- **Resolução (D14):** após restart, o worker recria jobs a partir de `appointment_reminders` com `status = PENDING` e `scheduled_for` futuro. O `jobId` determinístico impede duplicata.

### 1.15 Stack do WhatsApp e normalização de respostas (resolvido por D10)

- **Onde:** ADR-3 (RFC L27: "reutilizar a stack existente"); fluxo "WhatsApp recebido" (RFC L256 e L257); variáveis `WHATSAPP_*` (RFC L271).
- **Problema:** formato de envio e do webhook desconhecido; respostas como " Sair", "SAÍR" ou "1 " sem regra de normalização.
- **Resolução (D10):** adaptador `WhatsAppProvider` com `send(telefone, texto)` e webhook normalizado `{from, text, timestamp}`; respostas normalizadas (trim, minúsculas, sem acento) aceitando "1", "2" e "sair"; stack concreta confirmada antes da sessão 6.

### 1.16 Sessão 7 monolítica e testes das sessões 3 a 6 sem interface (resolvido por D15)

- **Onde:** RFC L293 (sessão 7: "Front completo seguindo o protótipo"); `docs/prompts/07-frontend.md`; sessões 3 a 6 entregam só API.
- **Problema:** a sessão 7 cobre sete telas com quatro estados cada, grande demais para um PR revisável. As sessões 3 a 6 não têm tela para o revisor testar.
- **Resolução (D15):** sessão 7 dividida em 7a (base visual, login e aguardando liberação, fila do dia desktop e celular, modal de registrar contato, cadastro e importação de leads) e 7b (funil, revisão semanal, agenda, acessos). Testes das sessões 3 a 6 via API, com coleção `.http` em `docs/api/`.

### 1.17 Backup da sessão 8 sem especificação (resolvido por D16)

- **Onde:** ADR-2 (RFC L26: servidor doméstico só para backup); RFC L294; `docs/prompts/08-deploy.md` item 5.
- **Resolução (D16):** `pg_dump` diário às 03:00, retenção de 7 diários e 4 semanais, envio via SSH ao servidor doméstico, restore testado e documentado.

### 1.18 Achados adicionais (fora do escopo das decisões)

- **README desatualizado:** `README.md` diz "RN-01 a RN-12", mas existem RN-01 a RN-16. Fora de `docs/`, não alterado neste PR.
- **Exclusão feita no Google:** RFC L254 diz que o sync aplica "exclusão", mas não diz se vira `status = CANCELLED` ou `deleted_at`. Proposta: `status = CANCELLED` com lembretes `CANCELLED`, mantendo `deleted_at` para exclusão feita no OperaON. Ver pergunta 12.
- **Próximo passo de leads do CSV:** o CHECK da RN-01 também vale para linhas do CSV em etapa aberta. D2 cobre o webhook; para o CSV a proposta é aplicar o mesmo padrão ("Primeiro contato" em +1h, etapa NOVO). Ver pergunta 11.
- **Lembrete com opt-in desligado no envio:** RFC L248 confere o opt-in no envio. Proposta: lembrete fica `CANCELLED` com `error_log = 'sem opt-in'`.

## 2. Riscos técnicos

### 2.1 Google OAuth e escopos

| Risco | Mitigação |
|---|---|
| Consentimento incremental (ADR-8, RFC L32 e L244): escopo de agenda só depois da aprovação; usuário pode recusar ou aprovar parcialmente | Conferir os escopos concedidos no retorno; sem escopo de agenda, o usuário entra, mas a agenda fica desabilitada com aviso e botão para autorizar |
| Google não devolve refresh token no segundo consentimento | Pedir `access_type=offline`, `prompt=consent` e `include_granted_scopes=true` na etapa de agenda |
| Refresh token revogado ou expirado (`invalid_grant`) | D12: `google_reauth_required = true`, sync e criação ficam `PENDING`, interface pede nova autorização; runbook na sessão 8 |
| Vazamento de token | AES-256-GCM com `TOKEN_ENC_KEY` (32 bytes base64, RFC L269); IV aleatório de 12 bytes por cifragem; formato versionado `v1:iv:tag:cifra` para permitir rotação; validar a chave no boot; redação de tokens nos logs |
| App em modo de teste do Google limita usuários e expira refresh token em 7 dias | Confirmar status de publicação e verificação do app no Google Cloud antes do staging |

### 2.2 Sync de agenda

| Risco | Mitigação |
|---|---|
| `syncToken` inválido (HTTP 410) | Descartar `google_sync_token`, fazer sync completo da agenda "OperaON" e guardar o novo token |
| Eventos com `status = cancelled` no incremental | Tratar como cancelamento apenas se `google_event_id` for conhecido |
| Evento criado direto no Google (RN-14) | Ignorar e registrar em log; nunca criar compromisso sem lead (RN-13) |
| Janela de polling de 5 min (ADR-5) | Aceito no MVP; job repetível por usuário com `jobId` fixo; distribuir horários para respeitar cota |
| Race entre edição local e edição no Google | Comparar `updated` do evento com `appointments.updated_at`; alteração local com `sync_status = PENDING` tem prioridade até ser enviada; registrar conflito em log |
| Eco do próprio app | Ignorar quando os campos já são iguais aos locais |
| Mudança de horário vinda do Google | Reprogramar lembretes pela mesma rotina de remarcação (RN-08) |
| Google fora do ar por muito tempo | D11: backoff 1 min, 5 min, 15 min, 1 h, depois a cada 6 h; após 24 h `ERROR` e aviso na agenda |
| Cota e rate limit da Calendar API | Backoff em 403/429; limite de concorrência no worker |

### 2.3 WhatsApp

| Risco | Mitigação |
|---|---|
| Stack não especificada (ADR-3, RFC L27) | D10: adaptador `WhatsAppProvider` (`send(telefone, texto)`) e webhook normalizado `{from, text, timestamp}`; testes com implementação falsa; stack concreta confirmada antes da sessão 6 |
| Normalização das respostas | D10: trim, minúsculas, sem acento; aceitar "1", "2" e "sair"; qualquer outro texto é ignorado e registrado |
| Associação errada da resposta | D7: telefone, lead único do tenant, compromisso futuro não cancelado com lembrete `SENT` mais recente; sem correspondência, log |
| Opt-in desligado entre o agendamento e o envio | Conferir `whatsapp_opt_in` do lead dentro do job, no momento do envio (RFC L248, RN-09) |
| Sessão do WhatsApp cair | Alerta (sessão 8); lembrete fica `FAILED` com `error_log` e retry com backoff |
| Webhook interno sem autenticação | Token compartilhado e rede interna; nunca exposto publicamente (AGENTS.md) |

### 2.4 Fila BullMQ

| Risco | Mitigação |
|---|---|
| Envio duplicado | `jobId` determinístico `rem:<appointment_id>:<tipo>:<epoch>` (RFC L251); antes de enviar, reler a linha e só enviar se `status = PENDING` e o `job_id` bater; marcar `SENT` em transação |
| Job antigo sobrevivendo à remarcação | Remover o job antigo pelo `job_id` gravado antes de gravar o novo; se a remoção falhar (job em execução), o job antigo aborta porque o `job_id` da linha já mudou |
| Perda de jobs após restart ou falha do Redis | Redis com AOF (RFC L39); D14: no boot, recriar jobs a partir de `appointment_reminders` PENDING com `scheduled_for` futuro; o `jobId` fixo impede duplicata |
| Fuso e horário de verão | Tudo em UTC no banco e no `delay` do BullMQ (AGENTS.md) |

### 2.5 Sessões

| Risco | Mitigação |
|---|---|
| Bloqueio precisa derrubar sessões na hora (RFC L245) | D13: set `user_sessions:<user_id>` com os ids de sessão; ao bloquear, apagar todas as chaves do set em uma operação atômica (MULTI ou script Lua) |
| Set desatualizado com sessões expiradas | TTL no set renovado junto com a sessão; limpeza de ids órfãos ao ler |
| Cookie | Opaco, HttpOnly, Secure, SameSite=Lax, assinado com `SESSION_SECRET`; rotação do id de sessão no login |
| Mudança de papel ou status sem novo login | Reler status e papel do usuário a cada requisição (ou cache curto invalidado ao alterar) |

## 3. Validação das sessões 1 a 8

A ordem e as dependências do RFC (L284 a L294) são coerentes: fundação, autenticação, domínio de leads, captura, agenda, lembretes, interface e deploy. Ajustes decididos:

1. **Notifier na sessão 2:** a interface `Notifier` e a implementação `LogNotifier` existem já na sessão 2, porque o aviso de novo cadastro (RFC L242) acontece antes da sessão 6 (RFC L259 e L260). A sessão 6 só adiciona `WhatsAppNotifier` e troca a configuração.
2. **Seed da sessão 1:** cria o tenant, o admin `ACTIVE` com `role = ADMIN` e e-mail `ADMIN_EMAIL`, e preenche `tenants.default_owner_user_id` com esse admin (D1). Como há FK circular (RFC L221), o seed cria o tenant, depois o admin, e por fim atualiza o tenant, tudo em uma transação.
3. **RN-16 na sessão 5:** cancelamento de compromissos, lembretes e evento Google; remoção dos jobs entra na sessão 6.
4. **Sessão 7 dividida em 7a e 7b (D15):** mantém "uma sessão = um PR" por subsessão.
5. **Coleção `.http` em `docs/api/` (D15):** cada sessão de 3 a 6 entrega a coleção das rotas que criou, para o revisor testar sem interface.
6. **Backup especificado (D16):** entra na sessão 8.
7. **Worker começa na sessão 5:** o sync por polling e o reprocessamento de PENDING já são jobs BullMQ. `apps/worker` nasce na sessão 1 (esqueleto), recebe os jobs de sync na sessão 5 e os de lembrete na sessão 6.
8. **Mapeamento de RNs por sessão:** S1 (RN-01, 05, 06 no banco), S2 (RN-12 no bloqueio), S3 (RN-01, 02, 05, 06, 12), S4 (RN-03, 04, 06, 07, 15), S5 (RN-11, 13, 14, 16), S6 (RN-08, 09, 10), S7a e S7b (RN-01 e 05 na tela).

## 4. Por sessão: módulos afetados, testes previstos e critérios de aceite

Base: tabela da seção 9 do RFC e prompts `docs/prompts/01` a `08`. Todos os testes em Vitest; testes de API com Supertest contra Postgres e Redis do Compose de dev (ou containers de teste). Datas controladas com relógio falso. Módulos possíveis: `apps/api`, `apps/web`, `apps/worker`, `packages/shared`, migrations e `docs/api/`.

### Sessão 1: fundação

- **Módulos:** raiz (`pnpm-workspace.yaml`, `tsconfig` base strict, lint), `apps/api` (Fastify com rota de saúde, Drizzle, seed), migrations (schema completo da seção 5 do RFC, incluindo `users.google_reauth_required`), `apps/web` ("hello"), `apps/worker` (esqueleto BullMQ), `packages/shared` (esqueleto de schemas Zod), `docker-compose.dev.yml`, `.github/workflows/ci.yml`, `.env.example` (com `ADMIN_EMAIL`).
- **Testes:**
  - RN-01 (CHECK): INSERT de lead NOVO sem `data_proximo_passo` ou sem `descricao_proximo_passo` falha; GANHO e PERDIDO sem próximo passo passam.
  - RN-05 (CHECK): PERDIDO sem `motivo_perda` falha; com motivo passa.
  - RN-06 (índice único parcial): mesmo `(tenant_id, telefone_e164)` falha; após `deleted_at` no primeiro, o segundo passa; mesmo telefone em outro tenant passa.
  - Trigger de `updated_at` atualiza a coluna em UPDATE.
  - Migrations: up, down, up sem erro.
  - Seed: tenant com `default_owner_user_id` = admin `ACTIVE` e `ADMIN` com e-mail `ADMIN_EMAIL`; lead nunca contatado criado há mais de 7 dias existe.
- **Critérios de aceite:** `docker compose up` e `pnpm dev` sobem api, web e worker sem erro; `pnpm db:migrate` e `pnpm db:rollback` funcionam; testes de RN-01, RN-05 e RN-06 no banco verdes; `.env.example` com todas as variáveis da seção 7 do RFC, sem valores reais; CI (lint, typecheck, testes) verde.

### Sessão 2: autenticação, aprovação, sessões, acessos

- **Módulos:** `apps/api` (rotas OAuth, sessão Redis com set `user_sessions:<user_id>`, middleware de autenticação e papel, módulo de acessos, `audit_log`, cripto AES-256-GCM, `Notifier` e `LogNotifier`), `packages/shared` (schemas das rotas e tipo `Notifier`).
- **Testes:**
  - E-mail novo cria usuário `PENDING` e chama `LogNotifier` com link de aprovação para `ADMIN_WHATSAPP` (D1).
  - Primeiro login com e-mail igual a `ADMIN_EMAIL` vira `ADMIN` e `ACTIVE` (D1).
  - `PENDING` recebe 403 `USER_PENDING_APPROVAL`; `BLOCKED` recebe 403 `ACCESS_REVOKED`; nenhum dos dois ganha cookie.
  - Token de aprovação: chave `approval:<sha256>` no Redis, TTL de 24h, segundo uso falha (GETDEL), expirado falha.
  - Bloquear usuário apaga todas as sessões do set `user_sessions:<user_id>` (requisição seguinte com o cookie antigo recebe 401) e grava no `audit_log` (D13, RN-12).
  - Cripto: cifrar e decifrar retorna o original; cifra adulterada falha na verificação da tag; banco nunca guarda o token puro; logs não contêm token.
  - `ACTIVE` sem refresh token ou com `google_reauth_required = true` é levado ao consentimento do escopo de agenda (D12).
  - Cookie com HttpOnly, Secure e SameSite=Lax; logout apaga a sessão e a remove do set.
  - Usuário `USER` recebe 403 nas rotas de acessos.
- **Critérios de aceite:** os três testes do prompt 02 verdes; token nunca aparece em texto puro no banco nem nos logs; link de aprovação expira e não pode ser reutilizado; aviso ao admin passa pela interface `Notifier`.

### Sessão 3: leads, interações, fila, funil, templates

- **Módulos:** `apps/api` (leads, interações, fila, funil, templates), `packages/shared` (schemas de lead, interação, telefone E.164), migration nova só se necessária, `docs/api/` (coleção `.http` da sessão).
- **Testes:**
  - RN-01 na API: criar ou atualizar lead aberto sem próximo passo retorna 422.
  - RN-02: registrar interação atualiza `data_ultimo_contato`, etapa e próximo passo do lead e grava a interação como histórico (D3); falha no meio da transação não deixa nada gravado.
  - RN-05: mover para PERDIDO sem motivo retorna 422; com motivo e detalhe grava.
  - RN-06: variações de telefone viram o mesmo E.164; duplicado retorna 409 com o id do lead existente.
  - RN-12: excluir lead preenche `deleted_at`, some das listagens e grava no `audit_log`; `lead_interactions` não tem rota de edição nem de exclusão.
  - Cadastro manual aceita `whatsapp_opt_in` (D5).
  - Escopo: usuário comum não vê nem altera lead de outro (404); admin vê todos (ADR-4).
  - Fila (D8): datas fixas perto da meia-noite de São Paulo; Atrasado = `data_proximo_passo < agora`; Hoje = de agora até 23:59:59; Próximos 7 dias = amanhã 00:00 até +7 dias; contadores corretos; fila lê só de `leads` (D3).
  - Funil: quantidade e soma de `valor_estimado` por etapa, ignorando excluídos.
  - Templates: substituição de `{nome}`, `{empresa}`, `{necessidade}` e link `wa.me` com texto codificado.
- **Critérios de aceite:** sessão 3 cobre RN-01, RN-02, RN-05, RN-06 e RN-12 com testes verdes; isolamento por usuário comprovado; "hoje" calculado em America/Sao_Paulo conforme D8; coleção `.http` em `docs/api/` cobre as rotas novas.

### Sessão 4: revisão semanal, nutrição, formulário, CSV

- **Módulos:** `apps/api` (revisão, nutrição, webhook do formulário, importação CSV com pré-visualização, serviço de captura com RN-15), `packages/shared` (schemas do webhook e da linha do CSV), `docs/api/`.
- **Testes:**
  - RN-03 com datas fixas: 7 dias exatos não é inativo, 7 dias e 1 minuto é; lead nunca contatado conta pela criação; GANHO, PERDIDO e excluído ficam fora; `nutricao_ate` futuro exclui, vencido inclui.
  - RN-04: nutrir 15 ou 30 dias grava `nutricao_ate` correto; outros valores retornam 422.
  - Reativar exige novo próximo passo (RN-01); encerrar como PERDIDO exige motivo (RN-05).
  - Webhook: token inválido ou ausente retorna 401; lead criado no INSERT com etapa NOVO, origem "Formulário do site", UTM, `data_proximo_passo = agora + 1h`, descrição "Primeiro contato" (D2); necessidade vazia vira "Não informada" (D2); `whatsapp_opt_in` ausente = false (D5); duplicado não cria lead (RN-06).
  - RN-15: responsável padrão `ACTIVE` recebe o lead; vazio ou não `ACTIVE` leva ao admin `ACTIVE` mais antigo; sem admin `ACTIVE`, webhook responde 503 e CSV é recusado.
  - CSV: pré-visualização não grava nada; defaults de RN-07; coluna `opt_in` (sim/não; vazia = não) (D5); telefone duplicado pula a linha, não atualiza o lead e consta no relatório (D6); erros por linha não impedem as linhas válidas.
- **Critérios de aceite:** testes de RN-03 e RN-04 com relógio falso verdes; webhook recusa token inválido e aplica RN-06, RN-07 e RN-15; import não cria duplicados e informa o que foi ignorado; coleção `.http` em `docs/api/`.

### Sessão 5: agenda e sync Google

- **Módulos:** `apps/api` (cliente Google Calendar, criação da agenda "OperaON", CRUD de compromissos, cancelamento por RN-16, aviso de lead sem opt-in na resposta), `apps/worker` (sync a cada 5 min por usuário, reprocessamento de PENDING com backoff D11), `packages/shared` (schemas de compromisso), `docs/api/`.
- **Testes (Google mockado):**
  - Criar agenda "OperaON" na primeira autorização e guardar `google_calendar_id`; nenhuma chamada usa `calendarId = 'primary'`.
  - RN-11: Google OK grava `SYNCED` e `google_event_id`; falha grava `PENDING`; reprocessamento segue 1 min, 5 min, 15 min, 1 h e depois a cada 6 h; após 24 h vira `ERROR` (D11).
  - RN-13: compromisso sem lead, com lead excluído ou com telefone fora de E.164 retorna 422; início depois do fim retorna 422.
  - RN-14: evento criado direto no Google é ignorado e logado; alteração de horário conhecida é aplicada; evento `cancelled` conhecido vira `CANCELLED`; resposta 410 dispara sync completo.
  - RN-16: excluir ou marcar PERDIDO cancela compromissos futuros, marca lembretes `CANCELLED` e remove o evento do Google; lead GANHO mantém; compromissos passados não mudam.
  - `invalid_grant` marca `google_reauth_required = true` e deixa sync e criação em `PENDING` (D12).
  - Compromisso para lead sem opt-in é criado e a resposta sinaliza o aviso (D5).
- **Critérios de aceite:** sessão 5 cobre RN-11, RN-13, RN-14 e RN-16 com Google mockado; alteração feita no Google aparece no OperaON em até 5 min (verificação em staging); nenhum evento na agenda principal; coleção `.http` em `docs/api/`.

### Sessão 6: worker, WhatsApp, confirmação e opt-out

- **Módulos:** `apps/worker` (jobs de lembrete, rate limit, retry, recriação de jobs no boot D14), `apps/api` (webhook interno de mensagens, `WhatsAppProvider`, `WhatsAppNotifier`, remarcação e cancelamento com troca de jobs), `packages/shared` (tipos do adaptador e do webhook normalizado), `docs/api/`.
- **Testes:**
  - RN-08: criação não gera lembrete com horário já passado; `job_id` = `rem:<appointment_id>:<tipo>:<epoch>`; remarcar atualiza a mesma linha, remove o job antigo e cria o novo; linha cujo novo horário já passou vira `CANCELLED`; cancelar remove jobs e marca `CANCELLED`.
  - Reinício do worker (D14): recria jobs de `appointment_reminders` PENDING com `scheduled_for` futuro sem duplicar jobs nem envios; lembrete `SENT` não é reenviado.
  - RN-09: lead sem opt-in no momento do envio não recebe mensagem; "sair" normalizado (D10) desliga o opt-in.
  - RN-10: "1" grava `CONFIRMADO` e `status = CONFIRMED`; "2" com lead em aberto grava `REMARCAR`, `data_proximo_passo = agora` e descrição "Remarcar: <título>"; "2" com lead GANHO não altera o lead, chama o Notifier e destaca o compromisso; resposta de lead PERDIDO ou excluído é ignorada e logada (D4).
  - Associação (D7): telefone, lead único do tenant, compromisso futuro não cancelado com lembrete `SENT` mais recente; sem correspondência, log.
  - Normalização (D10): " 1 ", "SAIR", "Saír" são reconhecidos; outros textos ignorados.
  - Retry com backoff grava `error_log` e termina em `FAILED`; rate limit respeitado.
  - Configuração troca `LogNotifier` por `WhatsAppNotifier` sem mudar os chamadores.
- **Critérios de aceite:** sessão 6 cobre RN-08, RN-09 e RN-10; reiniciar o worker não duplica envios; nenhuma mensagem sai para lead sem opt-in; stack concreta do WhatsApp confirmada antes do início (D10); coleção `.http` em `docs/api/`.

### Sessão 7a: base visual, login, fila e captura

- **Módulos:** `apps/web` (tema Tailwind com cores e fontes de `docs/prototipo.md`, roteamento, cliente TanStack Query, login e aguardando liberação, pedido de reautorização Google (D12), fila do dia desktop e celular, modal de registrar contato, cadastro manual com checkbox de opt-in (D5), importação de CSV com relatório (D6)), `packages/shared` (reuso dos schemas Zod).
- **Testes:** Vitest com Testing Library por tela: estados vazio, carregando, erro e sem permissão; modal bloqueia salvar sem próximo passo (RN-01) e PERDIDO sem motivo (RN-05); laranja só em itens Atrasados (D8); nenhum texto com travessão; labels, botões reais e alvos de toque de 44px.
- **Critérios de aceite:** telas conferidas com as capturas de `docs/prototipo/` (D9); fila navegável no celular e no desktop em staging; nenhuma tela sem estado de erro.

### Sessão 7b: funil, revisão, agenda e acessos

- **Módulos:** `apps/web` (funil kanban, revisão semanal com nutrição, agenda com destaque de REMARCAR, aviso de lead sem opt-in (D5) e aviso de sync `ERROR` (D11), tela de acessos para admin).
- **Testes:** mesmos padrões da 7a por tela; agenda mostra aviso de `ERROR` e de lead sem opt-in; acessos só para admin.
- **Critérios de aceite:** fluxo completo navegável em staging no celular e no desktop, conforme `docs/prototipo/`; nenhum texto com travessão; nenhuma tela sem estado de erro.

### Sessão 8: deploy, CI/CD, backup

- **Módulos:** Dockerfiles multi-stage de `apps/api`, `apps/web` e `apps/worker`; stack Swarm com Traefik; workflows do GitHub Actions; script de backup; `docs/runbook.md` e documento de restore.
- **Testes:** build das três imagens no CI; healthcheck responde; restore do `pg_dump` em banco limpo com contagem de linhas; verificação de que Postgres, Redis e WhatsApp não publicam portas.
- **Critérios de aceite:** deploy em staging a partir de merge na main; produção só com aprovação manual; `pg_dump` diário às 03:00 com retenção de 7 diários e 4 semanais, enviado via SSH ao servidor doméstico, restore testado e documentado (D16); runbook cobre WhatsApp desconectado, token Google revogado (D12) e rollback; nenhuma porta de banco, Redis ou WhatsApp exposta.

## 5. Perguntas para o arquiteto

Perguntas originais do rascunho do plano mestre, com a decisão que responde cada uma.

1. **Opt-in do WhatsApp:** onde o opt-in é obtido? Campo no formulário, coluna no CSV, alternância manual na tela do lead ou combinação? **Respondida por D5.**
2. **Resposta "2" em lead PERDIDO:** ignorar e registrar, avisar o responsável ou reabrir o lead? **Respondida por D4.**
3. **Dedupe de CSV:** linha com telefone existente é rejeitada, pulada com relatório ou usada para atualizar o lead? **Respondida por D6** (a resposta HTTP do webhook para duplicado segue RN-06 e fica para o plano da sessão 4).
4. **Associação da resposta ao compromisso:** confirmar "compromisso futuro ativo com o último lembrete `SENT`" ou outra regra? **Respondida por D7.**
5. **Stack WhatsApp existente:** produto, versão, endpoint de envio, formato do webhook, autenticação e detecção de queda? **Respondida por D10** (adaptador agora; stack concreta confirmada antes da sessão 6).
6. **Fila de hoje e atraso:** atrasado antes de 00:00 de hoje ou `data_proximo_passo < agora`? Qual fuso vale? **Respondida por D8.**
7. **Retry do sync PENDING:** qual política? **Respondida por D11.**
8. **Protótipo:** copiar capturas para dentro do repositório? **Respondida por D9.**
9. **Aviso de novo cadastro sem admin ACTIVE e primeiro admin fora do seed:** quem recebe e como o primeiro admin nasce? **Respondida por D1.**
10. **`necessidade_resumo` NOT NULL no formulário:** obrigatório ou "Não informada"? **Respondida por D2.**
11. **Próximo passo de leads do CSV:** aplicar "Primeiro contato" em +1h a todas as linhas ou outra regra? **Pendente:** não coberta explicitamente por D1 a D16; proposta em 1.18.
12. **Exclusão feita no Google:** vira `status = CANCELLED` (e não `deleted_at`)? **Pendente:** não coberta explicitamente por D1 a D16; proposta em 1.18.

Perguntas levantadas nesta revisão e já respondidas:

13. **Fonte do próximo passo:** `leads` ou `lead_interactions`? **Respondida por D3.**
14. **Refresh token revogado:** como marcar o usuário para reautorizar? **Respondida por D12.**
15. **Derrubar sessões ao bloquear:** qual estrutura no Redis? **Respondida por D13.**
16. **Recuperação de jobs após restart do worker:** de onde recriar? **Respondida por D14.**
17. **Tamanho da sessão 7 e testes das sessões 3 a 6 sem interface:** dividir e como testar? **Respondida por D15.**
18. **Backup da sessão 8:** horário, retenção, destino e restore? **Respondida por D16.**

## 6. Decisões do arquiteto

Decisões aprovadas por Mateus em 2026-09-30 (Sessão 0).

- **D1. Admin inicial e responsável padrão.** Nova variável `ADMIN_EMAIL`. O seed cria o tenant, o admin com esse e-mail e preenche `tenants.default_owner_user_id`. O primeiro login com e-mail igual a `ADMIN_EMAIL` vira `ADMIN` e `ACTIVE`. O aviso de novo cadastro vai sempre para `ADMIN_WHATSAPP`. A RN-15 é proteção em tempo de execução.
- **D2. Próximo passo e necessidade no formulário.** O webhook grava `data_proximo_passo = agora + 1h` e `descricao_proximo_passo = 'Primeiro contato'` no próprio INSERT. Necessidade vazia vira "Não informada" também no formulário.
- **D3. Fonte da verdade do próximo passo.** `leads.data_proximo_passo` e `leads.descricao_proximo_passo`. Os campos de próximo passo em `lead_interactions` são registro histórico.
- **D4. Resposta de lead PERDIDO ou excluído.** Ignorada e registrada em log.
- **D5. Opt-in explícito.** Checkbox "Cliente autorizou mensagens no WhatsApp" no cadastro manual; campo booleano `whatsapp_opt_in` no formulário do site (ausente = false); coluna opcional `opt_in` no CSV (sim/não; vazia = não). Aviso na tela ao criar compromisso para lead sem opt-in.
- **D6. Telefone duplicado no CSV.** A linha é pulada, nunca atualiza o lead existente e aparece no relatório de importação.
- **D7. Associação da resposta do WhatsApp.** Telefone, lead único do tenant (RN-06), compromisso futuro não cancelado com o lembrete `SENT` mais recente. Sem correspondência: ignora e registra em log.
- **D8. Fila diária em America/Sao_Paulo.** Atrasado = `data_proximo_passo < agora`; Hoje = de agora até 23:59:59; Próximos 7 dias = amanhã 00:00 até +7 dias; "fila de hoje" = Atrasados + Hoje; o laranja do protótipo é Atrasado.
- **D9. Protótipo.** Capturas ficam em `docs/prototipo/` como referência visual.
- **D10. WhatsApp.** Envio implementado contra o adaptador `WhatsAppProvider` com `send(telefone, texto)` e webhook normalizado `{from, text, timestamp}`. Respostas normalizadas (trim, minúsculas, sem acento) aceitando "1", "2" e "sair". Stack concreta confirmada antes da sessão 6.
- **D11. Retry de sync PENDING.** Backoff de 1 min, 5 min, 15 min, 1 h e depois a cada 6 h. Após 24 h, `sync_status = ERROR` e aviso na agenda.
- **D12. Refresh token revogado.** Coluna `users.google_reauth_required BOOLEAN NOT NULL DEFAULT FALSE`. `invalid_grant` marca `true`, a interface pede nova autorização, sync e criação ficam `PENDING`.
- **D13. Sessões ao bloquear.** Set Redis `user_sessions:<user_id>`; bloquear apaga todas as sessões do usuário.
- **D14. Restart do worker.** Recria jobs a partir de `appointment_reminders` PENDING com `scheduled_for` futuro.
- **D15. Sessão 7 e testes via API.** Sessão 7 dividida em 7a e 7b. Testes das sessões 3 a 6 via API, com coleção `.http` em `docs/api/`.
- **D16. Backup.** `pg_dump` diário às 03:00, retenção de 7 diários e 4 semanais, envio via SSH ao servidor doméstico, restore testado e documentado.
