#!/bin/sh
# Teste isolado: usa restic real e dump fictício, sem SSH, banco de produção ou cron.
set -eu
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(mktemp -d /tmp/operaon-backup-test-XXXXXX)
trap 'case "$root" in /tmp/operaon-backup-test-*) rm -rf "$root";; esac' EXIT
mkdir "$root/bin"
printf '%s\n' '#!/bin/sh' 'for arg do case "$arg" in --file=*) printf "dump ficticio para teste\n" > "${arg#--file=}";; esac; done' > "$root/bin/pg_dump"
printf '%s\n' '#!/bin/sh' 'exit 0' > "$root/bin/pg_restore"
chmod +x "$root/bin/pg_dump" "$root/bin/pg_restore"
export PATH="$root/bin:$PATH"
export RESTIC_REPOSITORY="$root/repository_test/repository" RESTIC_PASSWORD_FILE="$root/password"
export BACKUP_HOST=operaon-test BACKUP_DIR="$root/dumps" BACKUP_ALLOW_LOCAL_TEST_REPOSITORY=1
export PGHOST=unused PGUSER=unused PGDATABASE=unused PGPASSFILE="$root/pgpass"
printf '%s\n' 'senha ficticia de teste descartavel' > "$RESTIC_PASSWORD_FILE"
restic init >/dev/null
sh "$directory/backup-run.sh"
restic restore latest --host "$BACKUP_HOST" --tag operaon-db --target "$root/restored" >/dev/null
grep -q 'dump ficticio para teste' "$root/restored/operaon.dump"
# Mais dias que a política permite: verificar retenção real e preservar outra aplicação.
for day in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15; do
  printf '%s\n' 'snapshot ficticio antigo' | restic backup --quiet --stdin --stdin-filename operaon.dump --host "$BACKUP_HOST" --tag operaon-db --time "2025-01-${day} 03:00:00" >/dev/null
done
printf '%s\n' 'outra aplicação' | restic backup --quiet --stdin --stdin-filename other.dump --host other-test --tag other-app >/dev/null
sh "$directory/backup-run.sh"
count=$(restic snapshots --host "$BACKUP_HOST" --tag operaon-db --json | grep -o '"short_id"' | wc -l | tr -d ' ')
test "$count" -ge 7
test "$count" -le 11
test "$(restic snapshots --host other-test --tag other-app --json | grep -o '"short_id"' | wc -l | tr -d ' ')" = 1
before=$(restic snapshots --json | grep -o '"short_id"' | wc -l | tr -d ' ')
# Falha do dump deve interromper antes de criar snapshot; senha e SSH nunca viram saída.
printf '%s\n' '#!/bin/sh' 'exit 7' > "$root/bin/pg_dump"
if sh "$directory/backup-run.sh"; then echo 'Falha de dump não propagada' >&2; exit 1; fi
test "$(restic snapshots --json | grep -o '"short_id"' | wc -l | tr -d ' ')" = "$before"
printf '%s\n' 'Backup criptografado/restore, retenção isolada e falha de dump validados sem acesso externo'
