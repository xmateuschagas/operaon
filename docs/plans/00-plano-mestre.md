# Plano mestre do OperaON (Sessão 0)

Documento de planejamento. Nenhum código de aplicação é escrito nesta sessão.

Fontes lidas: `AGENTS.md`, `docs/rfc-002.md` (citado como "RFC"), `docs/regras-de-negocio.md` (citado como "RN"), `docs/prototipo.md`, `docs/decisoes.md` e `docs/prompts/01` a `08`.

Convenção de citação: "RFC L74" significa linha 74 de `docs/rfc-002.md`; "RN L11" significa linha 11 de `docs/regras-de-negocio.md`.

## 1. Contradições, lacunas e ambiguidades

### 1.1 RN-07 vs RN-15: responsável padrão e fallback

- **Onde:** RFC L74 (comentário de `default_owner_user_id`: "o seed sempre preenche com o admin"); RN-07 (RN L11); RN-15 (RN L19); `docs/decisoes.md` (linha "Fallback do responsável padrão (RN-15); seed preenche default_owner_user_id").
- **Problema:** se o seed sempre preenche o campo, parece que o fallback e o 503 nunca acontecem. Não é verdade: a coluna aceita NULL (sem NOT NULL) e o usuário apontado pode ser bloqueado depois (usuário nunca é excluído, só vira `BLOCKED`, RFC L229).
- **Proposta de esclarecimento (a confirmar):**
  1. Caminho normal: `default_owner_user_id` preenchido e usuário `ACTIVE`. O lead vai para ele. Vale sempre logo após o seed.
  2. Fallback: campo NULL (tenant criado fora do seed, ou limpo por um admin) ou usuário apontado em `PENDING`/`BLOCKED`. O lead vai para o admin `ACTIVE` mais antigo do tenant (`ORDER BY created_at ASC, id ASC` para desempate determinístico).
  3. Falha: nenhum admin `ACTIVE`. Webhook responde 503 e o CSV é recusado inteiro com mensagem clara.
  - A resolução é feita no momento da captura e **não altera** `tenants.default_owner_user_id`. Uso do fallback é registrado em log (e opcionalmente no `audit_log`).
  - Sugestão: ao bloquear o usuário que é o responsável padrão, a tela de Acessos avisa o admin e oferece trocar o responsável padrão.

### 1.2 RN-01 vs RN-07: CHECK exige próximo passo no lead NOVO

- **Onde:** CHECK `rn01_proximo_passo` (RFC L128 a L132) e colunas `data_proximo_passo`/`descricao_proximo_passo` (RFC L119 e L120) sem default; RN-07 (RN L11).
- **Problema:** um lead NOVO sem próximo passo viola o CHECK. O webhook tem de gravar os dois campos no próprio INSERT, e não em um UPDATE posterior.
- **Proposta:** o INSERT do webhook grava `etapa = 'NOVO'`, `data_proximo_passo = now() + interval '1 hour'` e `descricao_proximo_passo = 'Primeiro contato'` na mesma instrução.
- **Lacuna derivada (CSV):** RN-07 define o próximo passo "+1h" só para o formulário. Para o CSV não há regra de próximo passo, e todo lead importado em etapa aberta também violaria o CHECK. Proposta: aplicar o mesmo padrão ("Primeiro contato" em +1h) a cada linha do CSV, ou aceitar colunas opcionais de próximo passo. Ver pergunta 5.12.

### 1.3 RN-16 sem sessão atribuída

- **Onde:** RN-16 (RN L20); tabela de sessões (RFC L284 a L294) não cita RN-16; o fluxo de compromisso (RFC L247 a L251) também não. Apenas `docs/prompts/05-agenda-google.md` (item 2) menciona "RN-16 ao excluir ou perder o lead".
- **Proposta:** atribuir RN-16 **explicitamente à sessão 5**, com complemento na sessão 6:
  - Sessão 5: ao excluir (`deleted_at`) ou marcar PERDIDO, cancela os compromissos futuros (`status = CANCELLED`), marca as linhas de `appointment_reminders` como `CANCELLED` e remove o evento do Google (com `sync_status = PENDING` se o Google falhar, RN-11). Lead GANHO mantém tudo.
  - Sessão 6: a mesma função de cancelamento passa a remover os jobs do BullMQ pelo `job_id`. O worker também confere, no momento do envio, se o compromisso e o lembrete continuam válidos.
  - Registrar essa atribuição em `docs/decisoes.md` (pelo Cowork) e corrigir a tabela da seção 9 do RFC.

