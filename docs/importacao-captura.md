# CSV e formulário

## CSV

Somente OWNER/ADMIN importam. Enviar JSON com a propriedade csv para POST /imports/preview e depois POST /imports. A importação sempre analisa o arquivo novamente; a prévia não autoriza dados enviados pelo cliente.

- Cabeçalhos obrigatórios: nome e telefone (ou telefone_e164). Telefone inclui DDI; pontuação é removida.
- Opcionais: empresa, email, origem, necessidade (ou necessidade_resumo), responsavel_email e opt_in.
- Origem vazia: Importação CSV. Necessidade vazia: Não informada. Responsável vazio: padrão do workspace ou fallback RN-15. Responsável explícito precisa estar ativo no mesmo workspace e na plataforma.
- Separador vírgula ou ponto e vírgula; suporta BOM, aspas escapadas e texto com quebra de linha entre aspas.
- Até 5000 registros e 1000000 caracteres. Prévia e relatório indicam posição do registro a partir da linha 2; em registros multilinha, é posição lógica, não linha física do arquivo.
- Registros válidos são importados. Duplicados e inválidos são relatados. Reimportar não altera leads existentes. opt_in ausente/vazio é false; sim/true/1 autorizam, não/nao/false/0 negam, outros valores invalidam a linha. Duplicidade nunca altera consentimento existente.

## Formulário

OWNER/ADMIN criam uma integração em POST /integrations/form. A resposta apresenta o token uma única vez e a URL específica do workspace. Guardar o token no backend do site, nunca no HTML público. Somente o hash é salvo no OperaON.

Enviar POST para a URL retornada com Authorization: Bearer TOKEN e X-Event-Id estável por evento. Corpo: nome e telefone_e164; necessidade_resumo ausente/vazia recebe Não informada; opcionais empresa, email, product_id, utm_source, utm_campaign e whatsapp_opt_in. Não enviar tenant_id, etapa, origem ou responsável.

O lead entra NOVO, origem Formulário do site, próximo passo Primeiro contato em +1h e responsável RN-15. O workspace é resolvido pelo id/token da integração. Reentregas do mesmo evento retornam o mesmo id sem recriar lead. Não reutilizar id de evento para conteúdo diferente.

LEAD_FORM_TOKEN é reservado ao bootstrap de uma integração por administrador da plataforma que também seja gestor local, por POST /integrations/form com useConfiguredToken=true. Gestores comuns recebem tokens próprios aleatórios e nunca recebem o segredo global configurado. Nenhum token é registrado em logs.

D17: evento novo com telefone já cadastrado retorna HTTP 200 com id existente e não altera nome, responsável, histórico ou opt-in. A primeira criação retorna 201; reentrega do mesmo X-Event-Id preserva status e corpo originais.
