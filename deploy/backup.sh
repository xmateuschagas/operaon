#!/bin/sh
# PGPASSFILE é montado como secret; pg_dump não recebe senha por argumento ou log.
set -eu
umask 077
: "${PGHOST:?Defina PGHOST privado}"
: "${PGUSER:?Defina PGUSER de backup}"
: "${PGDATABASE:?Defina PGDATABASE}"
: "${PGPASSFILE:?Monte o arquivo de autenticação}"
: "${BACKUP_DIR:?Defina diretório privado de backup}"
mkdir -p "$BACKUP_DIR"
file="${BACKUP_FILE:-$BACKUP_DIR/operaon-$(date -u +%Y%m%dT%H%M%SZ).dump}"
pg_dump --format=custom --no-owner --file="$file"
pg_restore --list "$file" >/dev/null
printf '%s\n' 'Backup concluído e catálogo verificado'
