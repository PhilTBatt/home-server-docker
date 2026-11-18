#!/bin/bash

case "$1" in
  "") dry_run=no ;;
  --dry-run) dry_run=yes ;;
  *)
    echo "Usage: bash host/hub-update.sh [--dry-run]" >&2
    exit 1
    ;;
esac

cd "$(dirname "$0")/.." || exit 1

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "You have uncommitted changes. Commit them first, then run this again." >&2
  exit 1
fi

git fetch --quiet || exit 1
before=$(git rev-parse HEAD)
after=$(git rev-parse '@{upstream}') || exit 1

if [ "$before" = "$after" ]; then
  echo "Already up to date."
  exit 0
fi

if ! git merge-base --is-ancestor "$before" "$after"; then
  echo "This server has commits that aren't on GitHub. Push them first, then run this again." >&2
  exit 1
fi

changed=$(git diff --name-only "$before" "$after")

npm_in() {
  echo "docker run --rm -u node -v $PWD/$1:/app -w /app node:26-alpine npm $2"
}

steps=()
if grep -q '^docker-compose\.yaml$' <<< "$changed"; then steps+=("docker compose up -d"); fi
if grep -q '^api/' <<< "$changed"; then steps+=("docker compose up --build --wait api"); fi
if grep -q '^caddy/Caddyfile$' <<< "$changed"; then steps+=("docker compose restart caddy"); fi
if grep -q '^mcp/' <<< "$changed"; then steps+=("$(npm_in mcp ci)" "$(npm_in mcp test)" "docker compose build mcp"); fi
if grep -q '^jarvis/package-lock\.json$' <<< "$changed"; then steps+=("$(npm_in jarvis ci)" "$(npm_in jarvis "run engine-check")"); fi
installs=$(grep '^host/' <<< "$changed" | grep -v '^host/hub-')

destination() {
  case "$1" in
    host/wifi-watchdog.sh) echo /usr/local/sbin/wifi-watchdog ;;
    host/backup.sh) echo /usr/local/sbin/home-hub-backup ;;
    host/*.service | host/*.timer) echo "/etc/systemd/system/${1#host/}" ;;
  esac
}

install_command() {
  case "$1" in
    host/*.service | host/*.timer) echo "sudo install -m 644 $1 $(destination "$1")" ;;
    *) echo "sudo install $1 $(destination "$1")" ;;
  esac
}

by_hand() {
  if [ "$1" = host/daemon.json ]; then
    echo "  $1: sudo install -m 644 $1 /etc/docker/daemon.json, then sudo systemctl restart docker (this restarts every container)"
  elif [ -n "$(destination "$1")" ]; then
    echo "  $1: $(install_command "$1")"
  else
    echo "  $1: install it by hand, as its step says"
  fi
}

print_installs() {
  [ -z "$installs" ] && return
  echo
  echo "These files run outside Docker and changed. Install them yourself:"
  for file in $installs; do by_hand "$file"; done
}

offer_installs() {
  [ -z "$installs" ] && return
  local reload=no timers=()
  for file in $installs; do
    if [ -z "$(destination "$file")" ] || [ "$file" = host/daemon.json ]; then
      echo
      echo "Changed: $file. This one isn't installed by the script:"
      by_hand "$file"
      continue
    fi
    echo
    echo "Changed: $file"
    git --no-pager diff "$before" "$after" -- "$file"
    read -r -p "Install it to $(destination "$file")? [y/N] " answer || answer=""
    if [ "$answer" != y ] && [ "$answer" != Y ]; then
      echo "Skipped. To install it later: $(install_command "$file")"
      continue
    fi
    if ! $(install_command "$file"); then
      echo "That didn't install. To try again: $(install_command "$file")"
      continue
    fi
    echo "Installed."
    case "$file" in
      *.service) reload=yes ;;
      *.timer) reload=yes; timers+=("${file#host/}") ;;
    esac
  done
  if [ "$reload" = yes ]; then
    echo
    echo "Running: sudo systemctl daemon-reload"
    sudo systemctl daemon-reload
    for timer in "${timers[@]}"; do
      echo "Running: sudo systemctl try-restart $timer"
      sudo systemctl try-restart "$timer"
    done
  fi
}

echo "New on GitHub:"
git log --oneline "$before..$after"
echo
if [ ${#steps[@]} -eq 0 ]; then
  echo "Nothing needs rebuilding."
else
  echo "Steps:"
  printf '  %s\n' "${steps[@]}"
fi
if [ -n "$installs" ]; then
  echo "Files outside Docker that changed (it asks before installing the ones it knows):"
  printf '  %s\n' $installs
fi

if [ "$dry_run" = yes ]; then
  echo
  echo "Dry run: your files weren't changed and nothing was run."
  exit 0
fi

git merge --ff-only --quiet "$after" || exit 1
for i in "${!steps[@]}"; do
  echo
  echo "Running: ${steps[$i]}"
  if ! ${steps[$i]}; then
    echo
    echo "That step failed. Your files are already up to date, so running this script again won't redo it."
    echo "Once it's fixed, run these yourself:"
    printf '  %s\n' "${steps[@]:$i}"
    print_installs
    exit 1
  fi
done

echo
echo "Up to date at $(git rev-parse --short HEAD)."
offer_installs