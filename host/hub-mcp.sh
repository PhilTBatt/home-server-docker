#!/bin/bash

case "$1" in
  "") actions=on ;;
  read-only) actions=off ;;
  *)
    echo "Usage: bash host/hub-mcp.sh [read-only]" >&2
    exit 1
    ;;
esac

cd "$(dirname "$0")/.." || exit 1

token=$(grep '^API_TOKEN=' api/.env | cut -d= -f2)
if [ -z "$token" ]; then
  echo "No API_TOKEN found in api/.env." >&2
  exit 1
fi

API_TOKEN="$token" MCP_ACTIONS="$actions" exec docker compose run --rm -T -e API_TOKEN -e MCP_ACTIONS mcp