### 1.4 `lead_interactions` imutável e dupla fonte do próximo passo

- **Onde:** `lead_interactions.proximo_passo_definido` e `data_agendada_passo` (RFC L152 e L153); `leads.data_proximo_passo` e `descricao_proximo_passo` (RFC L119 e L120); imutabilidade (RFC L231); RN-02 (RN L6).
- **Problema:** o próximo passo existe em dois lugares. Ações que mudam o próximo passo sem interação (reativar na revisão, RN-10 "Remarcar: ...", edição manual) deixam a última interação desatualizada, e ela não pode ser editada.
- **Proposta:** fonte única de verdade = `leads.data_proximo_passo` e `leads.descricao_proximo_passo`. A fila, o CHECK e a revisão leem só do lead. Os campos da interação são um **registro histórico** da promessa feita naquela conversa e nunca são usados para calcular a fila. Mudanças de próximo passo sem interação são registradas no `audit_log` (valor anterior e novo).
- Reforço técnico sugerido: trigger que impede UPDATE e DELETE em `lead_interactions`.

### 1.5 RN-10 não cobre resposta "2" de lead PERDIDO

- **Onde:** RN-10 (RN L14) trata lead em aberto e lead GANHO; RN-16 (RN L20) cancela compromissos futuros quando o lead vira PERDIDO.
- **Problema:** um lembrete enviado antes da perda pode receber "2" depois. O lead não pode voltar para a fila sem sair de PERDIDO, e RN-10 não diz o que fazer.
- **Proposta provisória:** não alterar o lead nem o compromisso cancelado; registrar em log e avisar o responsável pelo Notifier ("cliente pediu para remarcar, lead está PERDIDO"). Ver pergunta 5.2.

### 1.6 Opt-in do WhatsApp sem fluxo de captura

- **Onde:** `whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE` (RFC L124); RN-09 (RN L13); RN-07 (RN L11) e o fluxo de CSV não citam opt-in.
- **Problema:** nenhum fluxo define quando o opt-in vira `true`. Sem isso, nenhum lembrete sai e a sessão 6 não é testável com dados reais.
- **Proposta provisória:** campo booleano opcional `whatsapp_opt_in` no payload do formulário (o site coleta o aceite explícito); coluna opcional `whatsapp_opt_in` no CSV (`sim`/`nao`, vazio = `false`); alternância manual na tela do lead com registro no `audit_log` (quem, quando, origem). Ver pergunta 5.1.

### 1.7 Dedupe de CSV por telefone

- **Onde:** RN-06 (RN L10): "duplicado bloqueia a criação e sugere o lead existente"; RFC L12 ("importação de CSV com deduplicação por telefone"); `docs/prompts/04-revisao-captura.md` ("não cria duplicados e informa o que foi ignorado").
- **Problema:** não está definido se a linha duplicada é rejeitada (e o arquivo inteiro falha), pulada ou usada para atualizar o lead existente. Também não está definido o caso de telefones repetidos dentro do próprio arquivo.
- **Proposta provisória:** pular a linha, sem atualizar o lead existente, e listar no relatório com o id do lead existente. Duplicado dentro do arquivo: a primeira ocorrência vale, as demais são puladas. O mesmo vale para o webhook do formulário: duplicado não cria lead e responde com o id existente (código de resposta a definir, ver pergunta 5.3).

### 1.8 Associação da resposta "1"/"2" ao compromisso

- **Onde:** RN-10 (RN L14); fluxo "WhatsApp recebido" (RFC L256 e L257).
- **Problema:** a mensagem recebida traz só o telefone. O lead pode ter vários compromissos futuros. Além disso, o número é central (ADR-3, RFC L27) e o índice único de telefone é por tenant (RFC L137): o mesmo telefone pode existir em mais de um tenant.
- **Proposta provisória:** localizar leads com aquele `telefone_e164` e `deleted_at IS NULL`; entre os compromissos deles com `status IN ('SCHEDULED','CONFIRMED')`, `deleted_at IS NULL` e `start_time > now()`, escolher o que tem o **último lembrete `SENT`** (maior `sent_at`). Sem nenhum candidato: ignorar e registrar em log. Mais de um tenant com o mesmo telefone: registrar e não agir (no MVP há um tenant). Ver pergunta 5.4.

### 1.9 Protótipo em link externo

