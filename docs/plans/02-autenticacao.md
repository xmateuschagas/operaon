# Sessão 2: identidade e workspaces

Plano autoauditado conforme handoff. A branch sessao-02 foi criada da dev e incorpora a fundação local validada da sessão 1 como dependência explícita. O CI externo falhou antes de executar em três tentativas; implementação/testes continuam localmente, mas integração na dev permanece condicionada a CI verde e à integração anterior do PR #4.

## Entrega

1. Adaptador OAuth Google real por HTTP (openid/email/profile, PKCE, state de uso único e e-mail verificado), com provider simulado injetado somente nos testes. Não criar rota de login fictício no runtime. Consentimento Calendar incremental preserva refresh token existente se a resposta não trouxer novo.
2. Criptografia AES-256-GCM com nonce aleatório e auth tag, validação de chave de 32 bytes. Tokens opacos aleatórios, somente SHA-256 no banco. Redação de logs inclui cookies, cabeçalhos de autorização e query strings OAuth/convite.
3. Sessões Postgres compartilhadas, cookie HttpOnly/SameSite=Lax, Secure em HTTPS. Login rotaciona sessão; logout e expiração revogam acesso. Origem de requisições mutáveis deve coincidir com APP_URL para evitar CSRF. Cookie OAuth temporário vincula o callback ao navegador.
4. Repositório de identidade com operações restritas para upsert de identidade Google, leitura de sessão, descoberta dos próprios vínculos e criação pendente de workspace. Funções SQL SECURITY DEFINER com search_path fixo e EXECUTE revogado de PUBLIC para atravessar apenas os fluxos globais necessários. Runtime não recebe SELECT livre entre tenants.
5. Solicitação de workspace cria tenants e OWNER PENDING atomicamente, aprovação exclusiva do admin identificado por ADMIN_EMAIL ativa ambos e registra auditoria. OWNER/ADMIN do workspace aprovado listam, aprovam e convidam membros. Convite aceito apenas pelo mesmo e-mail Google verificado; vínculo BLOCKED não é reativado por aceite.
6. Tokens de aprovação com 24h e convites com 7 dias (decisão provisória abaixo), consumo transacional condicional e verificação de autorização no ato. Links não alteram estado por GET. Notifier é interface com LogNotifier que omite links e tokens; painel permite aprovar sem o link.
7. Sessão guarda workspace ativo; seletor/onboarding básico, endpoints de perfil, workspaces, membros e convites. Ativação revalida status da plataforma, workspace e vínculo a cada operação; permissões locais nunca são derivadas de ADMIN_EMAIL.
8. Bloqueio local limpa só active_tenant_id de sessões desse vínculo; global remove todas as sessões e impede novo login. Ambos auditados. Configurações locais com validação Zod de visibilidade e fuso IANA, padrão proprios e America/Sao_Paulo.
9. Criar UI funcional básica de login/onboarding/seletor/acessos para aceite da sessão. Estilo final, responsividade e telas completas ficam nas sessões 7a/7b. Criação real de agendas permanece fora do escopo, na sessão 5.

## Testes e aceite

- Vitest e Fastify inject contra Postgres real: RN-17 (novo usuário, solicitação/aprovação, papéis), RN-18 (dois workspaces e bloqueios nos dois níveis), RN-21 (TTL, uso único, corridas, e-mail divergente, convite a bloqueado), RN-22 (contexto por transação, acesso cruzado e sessão sem workspace).
- OAuth simulado: state incorreto/expirado/reusado, PKCE, e-mail não verificado, refresh token não sobrescrito sem nova autorização e ausência de tokens em respostas/logs.
- AES-GCM: roundtrip, nonce distinto para mesmo texto, tag alterada rejeitada e chave inválida rejeitada.
- Rotas mutáveis recusam origem externa; cookie opaco não revela user_id/tenant_id. Platform_status e vínculo revalidados, sem cache de aprovação por réplica.
- Lint, typecheck, testes e build verdes; PR contra dev; nenhum deploy ou integração real obrigatória para CI.

## Autoauditoria

- Todos os oito itens do prompt 02 e D29/D31/D33/D34 contemplados. RN-19 entra como contrato de papéis, regras de leads implementadas na sessão 3. Sessão 5 cria agenda por vínculo; não adiantar integração neste PR.
- Única lacuna numérica do RFC: TTL do convite. Opção simples e revisável: 7 dias; sessão de 7 dias e estado OAuth de 10 minutos. Registrar em docs/decisoes.md antes de implementar, como Decisão provisória do agente (revisar).
- Regras de proprietário final: impedir autobloqueio do último OWNER ACTIVE para evitar workspace inacessível; registrar decisão provisória antes de codar. Não criar transferência de propriedade fora do escopo.
- Dependências adicionais só se justificadas: preferir crypto e fetch nativos; cookie pode usar plugin oficial Fastify para parsing/atributos consistentes. Testes não exigem credenciais reais.
- Resultado: APROVAR o plano; execução aguarda apenas a dependência técnica da sessão 1 e CI do repositório, sem pedir aprovação de produto entre etapas.

## Autoauditoria da entrega

- OAuth por adaptador HTTP real com state/cookie, PKCE e verificação de e-mail. Testes usam provider injetado e a fixture visual é local, ignorada pelo Git. Nenhuma rota de login fictício incluída na aplicação.
- Operações globais de identidade/onboarding isoladas em funções SECURITY DEFINER com search_path fixo e EXECUTE revogado de PUBLIC. Todas as requisições operam com role operaon_app; dados de workspace passam por contexto transacional e validação de vínculo.
- Tokens de convite e aprovação com hash/TTL e consumo único; concorrência de aceite testada. Sessões opacas expiram e são rotacionadas no callback, com logout e bloqueios auditados. Proteção de origem nos métodos mutáveis; callback protegido por state e cookie.
- Interface básica verificada no navegador local com fixture: entrada, login simulado pelo adaptador de teste, lista de vínculos, seleção de workspace e painel de acessos. Textos em português, controles rotulados e altura mínima 44px. Visual final continua em 7a/7b.
- Verificação final: suíte de 17 testes passou, cobrindo RN-17/18/21/22, OAuth e criptografia; lint, typecheck e build passaram após os ajustes finais de labels/logs.
- Novas dependências: nenhuma. crypto/fetch nativos e componentes já instalados foram suficientes. Campo google_calendar_authorized e prazos estão registrados como decisões provisórias.
- Referências técnicas oficiais consultadas: https://developers.google.com/identity/protocols/oauth2/web-server e https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert (escopo calendar.app.created).
- Resultado da autoauditoria: APROVAR implementação. Merge continua condicionado à integração anterior do PR #4 e CI hospedado verde; não confundir suíte local com o gate externo.
