#!/usr/bin/env bash
# Artefato operacional futuro. A revisão manual da main e os ambientes GitHub continuam obrigatórios.
set -euo pipefail
[[ ${DEPLOY_ENABLED:-false} == true ]] || exit 1
case ${1:-} in staging|production) environment=$1;; *) exit 1;; esac
[[ ${2:-} =~ ^[0-9a-f]{40}$ ]] || exit 1
readonly environment
readonly reviewed_tag=$2
# Arquivo privado provisionado pelo Mateus com domínio, redes e nomes de secrets, sem código remoto interpolado.
[[ -f release.env ]] || { echo 'Configure release.env antes da entrega'; exit 1; }
set -a
source release.env
set +a
export IMAGE_TAG=$reviewed_tag
[[ ${DEPLOY_ENABLED:-false} == true ]] || exit 1
: "${APP_DOMAIN:?Configure o domínio deste ambiente}"
: "${POSTGRES_VOLUME:?Configure o volume deste ambiente}"
: "${ROUTER_NAME:?Configure o router deste ambiente}"
stack="operaon-$environment"
[[ ${SECRET_PREFIX:-} =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
[[ ${IMAGE_PREFIX:-} == ghcr.io/xmateuschagas/operaon ]] || exit 1
# O primeiro bootstrap do banco/roles e o backup são pré-requisitos descritos no runbook.
docker stack deploy --with-registry-auth -c stack.yml "$stack"
job="$stack-migrate-${IMAGE_TAG:0:8}"
docker service create --name "$job" --mode replicated-job --replicas 1 --restart-condition none --network "${stack}_backend" --secret "source=${SECRET_PREFIX}_migration_url,target=migration_url" --env MIGRATION_DATABASE_URL_FILE=/run/secrets/migration_url "${IMAGE_PREFIX}-api:${IMAGE_TAG}" node --import tsx scripts/start.ts migrate >/dev/null
for attempt in {1..60}; do
  state=$(docker service ps --no-trunc --format '{{.CurrentState}}' "$job" | head -n 1)
  case "$state" in Complete*) docker service rm "$job" >/dev/null; echo 'Migration concluída'; completed=true; break;; Failed*|Rejected*) echo 'Migration falhou; consulte runbook'; exit 1;; esac
  sleep 5
done
[[ ${completed:-false} == true ]] || { echo 'Migration não concluiu dentro do prazo; consulte runbook'; exit 1; }
for attempt in {1..40}; do
  if curl -fsS --max-time 10 "https://${APP_DOMAIN:?Configure domínio}/ready" >/dev/null; then echo 'Readiness validada'; exit 0; fi
  sleep 5
done
echo 'Readiness falhou; avalie rollback conforme runbook'
exit 1