- **Onde:** `docs/prototipo.md` L3 (link `claude.ai/artifact/...`).
- **Risco:** o link pode sair do ar, mudar ou exigir login; a sessão 7 e a auditoria do Cowork ficariam sem referência.
- **Proposta:** exportar prints de cada tela (desktop e celular) e uma especificação curta (cores, fontes, espaçamentos, componentes) para dentro do repositório, por exemplo em `docs/prototipo/`. Ver pergunta 5.8.

### 1.10 "Fila de hoje" sem definição formal

- **Onde:** RN-10 (RN L14, "aparece na fila de hoje"); RFC L257; `docs/prompts/03-leads-fila.md` (atrasados, hoje, próximos 7 dias); `docs/prototipo.md` L10 (laranja só para atraso).
- **Problema:** não há definição exata dos intervalos nem do critério de atraso. Também há duas fontes de fuso: `tenants.timezone` (RFC L73) e `TZ_DEFAULT` (RFC L274).
- **Proposta (fuso do tenant, com `TZ_DEFAULT` só como padrão ao criar tenant):**
  - `inicio_hoje` = 00:00 de hoje em America/Sao_Paulo, convertido para UTC.
  - Atrasado: `data_proximo_passo < inicio_hoje`.
  - Hoje: `inicio_hoje <= data_proximo_passo < inicio_hoje + 1 dia`.
  - Próximos 7 dias: `inicio_hoje + 1 dia <= data_proximo_passo < inicio_hoje + 8 dias`.
  - "Fila de hoje" = atrasados + hoje, sempre com `etapa NOT IN ('GANHO','PERDIDO')` e `deleted_at IS NULL`.
  - Justificativa: se "atrasado" fosse `data_proximo_passo < now()`, o lead que RN-10 coloca "na fila de hoje" com `data_proximo_passo = agora` já apareceria em laranja no minuto seguinte. Ver pergunta 5.6.

### 1.11 Achados adicionais

- **Sessões x RNs:** a tabela da seção 9 (RFC L288 a L292) cita só RN-01 a RN-11. RN-12 aparece no prompt 03, RN-13, RN-14 e RN-16 no prompt 05, RN-15 no prompt 04. Proposta de mapeamento completo na seção 3.
- **README desatualizado:** `README.md` diz "RN-01 a RN-12", mas existem RN-01 a RN-16. Fora do escopo desta sessão (não alterar), fica como sugestão.
- **Exclusão feita no Google:** RFC L254 diz que o sync aplica "exclusão", mas não diz se vira `status = CANCELLED` ou `deleted_at`. Proposta: `status = CANCELLED` e lembretes `CANCELLED`, mantendo `deleted_at` para exclusão feita no OperaON.
- **`sync_status = ERROR`:** o enum existe (RFC L63), mas nenhum fluxo define quando é usado. Proposta: `ERROR` após esgotar as tentativas de reprocessamento, visível na agenda.
- **Refresh token revogado:** o prompt 05 pede "marca o usuário para reautorizar", mas não há coluna para isso. Proposta: limpar `google_refresh_token_enc` (NULL), o que já dispara o consentimento incremental no próximo login (RFC L244).
- **Opt-in "no envio" vs compromisso:** RFC L248 confere o opt-in no envio de cada lembrete. Falta dizer o status do lembrete quando o opt-in está desligado. Proposta: `CANCELLED` com `error_log = 'sem opt-in'`.

## 2. Riscos técnicos

### 2.1 Google OAuth e escopos

| Risco | Mitigação |
|---|---|
| Consentimento incremental (ADR-8, RFC L32 e L244): usuário recusa o escopo de agenda ou aprova só parte dele | Verificar os escopos concedidos no retorno; sem escopo de agenda, o usuário entra, mas agenda fica desabilitada com aviso e botão para autorizar de novo |
| Google não devolve refresh token no segundo consentimento | Pedir `access_type=offline` e `prompt=consent` na etapa de agenda; `include_granted_scopes=true` |
| Refresh token revogado pelo usuário ou expirado (`invalid_grant`) | Limpar `google_refresh_token_enc`, parar o sync do usuário, registrar em log e pedir reautorização no próximo acesso; runbook na sessão 8 |
| Vazamento de token | AES-256-GCM com `TOKEN_ENC_KEY` (32 bytes base64, RFC L269); IV aleatório de 12 bytes por cifragem; formato versionado `v1:iv:tag:cifra` para permitir rotação de chave; validar a chave no boot; redação de tokens nos logs (pino `redact`) |
| App em modo de teste do Google limita usuários e expira refresh token em 7 dias | Confirmar status de publicação e verificação do app no Google Cloud antes do staging |

