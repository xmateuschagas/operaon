#!/usr/bin/env bash
# Somente workflow habilitado pelo Mateus; nunca executado pelos agentes neste handoff.
set -euo pipefail
[[ ${DEPLOY_ENABLED:-false} == true ]] || { echo 'Entrega desabilitada'; exit 1; }
case ${DEPLOY_ENV:-} in staging|production) ;; *) echo 'Ambiente inválido'; exit 1;; esac
[[ ${IMAGE_TAG:-} =~ ^[0-9a-f]{40}$ ]] || { echo 'Tag deve ser SHA revisado'; exit 1; }
[[ ${DEPLOY_HOST:-} =~ ^[a-zA-Z0-9.-]+$ && ${DEPLOY_USER:-} =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
umask 077
mkdir -p "$HOME/.ssh"
printf '%s\n' "$SSH_PRIVATE_KEY" > "$HOME/.ssh/operaon_release"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$HOME/.ssh/known_hosts"
# Diretórios e configuração/secrets são previamente provisionados pelo operador. Host key não é descoberta na hora.
scp -i "$HOME/.ssh/operaon_release" deploy/stack.yml deploy/deploy-reviewed.sh "$DEPLOY_USER@$DEPLOY_HOST:/opt/operaon/$DEPLOY_ENV/"
ssh -i "$HOME/.ssh/operaon_release" "$DEPLOY_USER@$DEPLOY_HOST" "cd /opt/operaon/$DEPLOY_ENV && DEPLOY_ENABLED=true bash deploy-reviewed.sh '$DEPLOY_ENV' '$IMAGE_TAG'"
