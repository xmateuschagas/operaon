# Regras para agentes (Devin e outros)

## Fonte da verdade
- `docs/rfc-002.md`, `docs/regras-de-negocio.md` e `docs/decisoes.md` são a fonte da verdade. Em modo autônomo, ambiguidades são resolvidas pela opção mais simples e coerente com o RFC, registrada como "Decisão provisória do agente (revisar)".
- Protótipo de referência visual: `docs/prototipo.md`.

## Forma de trabalhar
- Sempre planejar antes de codar. Em modo autônomo, escrever plano e autoauditoria em docs/plans/ antes de implementar; autoauditoria substitui a aprovação entre etapas.
- Em modo autônomo, cada sessão é um PR para a branch dev; o agente pode fazer merge na dev após CI verde e autoauditoria. A main só recebe merge do Mateus.
- Exceção autorizada pelo Mateus em 2026-10-16: se o CI voltar a falhar pela cobrança da conta, aceitar lint, typecheck e testes locais com a saída dos comandos colada no PR. Falhas de implementação continuam exigindo correção. Workflow usa ubuntu-24.04.
- Não incluir nada fora do escopo da sessão. Ideias extras vão para a seção "Sugestões" do PR.
- Fora do modo autônomo, se algo estiver ambíguo, perguntar em vez de decidir sozinho.
- Retomar por docs/progresso.md. Dependências externas usam mocks/adaptadores e configuração real vai para docs/pendencias-mateus.md. Nunca acessar produção nem executar deploy na VPS. Não apagar branches, histórico ou PRs de outros autores.

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