### 2.2 Sync de agenda

| Risco | Mitigação |
|---|---|
| `syncToken` inválido (HTTP 410) | Descartar `google_sync_token`, fazer sync completo da agenda "OperaON" e guardar o novo token |
| Eventos com `status = cancelled` chegam no incremental | Tratar como exclusão (ver 1.11) apenas se `google_event_id` for conhecido |
| Evento criado direto no Google (RN-14) | Ignorar e registrar em log; nunca criar compromisso sem lead (RN-13) |
| Janela de polling de 5 min (ADR-5) | Aceito no MVP; job repetível por usuário com `jobId` fixo para não duplicar; distribuir os horários para não bater cota |
| Race entre edição local e edição no Google | Comparar `updated` do evento com `appointments.updated_at`; alteração local com `sync_status = PENDING` tem prioridade até ser enviada; registrar conflito em log |
| Eco do próprio app (o sync lê de volta a alteração que o OperaON acabou de enviar) | Ignorar quando os campos já são iguais aos locais |
| Mudança de horário vinda do Google | Reprogramar lembretes pela mesma rotina de remarcação (RN-08), inclusive `CANCELLED` para horários já passados |
| Cota e rate limit da Calendar API | Backoff exponencial em 403/429; limite de concorrência no worker |

### 2.3 WhatsApp

| Risco | Mitigação |
|---|---|
| Stack não especificada (ADR-3, RFC L27: "reutilizar a stack existente"); formato do envio e do webhook desconhecido | Pedir a especificação antes da sessão 6 (pergunta 5.5); isolar atrás de um cliente com interface própria e testes com mock |
| Normalização das respostas | `trim`, maiúsculas, remover acentos e pontuação; aceitar "1", "2", "SAIR" exatos após normalização; qualquer outro texto é ignorado e registrado |
| Opt-in desligado entre o agendamento e o envio | Conferir `whatsapp_opt_in` do lead no momento do envio (RFC L248), dentro do job |
| Sessão do WhatsApp cair | Alerta (sessão 8, item 4); lembrete fica `FAILED` com `error_log` e retry com backoff |
| Webhook interno recebido sem autenticação | Token compartilhado ou rede interna apenas; nunca exposto publicamente (AGENTS.md) |

### 2.4 Fila BullMQ

| Risco | Mitigação |
|---|---|
| Envio duplicado | `jobId` determinístico `rem:<appointment_id>:<tipo>:<epoch do scheduled_for>` (RFC L251); antes de enviar, reler a linha e só enviar se `status = PENDING` e o `job_id` bater; marcar `SENT` em transação |
| Job antigo sobrevivendo à remarcação | Remover o job antigo pelo `job_id` gravado antes de gravar o novo; se a remoção falhar (job em execução), o job antigo aborta porque o `job_id` da linha já mudou |
| Perda de jobs após restart ou falha do Redis | Redis com AOF (RFC L39); no boot do worker, re-materializar jobs a partir de `appointment_reminders` com `status = PENDING` e `scheduled_for` futuro (o `jobId` fixo impede duplicata); lembretes PENDING com horário já passado viram `CANCELLED` ou `FAILED` conforme regra definida |
| Horário de verão ou fuso | Tudo em UTC no banco e no `delay` do BullMQ (AGENTS.md) |

### 2.5 Sessões

| Risco | Mitigação |
|---|---|
| Bloqueio precisa derrubar sessões na hora (RFC L245) | Além da chave `sess:<id>`, manter um índice `user_sessions:<user_id>` (SET) com os ids de sessão; ao bloquear, apagar todas as chaves do SET em uma operação atômica (MULTI ou script Lua) |
| Índice desatualizado com sessões expiradas | TTL no SET renovado junto com a sessão; limpeza de ids órfãos ao listar |
| Cookie | Opaco, HttpOnly, Secure, SameSite=Lax, assinado com `SESSION_SECRET`; rotação do id de sessão no login |
| Mudança de papel ou status sem novo login | Reler status e papel do usuário a cada requisição (ou cache curto invalidado ao alterar) |

## 3. Validação das sessões 1 a 8

A ordem e as dependências do RFC (L284 a L294) são coerentes: fundação, autenticação, domínio de leads, captura, agenda, lembretes, interface e deploy. Ajustes propostos:

