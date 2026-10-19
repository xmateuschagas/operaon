#!/bin/sh
# Guardrail impede limpeza de qualquer banco que não seja explicitamente destinado a restore de teste.
set -eu
: "${PGDATABASE:?Defina banco de teste}"
case "$PGDATABASE" in *_restore_test) ;; *) printf '%s\n' 'Recusado: banco deve terminar em _restore_test' >&2; exit 1;; esac
: "${1:?Informe o arquivo de backup}"
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$PGDATABASE" "$1"
psql -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS workspaces FROM tenants; SELECT COUNT(*) AS leads FROM leads;'
