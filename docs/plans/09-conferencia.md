# Sessão 09: conferência D1 a D28

## Fonte e escopo

Recuperar as decisões de origin/devin/1790742016-plano-mestre-decisoes (PR #2 fechado), comparar individualmente com a dev e publicar docs/conferencia-d1-d28.md. D29 a D35 prevalecem sobre decisões antigas. Não integrar código na main, acessar produção ou executar deploy. Preservar graft/ não rastreado.

## Plano

1. Restaurar o histórico D1 a D28 em docs/decisoes.md, identificando substituições aprovadas.
2. D8/D21: atraso antes do instante atual, hoje até a próxima meia-noite local, próximos sete dias locais; filtro inicial da fila diária soma atrasados e hoje. Cobrir fronteiras de instante, dia e fuso.
3. D2/D5/D6/D17/D18: necessidade ausente/vazia recebe default no formulário, CSV aceita opt_in explícito validado e nunca atualiza duplicado, formulário retorna 200/id existente inclusive corrida. Aviso de lead sem opt-in no formulário de compromisso.
4. D4/D7/D20: ignorar e registrar respostas sem correspondência, de perdidos/excluídos ou compromissos passados; manter correlação segura reply_to e autenticação por integração. Oferecer WHATSAPP_WEBHOOK_TOKEN como segredo adicional opcional sem substituir token local; documentar header e secrets.
5. D11/D12: retry Google persistido com 1min, 5min, 15min, 1h e 6h; após 24h ERROR visível na agenda. Revogação mantém PENDING aguardando autorização. Invalidar retries antigos ao editar/cancelar/reprocessar. Outbox agenda horário sem depender de backoff do broker.
6. D14/D26: antes de consumir jobs, descobrir workspaces por função restrita ao worker, cancelar PENDING vencidos com motivo exato e recuperar futuros; confirmação imediata vencida só permanece quando compromisso futuro. Reconciliar jobs via JobQueue, com RLS, locks e geração contra envio antigo.
7. D22: migration nova e reversível para trigger de imutabilidade do histórico; manter permissões atuais. Testar UPDATE/DELETE também como proprietário, sem alterar migrations integradas.
8. D15/D16/D27: coleções HTTP das sessões 3 a 6; artefatos de backup restic via SSH com retenção 7 diários/4 semanais, imagem e instruções de restore isolado. Testar contratos em ambiente local sem envio externo nem instalação de cron.
9. Testes reais de banco para regras alteradas, lint, typecheck, build e CI; relatório antes/depois com evidências por decisão. PR para dev com comandos, desvios e Sugestões; atualizar progresso. Sem merge na main.

## Autoauditoria do plano

- RN-01 a RN-23: preservar constraints/visibilidade, autenticação de workspace e RLS; novos testes concentram RN-06/07/08/09/10/11/12/22/23 e decisões recuperadas.
- D1/D13 adaptadas por D29/D31/D34; não restaurar Redis nem conceder papel local pelo ADMIN_EMAIL.
- D7 mantém telefone e workspace autorizados, com reply_to explícito em vez de adivinhar compromisso; bloquear resposta a passado/perdido/excluído. D19 adiada por D30, sem polling de entrada.
- D11 não pode marcar revogação como erro terminal enquanto D12 exige PENDING. Retry manual e nova versão do compromisso reiniciam a janela; jobs antigos não alteram a versão nova.
- D16 entrega automação pronta e validada localmente; habilitar SSH real/cron é pendência de operação, não autorização para deploy.
- D27 aprova dependências, não exige instalar Testing Library sem necessidade; justificar restic como ferramenta operacional sem dependência de aplicação.
- Fora do escopo: novos produtos, produção, remodelagem de identidade e mudanças em main. Plano autoauditado no modo autônomo autorizado.

## Autoauditoria da implementação

- Relatório cobre as 28 decisões individualmente, comparando com a base 6018dad e preservando as substituições aprovadas.
- D8 testa o instante exato, vencimento no mesmo dia, meia-noite local e fim dos sete dias em dois fusos; teste de tela confirma filtro inicial diário.
- D20 testa ausência/erro/acerto dos dois controles e não usa segredo global para autorizar workspace. Arquivos de secret são carregados antes do serviço.
- D22 é migration 008 nova, com down; testes tentam UPDATE/DELETE como proprietário e runtime. As migrations anteriores não foram modificadas.
- D26 executa recuperação antes dos consumidores e não recria linhas de lembretes. Geração e estado invalidam jobs antigos; função global de descoberta é negada à API.
- D11 tem relógio explícito em teste e outbox com startAfter persistido. Erro externo tratado não consome retry genérico; falha de infraestrutura continua propagando. Reautorização permanece PENDING e retry manual invalida geração antiga.
- D16 testado com restic real, retenção isolada e falha do dump; sem SSH externo. Scripts mantêm permissões privadas, host verificado e não instalam cron. Nova ferramenta restic fica somente na imagem de backup, justificada por D16/D27.
- Desvios: nenhuma dependência nova de aplicação; D27 Testing Library mantida como autorização, com testes React/React Query existentes. Demais diferenças estão explicitadas no relatório e nas decisões provisórias.