1. **Notifier na sessão 2:** a interface `Notifier` e a implementação `LogNotifier` precisam existir já na sessão 2, porque o aviso de aprovação ao admin (RFC L242) acontece antes da sessão 6 (RFC L259 e L260). A sessão 6 só adiciona `WhatsAppNotifier` e troca a configuração.
2. **Seed da sessão 1:** deve criar o tenant, o admin `ACTIVE` com `role = ADMIN` e preencher `tenants.default_owner_user_id` com esse admin (RFC L74). Como há FK circular (RFC L221), o seed cria o tenant, depois o admin, e por fim atualiza o tenant, tudo em uma transação.
3. **RN-16:** atribuída à sessão 5 (cancelamento de compromissos, lembretes e evento Google), com complemento na sessão 6 (remoção dos jobs), conforme 1.3.
4. **Worker começa na sessão 5:** o sync por polling e o reprocessamento de PENDING já são jobs BullMQ. O `apps/worker` nasce na sessão 1 (esqueleto), recebe os jobs de sync na sessão 5 e os de lembrete na sessão 6.
5. **Mapeamento completo de RNs por sessão:** S1 (RN-01, 05, 06 no banco), S2 (RN-12 para bloqueio), S3 (RN-01, 02, 05, 06, 12), S4 (RN-03, 04, 06, 07, 15), S5 (RN-11, 13, 14, 16), S6 (RN-08, 09, 10), S7 (RN-01 e 05 na tela).
6. **Sessão 7 é a maior:** detalhar o plano por tela do protótipo, cada uma com seus estados (vazio, carregando, erro, sem permissão): (a) login e aguardando liberação; (b) fila do dia mobile-first com modal de registrar contato; (c) funil kanban; (d) revisão semanal com nutrição; (e) agenda; (f) acessos (admin); (g) cadastro e importação de leads. Identidade visual de `docs/prototipo.md`: azul-marinho #0E1F3D, azul de ação #1F5FBF, laranja apenas para atraso (#8A4500 sobre #FFE2C6), Sora nos títulos e IBM Plex Sans no texto. Se o volume passar de um PR revisável, dividir em 7a (login, fila, modal) e 7b (demais telas), mantendo "uma sessão = um PR" por subsessão.
7. **Sessão 8, backup:** ADR-2 (RFC L26) diz que o servidor doméstico é só para backup. Definir: `pg_dump` diário na VPS, cópia cifrada para o servidor doméstico (por exemplo via rsync sobre SSH ou restic), retenção (sugestão: 7 diários, 4 semanais, 3 mensais), teste de restore documentado e alerta se o backup falhar. Redis não precisa de backup (sessões e jobs são re-materializáveis), mas o AOF deve ficar em volume persistente.

## 4. Por sessão: módulos afetados, testes previstos e critérios de aceite

Todos os testes em Vitest; testes de API com Supertest contra Postgres e Redis reais do Compose de dev (ou containers de teste). Datas controladas com relógio falso.

### Sessão 1: fundação

- **Módulos:** raiz (`pnpm-workspace.yaml`, `tsconfig` base strict, lint), `apps/api` (Fastify com rota de saúde, Drizzle, migrations e seed, local exato a definir no plano da sessão, sugestão `apps/api/src/db`), `apps/web` ("hello"), `apps/worker` (esqueleto BullMQ), `packages/shared` (esqueleto de schemas Zod), `docker-compose.dev.yml`, `.github/workflows/ci.yml`, `.env.example`.
- **Testes:**
  - RN-01 (CHECK): INSERT de lead NOVO sem `data_proximo_passo` ou sem `descricao_proximo_passo` falha; GANHO e PERDIDO sem próximo passo passam.
  - RN-05 (CHECK): PERDIDO sem `motivo_perda` falha; com motivo passa.
  - RN-06 (índice único parcial): mesmo `(tenant_id, telefone_e164)` falha; após `deleted_at` preenchido no primeiro, o segundo passa; mesmo telefone em outro tenant passa.
  - Trigger de `updated_at` atualiza a coluna em UPDATE.
  - Migrations: up, down, up sem erro.
  - Seed: tenant com `default_owner_user_id` = admin `ACTIVE` e `ADMIN`; lead nunca contatado criado há mais de 7 dias existe.
- **Critérios de aceite:** `docker compose up` e `pnpm dev` sobem api, web e worker sem erro; `pnpm db:migrate` e `pnpm db:rollback` funcionam; testes de RN-01, RN-05 e RN-06 no banco verdes; `.env.example` com todas as variáveis de RFC L262 a L275, sem valores reais; CI (lint, typecheck, testes) verde no PR.

