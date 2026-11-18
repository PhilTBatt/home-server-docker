#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

token=$(grep '^API_TOKEN=' api/.env | cut -d= -f2)
if [ -z "$token" ]; then
  echo "No API_TOKEN found in api/.env." >&2
  exit 1
fi

projects="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
mounts=()
for session in docker:. brain:../hub-memory; do
  repo=$(cd "${session#*:}" 2>/dev/null && pwd -P) || continue
  notes="$projects/$(printf '%s' "$repo" | tr -c 'a-zA-Z0-9' '-')/memory"
  if [ -d "$notes" ]; then
    mounts+=(-v "$notes:/notes/${session%%:*}:ro")
  fi
done

API_TOKEN="$token" exec docker compose run --rm -e API_TOKEN "${mounts[@]}" jarvis
