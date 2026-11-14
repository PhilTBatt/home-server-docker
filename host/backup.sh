#!/bin/bash

settings=/etc/home-hub/backup.env
apps=(jellyfin sonarr radarr prowlarr seerr kuma beszel qbittorrent)

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

if [ ! -f "$settings" ]; then
  echo "Not set up yet: $settings is missing. It needs BACKUP_FROM, RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE." >&2
  exit 1
fi

set -a
. "$settings"
set +a

for name in BACKUP_FROM RESTIC_REPOSITORY RESTIC_PASSWORD_FILE; do
  if [ -z "${!name}" ]; then
    echo "Missing setting in $settings: $name" >&2
    exit 1
  fi
done

docker_dir="$BACKUP_FROM/docker"
paths=("$docker_dir" "$BACKUP_FROM/hub-memory" "$BACKUP_FROM/.claude" "$BACKUP_FROM/.claude.json")
for path in "${paths[@]}"; do
  if [ ! -e "$path" ]; then
    echo "Missing: $path" >&2
    exit 1
  fi
done

if ! restic cat config > /dev/null; then
  echo "Can't open the backup repository, so nothing was backed up. Check RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE in $settings." >&2
  exit 1
fi

cd "$docker_dir" || exit 1
running=$(docker compose ps --status running --services) || exit 1
to_stop=()
for app in "${apps[@]}"; do
  if grep -qx "$app" <<< "$running"; then to_stop+=("$app"); fi
done

if [ "$dry_run" = yes ]; then
  echo "Dry run: would stop ${to_stop[*]:-nothing}, back up, then start them again."
  restic backup --dry-run --exclude "$docker_dir/jellyfin/cache" "${paths[@]}"
  exit
fi

start_again() {
  echo "Starting: ${to_stop[*]}"
  if ! docker compose start "${to_stop[@]}"; then
    echo "They didn't all start. Run this yourself: cd $docker_dir && docker compose start ${to_stop[*]}" >&2
  fi
}

if [ ${#to_stop[@]} -gt 0 ]; then
  trap start_again EXIT
  trap 'exit 1' INT TERM
  echo "Stopping: ${to_stop[*]}"
  if ! docker compose stop "${to_stop[@]}"; then
    echo "They didn't all stop, so nothing was backed up." >&2
    exit 1
  fi
fi

restic backup --exclude "$docker_dir/jellyfin/cache" "${paths[@]}"
status=$?
if [ $status -ne 0 ]; then echo "The backup failed: restic exited with $status." >&2; fi
exit $status