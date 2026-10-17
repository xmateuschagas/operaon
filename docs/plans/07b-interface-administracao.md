# Sessão 7b: revisão, agenda e administração

1. Completar navegação com revisão semanal, nutrição 15/30 dias e reativação com próximo passo obrigatório.
2. Agenda por dia no fuso do workspace, criar/editar/cancelar compromisso com lead obrigatório. Mostrar confirmação/remarcação e sync pendente, retry, autorização Google por vínculo e envio apenas OperaON -> Google.
3. Importação de arquivo CSV UTF-8 com prévia e relatório por linha; configuração de integrações e exibição única do token. Gestores administram templates, visibilidade, nome e fuso; membros consultam sua configuração sem controles indevidos.
4. Finalizar acessos/convites, aprovações da plataforma e bloqueio global exclusivo do admin da plataforma. Mensagens de carregamento/vazio/erro/sem permissão e confirmações de ações destrutivas.
5. QA desktop/celular com fixtures locais e testes Vitest das permissões, agenda por vínculo, separação de cache e convite. Não contatar Google/WhatsApp real nem deploy/staging indisponível.

## Autoauditoria

- Reutilizar APIs e regras das sessões anteriores. Templates não aceitam placeholders arbitrários, atribuição segue RN-19; datas e filtros seguem RN-22. Convite/aceite continuam no fluxo seguro existente, com segredo removido da URL.
- Registro de validação de staging fica em pendências por falta de ambiente/credenciais; não apresentar testes locais como staging. Sem dependência nova prevista.
- Lacuna encontrada antes do painel: bloqueio global tinha mutação, mas faltava um diretório mínimo de pessoas. Adicionar migration 006 reversível com função restrita a ADMIN_EMAIL, retornando somente id/nome/e-mail/status global. Não concede leitura de users nem tokens à role da API. Agenda também retorna estados mínimos dos lembretes para não inventar situação visual.
- Não incluir métricas comerciais extras nem cadências. Resultado: APROVAR plano após sessão 7a; seguir com dependência explícita se CI estiver executando, sem integrar fora de ordem.

## Auditoria da entrega

- 52 testes aprovados, lint/typecheck/build aprovados. Diretório global testado com negação ao gestor local e ausência de tokens na resposta. UI testa permissões de configurações/importação e lead obrigatório na agenda.
- QA local com OAuth fictício: criação de compromisso 10h em America/Sao_Paulo, três lembretes pendentes, prévia CSV com linha inválida e importação somente da válida. Agenda inspecionada em desktop e 390x844; evidências ignoradas pelo Git em .local/qa-agenda-desktop.png e .local/qa-agenda-mobile.png.
- Migration 006 reversível, sem editar migrations anteriores e sem dependência nova. Mudanças mínimas na API suprem dados necessários às telas. Staging/integrações reais permanecem pendentes, sem deploy nem envio real de mensagens.