### Sessão 2: autenticação, aprovação, sessões, acessos

- **Módulos:** `apps/api` (rotas OAuth, sessão Redis, middleware de autenticação e papel, módulo de acessos, `audit_log`, cripto AES-256-GCM, `Notifier` e `LogNotifier`), `packages/shared` (schemas das rotas e tipo `Notifier`), `apps/web` (tela mínima de login e aguardando liberação, se prevista no plano; tela final na sessão 7).
- **Testes:**
  - E-mail novo cria usuário `PENDING` e chama `LogNotifier` com link de aprovação.
  - `PENDING` recebe 403 `USER_PENDING_APPROVAL`; `BLOCKED` recebe 403 `ACCESS_REVOKED`; nenhum dos dois ganha cookie.
  - Token de aprovação: chave `approval:<sha256>` no Redis, TTL de 24h, segundo uso falha (GETDEL), expirado falha.
  - Bloquear usuário apaga todas as sessões dele (requisição seguinte com o cookie antigo recebe 401) e grava no `audit_log` (RN-12).
  - Cripto: cifrar e decifrar retorna o original; cifra adulterada falha na verificação da tag; banco nunca guarda o token puro; logs não contêm token (teste do `redact`).
  - `ACTIVE` sem `google_refresh_token_enc` é redirecionado ao consentimento do escopo de agenda.
  - Cookie com HttpOnly, Secure e SameSite=Lax; logout apaga a sessão.
  - Usuário `USER` recebe 403 nas rotas de acessos.
- **Critérios de aceite:** os três testes do prompt 02 verdes; token nunca aparece em texto puro no banco nem nos logs; link de aprovação expira e não pode ser reutilizado; aviso ao admin passa pela interface `Notifier`.

### Sessão 3: leads, interações, fila, funil, templates

- **Módulos:** `apps/api` (módulos leads, interações, fila, funil, templates), `packages/shared` (schemas de lead, interação, telefone E.164), migration nova só se necessária (por exemplo trigger de imutabilidade de `lead_interactions`).
- **Testes:**
  - RN-01 na API: criar ou atualizar lead aberto sem próximo passo retorna 422 com mensagem clara (além do CHECK).
  - RN-02: registrar interação atualiza `data_ultimo_contato`, etapa e próximo passo; forçar falha no meio da transação não deixa nada gravado (atomicidade).
  - RN-05: mover para PERDIDO sem motivo retorna 422; com motivo e detalhe grava.
  - RN-06: variações de telefone ("(21) 99999-9999", "+55 21 99999 9999") viram o mesmo E.164; duplicado retorna 409 com o id do lead existente; o índice único parcial é o último guardião.
  - RN-12: excluir lead preenche `deleted_at`, some das listagens e grava no `audit_log`; `lead_interactions` não tem rota de edição nem de exclusão.
  - Escopo: usuário comum não vê nem altera lead de outro (404); admin vê todos (ADR-4).
  - Fila: buckets com datas fixas perto da meia-noite de São Paulo (por exemplo 02:30 UTC = 23:30 do dia anterior) conforme a definição de 1.10; contadores corretos.
  - Funil: quantidade e soma de `valor_estimado` por etapa, ignorando excluídos.
  - Templates: substituição de `{nome}`, `{empresa}`, `{necessidade}` e link `wa.me` com texto codificado.
- **Critérios de aceite:** testes de RN-01, 02, 05, 06 e 12 verdes, incluindo teste de CHECK, de transação atômica e de índice único parcial; isolamento por usuário comprovado; "hoje" calculado em America/Sao_Paulo.

### Sessão 4: revisão semanal, nutrição, formulário, CSV

- **Módulos:** `apps/api` (revisão, nutrição, webhook do formulário, importação CSV com pré-visualização, serviço de captura com RN-15), `packages/shared` (schemas do webhook e da linha do CSV).
- **Testes:**
  - RN-03 com datas fixas: 7 dias exatos não é inativo, 7 dias e 1 minuto é; lead nunca contatado conta pela criação; GANHO, PERDIDO e excluído ficam fora; `nutricao_ate` futuro exclui, vencido inclui.
  - RN-04: nutrir 15 ou 30 dias grava `nutricao_ate` correto; outros valores retornam 422.
  - Reativar exige novo próximo passo (RN-01); encerrar como PERDIDO exige motivo (RN-05).
  - Webhook: token inválido ou ausente retorna 401 (comparação em tempo constante); lead criado com etapa NOVO, origem "Formulário do site", UTM, "Primeiro contato" em +1h (RN-07 e 1.2); duplicado não cria lead (RN-06).
  - RN-15: responsável padrão `ACTIVE` recebe o lead; responsável padrão `BLOCKED` ou NULL faz o lead ir para o admin `ACTIVE` mais antigo; sem admin `ACTIVE`, webhook responde 503 e CSV é recusado.
  - CSV: pré-visualização não grava nada; defaults de RN-07 (`origem` = "Importação CSV", `necessidade` = "Não informada", `responsavel_email` vazio = responsável padrão); duplicados no banco e dentro do arquivo aparecem no relatório; erros por linha (telefone inválido, e-mail de responsável inexistente) não impedem as linhas válidas, conforme decisão de 1.7.
