# Sessão 6: WhatsApp e lembretes

1. Planejar três lembretes por compromisso com UNIQUE existente. Confirmação imediata, 24h e 1h antes; criação omite horários vencidos, remarcação conserva IDs e cancela linhas vencidas. Outbox agenda/cancela jobs pelo contrato JobQueue, registrando o identificador retornado pelo adaptador.
2. Worker revalida compromisso, geração/horário, opt-in e exclusão/perda sob locks antes do envio. Adaptador WhatsApp exige chave idempotente persistente por envio para cobrir crash depois da resposta externa; sem suporte do provedor a garantia exige ponte idempotente, registrada como pendência externa. Rate limit compartilhado por workspace e retry com backoff, erro sanitizado persistido.
3. Webhook autenticado por integração própria WHATSAPP, com recibo único e contexto RLS. Correlacionar por ID da mensagem enviada e telefone dentro do workspace autorizado. SAIR desativa opt-in; 1 confirma; 2 marca REMARCAR e atualiza próximo passo de lead aberto; GANHO permanece e gera aviso ao responsável via Notifier.
4. WhatsAppNotifier substitui configuração LogNotifier. Aprovações de plataforma usam ADMIN_WHATSAPP; convites/avisos locais exigem mapeamento explícito de destinatário, sem usar número do administrador como fallback para dados de outro workspace. Sem configuração real, usar adaptador indisponível e painel de aprovação; não inventar entrega nem enviar mensagens reais.
5. Testar RN-08/09/10/22/23, reentrega concorrente, mesmo telefone em dois workspaces, job antigo, envio com retry e reinício, cancelamento e aviso de GANHO. Documentar contrato da ponte e configuração pendente.

## Autoauditoria

- Inclui cancelamento nos caminhos RN-16 já existentes; todos chamam reconciliação de jobs via outbox após alteração local.
- Locks seguem lead, compromisso, lembrete para não inverter a ordem das rotas e webhook. Rede com timeout, erros sem tokens ou payloads em logs.
- Não inclui conexão real ou deploy da stack existente. A especificação da API não está no repositório: usar contrato normalizado com idempotência obrigatória, adaptador configurável e mocks; registrar decisão provisória.
- Mudanças de banco somente em migration 005 reversível. Nenhuma dependência nova prevista. Resultado: APROVAR implementação com dependência explícita da sessão 5; PR #8 integrado após CI verde antes do fechamento desta entrega.

## Auditoria da entrega

- Sete testes novos exercitam unicidade/linhas preservadas, cancelamento de jobs opacos, geração antiga, opt-in no envio, retry com chave estável, contador compartilhado, confirmação/remarcação/GANHO, reentrega concorrente e isolamento com telefone repetido.
- Testes usam Postgres real e adaptador WhatsApp simulado. Primeiro teste de confirmação detectou inferência ambígua do enum no SQL; cast explícito corrigido e caso passou na nova execução.
- Notifier configurado no runtime, com destinatários locais explícitos. Indisponibilidade não grava tokens em banco/logs; painel e link copiável continuam disponíveis. Contrato e pendências em docs/whatsapp.md e docs/pendencias-mateus.md.
- Sem dependências novas; migration 005 reversível. RN-16 chama reconciliação transacional dos lembretes nos caminhos existentes. Resultado: APROVAR entrega após verificação completa e CI.
