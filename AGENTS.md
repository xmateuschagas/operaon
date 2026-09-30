# Regras para agentes (Devin e outros)

## Fonte da verdade
- `docs/rfc-002.md` e `docs/regras-de-negocio.md`. Em caso de conflito, pare e pergunte.
- Protótipo de referência visual: `docs/prototipo.md`.

## Forma de trabalhar
- Sempre planejar antes de codar. Nunca implementar sem plano aprovado.
- Uma sessão = um PR. Nunca fazer merge do próprio PR.
- Não incluir nada fora do escopo da sessão. Ideias extras vão para a seção "Sugestões" do PR.
- Se algo estiver ambíguo, perguntar em vez de decidir sozinho.

## Código
- TypeScript em modo strict em todo o projeto.
- Todo código comentado, explicando o que cada trecho faz (inclusive SQL e migrations).
- Validação de entrada com Zod na borda da API.
- Migrations sempre reversíveis. Nunca editar migration já mergeada.
- Nenhuma dependência nova sem justificativa escrita no PR.
- Testes (Vitest) para toda regra de negócio citada na sessão.
- Datas no banco sempre em UTC. Exibição em America/Sao_Paulo.

## Segurança
- Nunca commitar segredo. Usar apenas `.env` local e `.env.example` sem valores reais.
- Nunca acessar produção. Trabalhar só em dev e staging.
- Refresh token do Google sempre criptografado (AES-256-GCM).
- Postgres, Redis e API do WhatsApp nunca expostos publicamente.

## Texto
- Interface em português do Brasil.
- Não usar travessão (traço longo) em nenhum texto da interface ou documentação.
