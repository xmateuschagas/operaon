#!/bin/sh
# Entrada do cron: um diretório exclusivo por execução e lock local impedem sobreposição.
set -eu
umask 077
: "${BACKUP_DIR:?Defina diretório privado}"
mkdir -p "$BACKUP_DIR"
lock="$BACKUP_DIR/.backup-lock"
mkdir "$lock" || { echo 'Backup já está em execução; conferir lock' >&2; exit 1; }
trap 'rmdir "$lock"' EXIT HUP INT TERM
BACKUP_FILE=$(mktemp "$BACKUP_DIR/operaon-$(date -u +%Y%m%dT%H%M%SZ).dump-XXXXXX")
export BACKUP_FILE
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$directory/backup-offsite.sh"
