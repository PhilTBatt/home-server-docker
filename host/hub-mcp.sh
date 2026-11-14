#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

token=$(grep '^API_TOKEN=' api/.env | cut -d= -f2)
if [ -z "$token" ]; then
  echo "No API_TOKEN found in api/.env." >&2
  exit 1
fi

API_TOKEN="$token" exec docker compose run --rm -T -e API_TOKEN mcp