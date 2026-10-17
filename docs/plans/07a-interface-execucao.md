# Sessão 7a: identidade e execução diária

1. Compor shell responsivo com navegação, identidade OperaON, workspace ativo e seletor. Seguir imagens de Fila/Funil/Login e tokens de docs/prototipo.md; manter botões reais, labels, foco visível e alvos de 44px.
2. Fila com contadores, filtros atrasados/hoje/próximos, busca, cards com próximo passo e ações. Funil por etapas, valor e detalhe. Cadastro/edição e registro de interação com RN-01/05 explícitas na tela e validação final no servidor.
3. Histórico imutável em detalhe; atribuição somente a gestores. Templates e link manual WhatsApp, sem confundir com opt-in automático. Dados consultados de APIs reais, sem inserir dados fictícios no produto.
4. Escopar cache por workspace, cancelar e limpar consultas na troca/logout/bloqueio. Revalidar sessão periodicamente e tratar perda de vínculo voltando ao seletor. Não renderizar dados anteriores durante troca.
5. Testes Vitest de RN-17/18/19/21/22 na UI por funções de navegação/cache/permissões e renderização de formulários; APIs já têm testes reais. Verificação no navegador com fixtures locais, desktop/celular, sem acessar Google real.

## Autoauditoria

- Revisão, agenda, importação e administração visual ficam para 7b, sem omitir os fluxos de identidade já funcionais da sessão 2.
- Reutilizar React Query/Router e schemas existentes. Datas no fuso do workspace, conversão explícita de campos datetime-local para UTC. Ambiguidade de horário de verão deve ser detectada, sem assumir fuso do computador.
- Incluir estados carregando/vazio/erro e feedback de submissão. Sem dependência de credenciais externas ou migração nova. Resultado: APROVAR plano, implementar após sessão 6.

## Auditoria da entrega

- Navegador local com OAuth simulado: login, seleção de workspace, registro de contato e troca para segundo workspace vazio passaram. Fila inspecionada em desktop e viewport 390x844, com cards e botões empilhados.
- Identificado e corrigido durante QA: não remover o observador global de sessão na troca, apenas os caches locais; atualizar sessão no mesmo observador após seleção. Consultas em voo continuam canceladas e removidas antes do POST.
- Cinco testes de UI adicionais cobrem cancelamento de cache real, perda de vínculo, permissões de responsável, validação visível e conversão de fuso incluindo horário de verão inexistente/ambíguo.
- Dependências novas justificadas: @fontsource/sora e @fontsource/ibm-plex-sans servem as fontes do protótipo no próprio bundle, sem CDN ou acesso externo do navegador. Não alteram regras de negócio.
