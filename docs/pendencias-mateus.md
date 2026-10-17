# Pendências do Mateus

Integrações reais serão configuradas somente em dev/staging. Nenhum segredo deve ser commitado. Não executar deploy na VPS durante o handoff.

- Google: criar credenciais OAuth de desenvolvimento/staging, configurar redirect URI e consentimento de Calendar. A implementação usará adaptador real com testes simulados, sem exigir credenciais reais para CI.
- WhatsApp: informar contrato e credenciais da stack existente, instância operaon e número central em variáveis locais ou secrets. Testes não enviarão mensagens reais.
- Infraestrutura: disponibilizar secrets, domínio e redes na operação posterior. Sessão 8 entrega os artefatos e runbook; o deploy permanece manual pelo Mateus.
