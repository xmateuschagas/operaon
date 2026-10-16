# Regras para agentes (Devin e outros)

## Fonte da verdade
- `docs/rfc-002.md` e `docs/regras-de-negocio.md`. Em caso de conflito, pare e pergunte.
- Protótipo de referência visual: `docs/prototipo.md`.

## Forma de trabalhar
- Sempre planejar antes de codar. Nunca implementar sem plano aprovado.
- Uma sessão = um PR. Nunca fazer merge do próprio PR.
- Não incluir nada fora do escopo da sessão. Ideias extras vão para a seção "Sugestões" do PR.
- Se algo estiver ambíguo, perguntar em vez de decidir sozinho.

## Código
- TypeScript em modo strict em todo o projeto.
- Todo código comentado, explicando o que cada trecho faz (inclusive SQL e migrations).
- Validação de entrada com Zod na borda da API.
- Migrations sempre reversíveis. Nunca editar migration já mergeada.
- Nenhuma dependência nova sem justificativa escrita no PR.
- Testes (Vitest) para toda regra de negócio citada na sessão.
- Datas no banco sempre em UTC. Exibição e definição de "hoje" no fuso do workspace, com padrão America/Sao_Paulo.

## Arquitetura do MVP (D29 a D35)
- Fila com pg-boss no Postgres atrás de JobQueue. BullMQ fica como troca futura sem mudar regras de negócio.
- Sessões na tabela sessions com cookie HttpOnly opaco, workspace ativo e índice por user_id. Tokens de aprovação e convites no Postgres, somente com hash, TTL e uso único.
- API sem estado entre requisições, preparada para várias réplicas. Não usar Redis nem REDIS_URL no MVP.
- users é global, sem tenant_id; e-mail único e platform_status ACTIVE/BLOCKED. Papéis e aprovação pertencem a tenant_members.
- ADMIN_EMAIL identifica o admin da plataforma, que aprova novos workspaces. OWNER/ADMIN aprovam e convidam membros do próprio workspace.
- Toda transação de dados de workspace usa SET LOCAL app.tenant_id e RLS, inclusive em workers e webhooks. Validar o vínculo ativo antes de selecionar o workspace.
- Índices compostos de dados de workspace começam por tenant_id. Webhooks idempotentes, limite de requisições por workspace e logs estruturados com tenant_id e user_id.
- Healthcheck e readiness separados; PgBouncer previsto na sessão 8.
- Google no MVP: somente OperaON -> Google. Polling, syncToken e RN-14 ficam para v2.
- Refresh token Google em users, criptografado com AES-256-GCM; google_calendar_id em tenant_members. Criar `OperaON · <nome do workspace>` no primeiro acesso ao vínculo autorizado.
- Bloqueio de membro limpa o workspace ativo nas sessões afetadas e volta ao seletor. Bloqueio na plataforma derruba todas as sessões por user_id. Auditar ambos.
- Visibilidade padrão proprios: MEMBER vê e edita seus leads, OWNER/ADMIN todos do workspace. Em compartilhado, todos os membros ACTIVE veem e editam todos. Só OWNER/ADMIN podem trocar responsável em qualquer modo.

## Segurança
- Nunca commitar segredo. Usar apenas `.env` local e `.env.example` sem valores reais.
- Nunca acessar produção. Trabalhar só em dev e staging.
- Refresh token do Google sempre criptografado (AES-256-GCM).
- Postgres, PgBouncer e API do WhatsApp nunca expostos publicamente.

## Texto
- Interface em português do Brasil.
- Não usar travessão (traço longo) em nenhum texto da interface ou documentação.
