#!/bin/bash

settings=/etc/home-hub/backup.env
status_dir=/var/lib/home-hub
apps=(jellyfin sonarr radarr prowlarr seerr kuma beszel qbittorrent)
keep=(--keep-daily 7 --keep-weekly 4 --keep-monthly 6)

case "$1" in
  "") dry_run=no ;;
  --dry-run) dry_run=yes ;;
  *)
    echo "Usage: sudo home-hub-backup [--dry-run]" >&2
    exit 1
    ;;
esac

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root: sudo home-hub-backup" >&2
  exit 1
fi

problem="stopped before finishing"
apps_down=no
to_stop=()

now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

write_status() {
  mkdir -p "$status_dir"
  echo "$2" > "$status_dir/$1.tmp" && mv "$status_dir/$1.tmp" "$status_dir/$1"
}

start_again() {
  apps_down=no
  echo "Starting: ${to_stop[*]}"
  if ! docker compose start "${to_stop[@]}"; then
    echo "They didn't all start. Run this yourself: cd $docker_dir && docker compose start ${to_stop[*]}" >&2
    return 1
  fi
}

finish() {
  local code=$?
  if [ "$apps_down" = yes ] && ! start_again; then
    problem="$problem, and the apps didn't all start again"
  fi
  if [ "$dry_run" = no ]; then
    if [ $code -eq 0 ]; then problem=ok; fi
    write_status backup-last-run "$(now) $problem"
  fi
}

fail() {
  problem=$1
  if [ -n "$2" ]; then echo "$2" >&2; fi
  exit 1
}

trap finish EXIT
trap 'exit 1' INT TERM

if [ ! -f "$settings" ]; then
  fail "it isn't set up yet" "Not set up yet: $settings is missing. It needs BACKUP_FROM, RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE."
fi

set -a
. "$settings"
set +a

for name in BACKUP_FROM RESTIC_REPOSITORY RESTIC_PASSWORD_FILE; do
  if [ -z "${!name}" ]; then
    fail "a setting is missing: $name" "Missing setting in $settings: $name"
  fi
done

docker_dir="$BACKUP_FROM/docker"
paths=("$docker_dir" "$BACKUP_FROM/hub-memory" "$BACKUP_FROM/.claude" "$BACKUP_FROM/.claude.json")
for path in "${paths[@]}"; do
  if [ ! -e "$path" ]; then
    fail "something to back up is missing (the dry run says what)" "Missing: $path"
  fi
done

if ! restic cat config > /dev/null; then
  fail "couldn't open the backup repository" "Can't open the backup repository, so nothing was backed up. Check RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE in $settings."
fi

cd "$docker_dir" || fail "couldn't open the docker folder"
running=$(docker compose ps --status running --services) || fail "couldn't list the running apps"
for app in "${apps[@]}"; do
  if grep -qx "$app" <<< "$running"; then to_stop+=("$app"); fi
done

if [ "$dry_run" = yes ]; then
  echo "Dry run: would stop ${to_stop[*]:-nothing}, back up, then start them again."
  restic backup --dry-run --exclude "$docker_dir/jellyfin/cache" "${paths[@]}" || exit
  restic forget --dry-run "${keep[@]}"
  exit
fi

if [ ${#to_stop[@]} -gt 0 ]; then
  apps_down=yes
  echo "Stopping: ${to_stop[*]}"
  if ! docker compose stop "${to_stop[@]}"; then
    fail "the apps didn't all stop" "They didn't all stop, so nothing was backed up."
  fi
fi

restic backup --exclude "$docker_dir/jellyfin/cache" "${paths[@]}"
status=$?
if [ $status -ne 0 ]; then
  fail "restic backup exited with $status" "The backup failed: restic exited with $status, so no old backups were removed."
fi
write_status backup-last-success "$(now)"

if [ "$apps_down" = yes ] && ! start_again; then
  fail "the apps didn't all start again"
fi

restic forget --prune "${keep[@]}"
status=$?
if [ $status -ne 0 ]; then
  fail "removing old backups failed (restic exited with $status)" "Backed up, but removing old backups failed: restic exited with $status."
fi