- **Critérios de aceite:** testes de RN-03 e RN-04 com relógio falso verdes; webhook recusa token inválido e aplica RN-06, RN-07 e RN-15; import não cria duplicados e informa o que foi ignorado e por quê.

### Sessão 5: agenda e sync Google

- **Módulos:** `apps/api` (cliente Google Calendar, criação da agenda "OperaON", CRUD de compromissos, cancelamento por RN-16), `apps/worker` (job de sync a cada 5 min por usuário, job de reprocessamento de PENDING com backoff), `packages/shared` (schemas de compromisso).
- **Testes (Google simulado):**
  - Criar agenda "OperaON" na primeira autorização e guardar `google_calendar_id`; nenhuma chamada usa `calendarId = 'primary'`.
  - RN-11: criar compromisso com Google OK grava `sync_status = SYNCED` e `google_event_id`; com falha do Google, o compromisso é salvo com `sync_status = PENDING` e o job de reprocessamento o leva a `SYNCED` quando o Google volta.
  - RN-13: compromisso sem lead, com lead excluído ou com telefone fora de E.164 retorna 422; início depois do fim retorna 422.
  - Sync: alteração de horário no Google é aplicada; evento `cancelled` conhecido vira `CANCELLED`; evento desconhecido é ignorado e logado (RN-14); resposta 410 dispara sync completo.
  - RN-16: excluir ou marcar PERDIDO cancela compromissos futuros, marca lembretes `CANCELLED` e remove o evento do Google; lead GANHO mantém os compromissos; compromissos passados não mudam.
  - `invalid_grant` limpa o refresh token e para o sync do usuário.
- **Critérios de aceite:** testes com mock para criação, edição, exclusão e erro verdes, incluindo falha do Google deixando `sync_status = PENDING`; alteração feita no Google aparece no OperaON em até 5 min (verificação manual em staging); nenhum evento na agenda principal.

### Sessão 6: worker, WhatsApp, confirmação e opt-out

- **Módulos:** `apps/worker` (jobs de lembrete, rate limit, retry, re-materialização no boot), `apps/api` (webhook interno de mensagens, `WhatsAppNotifier`, serviço de remarcação e cancelamento com troca de jobs), `packages/shared` (cliente e schemas do WhatsApp, se compartilhados).
- **Testes:**
  - RN-08: criação não gera lembrete com horário já passado; `job_id` segue o formato `rem:<appointment_id>:<tipo>:<epoch>`; remarcar atualiza a mesma linha (sem linha nova), remove o job antigo e cria o novo; linha cujo novo horário já passou vira `CANCELLED`; cancelar remove jobs e marca `CANCELLED`.
  - Reinício do worker: re-materialização a partir de `appointment_reminders` PENDING não duplica jobs nem envios; lembrete já `SENT` não é reenviado.
  - RN-09: lead com `whatsapp_opt_in = false` no momento do envio não recebe mensagem; "SAIR" (com variações de caixa e espaços) desliga o opt-in.
  - RN-10: "1" grava `CONFIRMADO` e `status = CONFIRMED`; "2" com lead em aberto grava `REMARCAR`, `data_proximo_passo = agora` e descrição "Remarcar: <título>"; "2" com lead GANHO não altera o lead, chama o Notifier e marca o compromisso para destaque; "2" com lead PERDIDO segue a decisão da pergunta 5.2.
  - Associação da resposta ao compromisso conforme a regra aprovada (1.8), incluindo o caso sem candidato.
  - Retry com backoff grava `error_log` e termina em `FAILED`; rate limit respeitado.
  - Configuração troca `LogNotifier` por `WhatsAppNotifier` sem mudar os chamadores.
