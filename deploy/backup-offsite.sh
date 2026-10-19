#!/bin/sh
# D16: dump verificado, cópia criptografada por SSH e retenção restrita ao banco/ambiente configurado.
set -eu
umask 077
: "${RESTIC_REPOSITORY:?Defina repositório dedicado de backup}"
: "${RESTIC_PASSWORD_FILE:?Monte a senha do repositório como secret}"
: "${BACKUP_HOST:?Identificador estável e exclusivo do ambiente}"
: "${BACKUP_FILE:?Execute por backup-run.sh para criar arquivo exclusivo}"
case "$BACKUP_HOST" in *[!a-zA-Z0-9_-]*|'') echo 'BACKUP_HOST inválido' >&2; exit 1;; esac
case "$RESTIC_REPOSITORY" in
  sftp:*)
    : "${BACKUP_SSH_KEY:?Monte chave SSH dedicada}"
    : "${BACKUP_KNOWN_HOSTS:?Monte known_hosts previamente verificado}"
    # O backend interpreta sftp.args; rejeitar espaços/metacaracteres nos caminhos evita nova camada de shell.
    case "$BACKUP_SSH_KEY$BACKUP_KNOWN_HOSTS" in *[!a-zA-Z0-9_./-]*) echo 'Caminhos SSH inválidos' >&2; exit 1;; esac
    set -- -o "sftp.args=-oBatchMode=yes -oStrictHostKeyChecking=yes -oUserKnownHostsFile=$BACKUP_KNOWN_HOSTS -i $BACKUP_SSH_KEY" ;;
  /tmp/*_test/*)
    # Exclusivamente para teste descartável de round-trip; operação normal exige SFTP.
    [ "${BACKUP_ALLOW_LOCAL_TEST_REPOSITORY:-}" = 1 ] || exit 1
    set -- ;;
  *) echo 'Repositório deve usar SFTP/SSH' >&2; exit 1;;
esac
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$directory/backup.sh"
# Arquivo estável dentro do snapshot evita criar um grupo de retenção por nome/data do dump.
restic "$@" backup --stdin --stdin-filename operaon.dump --host "$BACKUP_HOST" --tag operaon-db < "$BACKUP_FILE"
# Não há prune automático nem alteração de snapshots de outras aplicações/ambientes.
restic "$@" forget --host "$BACKUP_HOST" --tag operaon-db --group-by host,tags --keep-daily 7 --keep-weekly 4
restic "$@" check
