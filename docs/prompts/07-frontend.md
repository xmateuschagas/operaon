Primeiro apresente o plano e aguarde aprovação antes de implementar

Leia AGENTS.md, docs/rfc-002.md e docs/regras-de-negocio.md antes de começar. Esta é uma sessão de PLANEJAMENTO: entregue o plano e aguarde minha aprovação antes de escrever qualquer código.

Sessão 7: interface completa.

Leia também docs/prototipo.md e siga a referência visual, adaptando os fluxos às decisões D30 a D35 do RFC. As imagens anteriores não substituem as regras atuais de workspace e sincronização.

Escopo:
1. Login, solicitação de workspace, aceite de convite, aprovação pendente e seletor de workspace. Bloqueio local retorna ao seletor; global encerra a sessão.
2. Fila do dia (desktop e celular), modal de registrar contato com RN-01 e RN-05 na tela.
3. Funil, revisão, agenda, cadastro e import de leads no workspace ativo. Acessos e convites para OWNER/ADMIN; aprovação de workspaces e bloqueio global só para admin da plataforma. Configurações de visibilidade e fuso por workspace, com autorização local.
4. Estados de vazio, carregando, erro e sem permissão em todas as telas.
5. Acessibilidade: botões reais, labels, contraste e alvos de toque de 44px.
6. Mostrar visibilidade conforme RN-19 e permitir troca de responsável só a OWNER/ADMIN. Datas no fuso do workspace. Agenda informa envio OperaON -> Google e estado de sincronização por vínculo, sem prometer importação de alterações do Google.

Critérios de aceite:
- Fluxo completo navegável em staging, no celular e no desktop.
- Nenhum texto com travessão.
- Nenhuma tela sem estado de erro.
- Vitest para os fluxos de RN-17 a RN-22 citados nesta sessão: seletor, bloqueios, permissões, convite, agenda por vínculo e fuso. Validar navegação com pessoa em dois workspaces e sem vazamento de dados ao trocar o workspace, inclusive cache.

Entregável após aprovação: um PR com descrição das decisões, comandos de verificação e seção "Sugestões" para ideias fora do escopo. Pare e pergunte se algo estiver ambíguo. Nunca faça merge.