- **Critérios de aceite:** reiniciar o worker não duplica envios; nenhuma mensagem sai para lead sem opt-in; testes de RN-08, RN-09 e RN-10 verdes; aviso de aprovação ao admin passa a sair pelo WhatsApp.

### Sessão 7: interface completa

- **Módulos:** `apps/web` (rotas, telas, componentes, cliente TanStack Query, tema Tailwind com as cores e fontes do protótipo), `packages/shared` (reuso dos schemas Zod nos formulários).
- **Testes:** Vitest com Testing Library por tela: estados vazio, carregando, erro e sem permissão; modal de registrar contato bloqueia salvar sem próximo passo (RN-01) e PERDIDO sem motivo (RN-05); cor laranja só em itens atrasados; verificação automática de que nenhum texto da interface contém travessão; checagens de acessibilidade (labels, botões reais, alvo de toque de 44px).
- **Critérios de aceite:** fluxo completo navegável em staging no celular e no desktop, tela a tela conforme o protótipo (login e aprovação, fila mobile-first, funil, revisão, agenda, acessos, cadastro e importação); nenhum texto com travessão; nenhuma tela sem estado de erro.

### Sessão 8: deploy, CI/CD, backup

- **Módulos:** Dockerfiles multi-stage de `apps/api`, `apps/web` e `apps/worker`; stack Swarm com Traefik; workflows do GitHub Actions (build, push GHCR, deploy staging, produção com aprovação); script de backup; `docs/runbook.md`.
- **Testes:** build das três imagens no CI; healthcheck responde; teste de restore do `pg_dump` em banco limpo com contagem de linhas; verificação de que Postgres, Redis e WhatsApp não publicam portas na stack.
- **Critérios de aceite:** deploy em staging a partir de merge na main; produção só com aprovação manual; backup diário copiado para o servidor doméstico (ADR-2) com retenção definida e restore testado e documentado; runbook cobre WhatsApp desconectado, token Google revogado e rollback; nenhuma porta de banco, Redis ou WhatsApp exposta.

## 5. Perguntas para o arquiteto

1. **Opt-in do WhatsApp:** onde o opt-in é obtido? Campo no formulário do site, coluna no CSV, alternância manual na tela do lead, ou uma combinação? Quem pode alterar e isso vai para o `audit_log`?
2. **Resposta "2" em lead PERDIDO:** ignorar e registrar, avisar o responsável pelo Notifier (como no GANHO) ou reabrir o lead?
3. **Dedupe de CSV:** linha com telefone já existente deve ser rejeitada (falhando o arquivo), pulada com relatório ou usada para atualizar o lead? E qual resposta o webhook do formulário dá para duplicado (200 com id existente, 409)?
4. **Associação da resposta ao compromisso:** confirmar a regra "compromisso futuro ativo com o último lembrete `SENT`" ou definir outra (mais próximo no tempo, janela máxima após o envio). O que fazer quando o telefone existe em mais de um tenant?
5. **Stack WhatsApp existente:** qual é o produto e a versão, como é o endpoint de envio, qual o formato do webhook interno de mensagens recebidas, como ele é autenticado e como detectamos que a sessão caiu?
6. **Fila de hoje e atraso:** confirmar a definição de 1.10 (atrasado = antes de 00:00 de hoje em America/Sao_Paulo; hoje = dia corrente) ou adotar atrasado = `data_proximo_passo < now()`. Qual fuso vale: `tenants.timezone` ou `TZ_DEFAULT`?
7. **Retry do sync PENDING:** qual política? Sugestão: backoff exponencial (1, 2, 4, 8, 16 min, teto de 1h), até 10 tentativas, depois `sync_status = ERROR` com botão "tentar de novo".
8. **Protótipo:** copiar prints e uma especificação do protótipo para dentro do repositório (por exemplo `docs/prototipo/`)?
9. **Sem admin ACTIVE no fluxo de aprovação:** quem recebe o aviso de novo usuário? Apenas `ADMIN_WHATSAPP` (variável de ambiente), independentemente do status no banco? E como o primeiro admin de um tenant novo é criado fora do seed?
10. **`necessidade_resumo` NOT NULL:** no formulário do site o campo é obrigatório (422 se vazio) ou aceita o placeholder "Não informada" como no CSV?
11. **Próximo passo de leads do CSV:** aplicar "Primeiro contato" em +1h a todas as linhas, aceitar colunas opcionais de próximo passo, ou outra regra? E em qual etapa o lead importado entra?
12. **Exclusão feita no Google:** confirmar que vira `status = CANCELLED` no OperaON (e não `deleted_at`).
