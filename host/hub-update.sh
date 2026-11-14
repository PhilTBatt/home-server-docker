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
steps=()
if grep -q '^docker-compose\.yaml$' <<< "$changed"; then steps+=("docker compose up -d"); fi
if grep -q '^api/' <<< "$changed"; then steps+=("docker compose up --build --wait api"); fi
if grep -q '^mcp/' <<< "$changed"; then steps+=("docker compose build mcp"); fi
if grep -q '^caddy/Caddyfile$' <<< "$changed"; then steps+=("docker compose restart caddy"); fi
installs=$(grep '^host/' <<< "$changed" | grep -v '^host/hub-')

echo "New on GitHub:"
git log --oneline "$before..$after"
echo
if [ ${#steps[@]} -eq 0 ]; then
  echo "Nothing needs rebuilding."
else
  echo "Steps:"
  printf '  %s\n' "${steps[@]}"
fi

if [ "$dry_run" = yes ]; then
  echo
  echo "Dry run: your files weren't changed and nothing was run."
  exit 0
fi

show_installs() {
  if [ -n "$installs" ]; then
    echo
    echo "These files run outside Docker and changed. Install each one by hand, as its step says:"
    printf '  %s\n' $installs
    if grep -q '^host/wifi-watchdog\.sh$' <<< "$installs"; then
      echo "  For the watchdog: sudo install host/wifi-watchdog.sh /usr/local/sbin/wifi-watchdog"
    fi
  fi
}

git merge --ff-only --quiet "$after" || exit 1
for i in "${!steps[@]}"; do
  echo
  echo "Running: ${steps[$i]}"
  if ! ${steps[$i]}; then
    echo
    echo "That step failed. Your files are already up to date, so running this script again won't redo it."
    echo "Once it's fixed, run these yourself:"
    printf '  %s\n' "${steps[@]:$i}"
    show_installs
    exit 1
  fi
done

echo
echo "Up to date at $(git rev-parse --short HEAD)."
show_installs