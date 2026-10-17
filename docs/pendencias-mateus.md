# Pendências do Mateus

Integrações reais serão configuradas somente em dev/staging. Nenhum segredo deve ser commitado. Não executar deploy na VPS durante o handoff.

- Google: criar credenciais OAuth de desenvolvimento/staging, configurar redirect URI e consentimento de Calendar. A implementação usará adaptador real com testes simulados, sem exigir credenciais reais para CI.
- Configurar APP_URL com a origem pública do frontend e GOOGLE_REDIRECT_URI como APP_URL/api/auth/google/callback. O proxy deve preservar /api -> API. Login pede openid/email/profile; consentimento incremental pede calendar.app.created. Habilitar Calendar API e revisar tela de consentimento em staging. TOKEN_ENC_KEY deve ter 32 bytes aleatórios em base64 e SESSION_SECRET pelo menos 32 caracteres aleatórios, somente em secrets/.env local.
- WhatsApp: informar contrato e credenciais da stack existente, instância operaon e número central em variáveis locais ou secrets. Testes não enviarão mensagens reais.
- Infraestrutura: disponibilizar secrets, domínio e redes na operação posterior. Sessão 8 entrega os artefatos e runbook; o deploy permanece manual pelo Mateus.
- GitHub Actions: PR #4 / run 38985366166 falhou antes de executar passos em três tentativas. Verificar as duas anotações do job e eventual restrição de conta/runner. O conector expõe status mas não as anotações; navegador disponível sem login. Não houve merge da sessão 1 na dev. Verificações locais não substituem CI verde para merge.
