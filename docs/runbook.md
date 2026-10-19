# Operação do OperaON

Este handoff entrega artefatos. Nenhum deploy, acesso à VPS, publicação GHCR ou acesso à produção foi executado. A main recebe somente merge do Mateus. As instruções de entrega abaixo são para execução posterior pelo operador.

## Pré-requisitos e bootstrap

Usar Postgres 16, Docker Swarm e Traefik 3.3 ou posterior com provider Swarm, entrypoint websecure e resolver TLS já configurados. A stack reutiliza as redes externas traefik_public e whatsapp_private; a API WhatsApp não tem porta pública. A configuração usa [labels do provider Swarm](https://doc.traefik.io/traefik/v3.3/routing/providers/swarm/), incluindo traefik.swarm.network. Configurar nomes diferentes de router, volume, domínio e secrets para staging e produção. O volume externo do Postgres fica no nó com label operaon.data=true. PostgreSQL não possui alta disponibilidade automática nesta entrega.

Configuração privada em /opt/operaon/staging/release.env ou /opt/operaon/production/release.env: IMAGE_PREFIX=ghcr.io/xmateuschagas/operaon, APP_DOMAIN, SECRET_PREFIX, ROUTER_NAME, POSTGRES_VOLUME e nomes das redes. Não colocar passwords nesse arquivo. Domínio e GOOGLE_REDIRECT_URI devem coincidir com o ambiente e a origem HTTPS de APP_URL.

Criar Docker secrets fora do Git, com os nomes declarados em deploy/stack.yml. URLs:

- api_url: login operaon_api via pgbouncer:6432/operaon.
- worker_url: login operaon_worker_login via pgbouncer:6432/operaon.
- broker_url: login operaon_broker via postgres:5432/operaon, diretamente.
- migration_url: login administrativo via postgres:5432/operaon, diretamente, montado só no job de migration.
- pgbouncer_users: linhas no formato do auth_file PgBouncer, com os dois logins e passwords fortes ou verificadores SCRAM compatíveis com o servidor. Manter como secret, nunca no repositório. Validar autenticação em staging.

Antes da primeira entrega, iniciar somente Postgres/PgBouncer na rede privada, aplicar migrations usando a URL administrativa e executar scripts/provision-db.ts com API_DB_PASSWORD, WORKER_DB_PASSWORD e BROKER_DB_PASSWORD fortes via arquivos *_FILE. O launcher scripts/start.ts aceita migrate e provision. Provisionar logins após as migrations criarem operaon_app/operaon_worker. Não dar superuser, propriedade de tabelas ou BYPASSRLS a esses logins. O broker é dono apenas do schema pgboss. Não reutilizar login administrativo na API.

O provisionamento inicializa os objetos do pg-boss como operaon_broker. Para o CREATE SCHEMA IF NOT EXISTS interno da biblioteca, concede CREATE no banco somente durante o bootstrap e revoga em finally. O worker regular não mantém esse privilégio. Executar isso antes de iniciar workers e não reaplicar em schema de broker previamente criado por outro proprietário sem revisar a propriedade.

O launcher lê variáveis conhecidas *_FILE antes de importar o serviço. Secrets do Google, chave AES de 32 bytes base64 e SESSION_SECRET com pelo menos 32 caracteres nunca são logados. A chave AES deve ter cópia de recuperação em cofre, separada do backup do banco; sua perda impede recuperar refresh tokens.

## Pool e escalabilidade

PgBouncer usa transaction pooling, queries sem prepared statements nomeados e contexto exclusivamente local a BEGIN/COMMIT. Cada transação configura ROLE operaon_app e app.tenant_id; commit/rollback remove o contexto. DISCARD ALL adicional é aplicado ao devolver o backend. Nunca configurar tenant com SET de sessão. API e worker compartilham sessões, outbox, recibos e quotas no Postgres. A API sobe com duas réplicas na stack.

pg-boss usa URL direta para isolar requisitos do broker de recursos de sessão do pool. Migrations também usam URL direta. Referências oficiais: [modos PgBouncer](https://www.pgbouncer.org/features.html), [configuração](https://www.pgbouncer.org/config.html) e [secrets Swarm](https://docs.docker.com/engine/swarm/secrets/).

Quota padrão: 300 requisições/minuto/workspace, incluindo falhas posteriores à autorização. É contada antes da transação de negócio e compartilhada entre réplicas. Webhooks entram na quota após autenticar integração; reentrega continua idempotente quando admitida. Rotas globais, seletor e probes ficam fora. Resposta 429 inclui Retry-After. Contadores técnicos antigos têm retenção de dois dias. Lembretes têm limite separado de 30 envios/minuto/workspace.

## CI, release e rollback

CI de PR executa lint, typecheck, Vitest/Postgres, build, teste real de PgBouncer e build/config das imagens sem deploy. Todos os runners são ubuntu-24.04.

release.yml permanece inativo até o Mateus definir RELEASE_ENABLED=true. Após habilitar, merge na main constrói e publica imagens GHCR com SHA imutável. DEPLOY_ENABLED=true habilita entrega staging; produção exige execução manual com environment production e regras de aprovação do GitHub Environment configuradas pelo Mateus. Usar usuário SSH restrito, chave dedicada e SSH_KNOWN_HOSTS previamente verificado, sem desabilitar verificação de host. Configurar credenciais pull GHCR no Swarm se o pacote exigir autenticação. O agente não configura essas variáveis nem executa o workflow.

O script remoto pressupõe bootstrap concluído, cria um job de migration com secret administrativo restrito e autenticação de pull, espera conclusão antes de trocar as réplicas e verifica /ready HTTPS. As migrations de uma release devem ser compatíveis com a versão anterior durante a transição. O Traefik também verifica /ready no web antes de encaminhar tráfego. Configurar o pipeline para manter backup antes da entrega. Não rodar duas migrations/deploys simultâneos; workflow tem concurrency e migrations têm advisory lock transacional. Falha de migration exige diagnóstico, não repetir alterações de schema manualmente.

Rollback de aplicação: identificar SHA anterior validado, executar entrega desse SHA revisado ou docker service rollback dos serviços afetados. Não executar down de migration automaticamente. Avaliar compatibilidade e backup antes de qualquer reversão de schema. Se necessário, validar a reversão em banco de restore isolado primeiro. Um erro de release não autoriza o agente a fazer merge na main ou deploy.

## Probes e logs

API: /health testa processo; /ready testa conexão Postgres. Worker: porta privada 3001 com /health e /ready, esta última testa banco e broker. Web: /health do Nginx e /ready encaminhado à API. Probes não expõem tokens ou dados de negócio. A stack usa health de processo para liveness; validar readiness antes de receber tráfego após release.

Logs JSON incluem tenant_id/user_id quando conhecidos e null em operações globais. A API remove query strings e redacta cookies/Authorization. O Nginx registra URI sem query string. Nunca habilitar logs de payload OAuth, mensagem ou token de integração. Os handlers de worker propagam erro sanitizado para retry; verificar estado persistido do compromisso/lembrete e dead jobs no broker sem imprimir payloads completos.

## WhatsApp desconectou

O monitor consulta a ponte interna GET /health?instance=operaon, autenticada, esperando {"connected":true}. Mudança para falha gera evento whatsapp_disconnected; recuperação gera whatsapp_connected. Integrar esse evento ao alerta operacional existente, sem enviar automaticamente mensagens a terceiros neste handoff.

Verificar sessão da instância e rede privada na stack existente. Não publicar porta para depurar. Validar contrato de Idempotency-Key e reply_to em docs/whatsapp.md antes de habilitar envios reais. FAILED/error_log nos lembretes e retry do pg-boss mantêm diagnóstico; revalidar opt-in e horário no reprocessamento. Não mudar FAILED para SENT manualmente nem recriar todos os lembretes para tentar recuperar envio.

## Google revogado ou pendente

Invalid_grant marca google_reauth_required na pessoa. Pedir reconexão pelo botão da agenda em workspace ativo; refresh token fica criptografado em users e calendário em tenant_members. Após consentimento, usar Reprocessar Google nos compromissos pendentes. O sistema escreve apenas na agenda dedicada; não importar eventos ou configurar syncToken. Antes de repetir criação de agenda manualmente, verificar marcador e calendar_id para evitar duplicação externa.

## Backup e restore

deploy/backup.sh usa pg_dump custom, umask 077 e PGPASSFILE montado como secret. deploy/backup.cron.example agenda deploy/backup-run.sh diariamente às 03h America/Sao_Paulo em agendador com CRON_TZ (como cronie), sem instalar cron neste handoff. A imagem deploy/backup.Dockerfile inclui cliente PG16, restic e SSH. Dumps locais não são apagados automaticamente. Um backup só é considerado recuperável após restore testado, não apenas pg_restore --list.

deploy/restore-test.sh recusa banco que não termine em _restore_test e usa pg_restore --clean --if-exists --no-owner --exit-on-error. Preparar banco vazio isolado e roles antes de restaurar, sem apontar para produção. Após restore, conferir workspaces/leads, migrations/checksums e consultas sob role/RLS. Não iniciar workers contra um restore que contenha credenciais reais ou jobs antigos; usar rede isolada e desabilitar integrações. A credencial de backup e dumps são dados privados, nunca artefatos públicos do CI.

As evidências locais de round-trip e pooling desta entrega são registradas em docs/progresso.md. Staging real, restore de dados reais e política externa de retenção continuam sob responsabilidade do Mateus.

## Backup externo D16/D27

A sessão 09 entrega deploy/backup-run.sh e backup-offsite.sh. Configurar PGHOST/PGUSER/PGDATABASE/PGPASSFILE, BACKUP_DIR privado, BACKUP_HOST estável por ambiente, RESTIC_REPOSITORY=sftp:usuario@servidor-domestico:/repositorio-dedicado, RESTIC_PASSWORD_FILE, BACKUP_SSH_KEY e BACKUP_KNOWN_HOSTS. Montar os arquivos como secrets com permissões restritas; conferir fingerprint do servidor por canal confiável. Caminhos SSH devem ser absolutos, sem espaços ou metacaracteres. Inicializar previamente o repositório restic criptografado como operador autorizado. Não copiar chave AES junto do dump; armazená-la em cofre separado.

A cópia usa SFTP sobre SSH com BatchMode e StrictHostKeyChecking. Snapshot recebe tag operaon-db e host de ambiente. Retenção usa forget --keep-daily 7 --keep-weekly 4 --group-by host,tags restrito ao host/tag; os conjuntos podem se sobrepor. Não há prune automático nem exclusão de snapshots alheios. Fazer manutenção de espaço e prune revisado no repositório dedicado. Restic é ferramenta operacional aprovada em D27, sem dependência nova na aplicação. Referência: [backend SFTP oficial](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#sftp).

Para recuperar: restic restore latest --host AMBIENTE --tag operaon-db --target DIRETORIO_PRIVADO. O snapshot contém operaon.dump; em ambiente isolado, aplicar deploy/restore-test.sh nesse arquivo com PGDATABASE terminado em _restore_test e verificar migrations, RLS e contagens. Nunca iniciar worker de restore com integrações reais. Senha do restic e chave AES precisam de cópias seguras independentes; perdê-las impede recuperação. Um lock de backup após queda deve ser inspecionado antes de removê-lo.

Teste reproduzível sem SSH externo: docker build -f deploy/backup.Dockerfile -t operaon-backup:test . e docker run --rm --entrypoint sh -v "$PWD/deploy:/tests:ro" operaon-backup:test /tests/test-backup.sh. Usa restic real, dump fictício e repositório local descartável; verifica restore e interrupção após falha do dump. O restore de Postgres real permanece evidência da sessão 8. Habilitar cron, confirmar envio doméstico e testar recuperação com dados de staging são pendências do Mateus.

## Retry Google D11/D12

Falhas comuns usam atraso persistido de 1min, 5min, 15min, 1h e depois 6h, limitado a 24h desde a primeira falha. Ao vencer a janela, sync_status vira ERROR e agenda oferece Reprocessar Google. Edição/cancelamento/retry manual incrementam geração e reiniciam janela; jobs da geração anterior são ignorados. Invalid_grant ou falta de autorização permanecem PENDING para reconexão conforme D12; reconectar e reprocessar os compromissos. Nenhum polling ou importação do Google foi acrescentado.
