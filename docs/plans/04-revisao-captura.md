# Sessão 4: revisão, nutrição e captura

Plano autoauditado no handoff. Branch criada da dev com dependência local explícita da sessão 3. Integração na dev só após CI verde e PRs anteriores.

1. Consulta de revisão conforme RN-03, incluindo nunca contatados, sete dias completos, nutrição vazia/vencida, visibilidade e RLS. Ações reativar (novo próximo passo), nutrir 15/30 dias e encerrar por atualização PERDIDO com motivo já validada na sessão 3.
2. Integrações de formulário por workspace com identificador público opaco e token secreto cujo hash fica no Postgres. OWNER/ADMIN geram integração; resolução restrita determina o tenant antes da transação RLS, sem confiar em tenant do payload. LEAD_FORM_TOKEN pode ser fornecido pela configuração para criar a integração, nunca define tenant sozinho.
3. Webhook exige identificador de evento, valida payload com Zod, persiste recibo idempotente por integração/workspace e cria lead NOVO, origem Formulário do site, responsável RN-15 e próximo passo em +1h. Reentregas concorrentes retornam o mesmo resultado sem duplicar efeitos.
4. CSV com parser RFC 4180, BOM e separador vírgula/ponto e vírgula; cabeçalhos documentados. Prévia sem efeitos e importação com relatório por linha, duplicados/erros e responsáveis locais ativos. Revalidar na importação, sem confiar na prévia. Colunas vazias recebem os defaults de RN-07.
5. RN-15 seleciona responsável padrão elegível ou OWNER/ADMIN elegível mais antigo pelo vínculo; sem responsável, 503 e recusa clara. Datas são UTC e limites da revisão são instantes do servidor; apresentação usa fuso do workspace.

## Autoauditoria

- Cobertura do prompt 04 completa. Testes com relógio fixo para RN-03/04/07/15/19/22/23 e RN-06 na captura. Verificar token inválido, evento concorrente, dois tenants com mesmo telefone, bloqueio global/local, CSV com aspas e duplicatas internas.
- Decisão provisória: CSV e gestão de integração são de OWNER/ADMIN, por atribuírem responsáveis. Reativar não inventa contato: só atualiza próximo passo e limpa nutrição; inatividade continua seguindo RN-03 até ocorrer uma interação real. Importação registra linhas válidas e relata ignoradas, sem usar valores de prévia confiados ao cliente.
- Dependência proposta: csv-parse para suportar aspas, BOM, linhas múltiplas e escaping sem parser artesanal. Justificar no PR. Nenhuma tela final ou integração real será acessada.
- Migrations novas e reversíveis para integrações e recibos, RLS e índices compostos iniciados por tenant_id. Não editar migrations existentes.
- Resultado: APROVAR implementação.

## Autoauditoria da entrega

- Revisão/nutrição/reativação, CSV com prévia/relatório e captura com recibo transacional implementados. Responsável padrão/fallback considera vínculos e pessoa ativos, com lock durante gravação. Integração e workspace são revalidados sob lock dentro da transação RLS.
- Cinco testes novos passaram; total 29. Cobrem RN-03/04/07/15/19/22/23 e deduplicação RN-06. Reentrega concorrente devolveu o mesmo id e criou um único lead. Mesmo telefone em dois workspaces permaneceu isolado.
- Lint e typecheck passaram. Build em verificação final. Migration 003 reversível foi testada por rollback/up antes da suíte final; migrations anteriores não foram alteradas.
- Dependência nova csv-parse@6 justificada por aspas, BOM e separadores com limite de memória explícito; referência oficial: https://csv.js.org/parse/api/sync/.
- Contrato operacional e limites documentados em docs/importacao-captura.md. Nenhum token global é disponibilizado a gestor comum; token próprio só aparece na criação da integração.
- Resultado: APROVAR implementação; PR permanece dependente dos anteriores e de CI verde.
