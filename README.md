# OperaON

CRM web da MicrotecON Sistemas Inteligentes.

## Como esta pasta funciona

| Pasta/arquivo | Para que serve |
|---|---|
| `AGENTS.md` | Regras fixas que o Devin segue em toda sessão |
| `docs/rfc-002.md` | Arquitetura, decisões, modelo de dados, fluxos e variáveis |
| `docs/regras-de-negocio.md` | RN-01 a RN-12 (fonte da verdade do comportamento) |
| `docs/prototipo.md` | Link do protótipo navegável |
| `docs/decisoes.md` | Log de decisões aprovadas (atualizado pelo Cowork) |
| `docs/prompts/` | Prompts prontos: Sessão 0 a 8 do Devin e o do Cowork |
| `docs/plans/` | Onde ficam salvos os planos que o Devin gerar |

## Ciclo de cada sessão

1. Colar o prompt da sessão no Devin (modo plano).
2. Salvar o plano gerado em `docs/plans/NN-nome.md`.
3. Pedir ao Cowork para auditar o plano.
4. Ajustar o que for preciso e aprovar ("Implementar").
5. Revisar o PR, testar em staging e fazer merge.
