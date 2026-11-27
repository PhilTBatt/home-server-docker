#!/bin/bash

name="$1"
state="$2"

[[ "$name" =~ ^[a-z0-9-]{1,20}$ ]] || exit 0
case "$state" in
  waiting | working | stopped) ;;
  *) exit 0 ;;
esac

env_file="$(cd "$(dirname "$0")/.." && pwd)/api/.env"
grep -qx 'SESSIONS=on' "$env_file" 2>/dev/null || exit 0
token=$(grep '^API_TOKEN=' "$env_file" | head -n 1 | cut -d= -f2-)
[ -n "$token" ] || exit 0

cache="${HOME}/.cache/home-hub"
last="$cache/session-$name"
if [ "$(cat "$last" 2>/dev/null)" = "$state" ] && [ -n "$(find "$last" -mmin -5 2>/dev/null)" ]; then
  exit 0
fi

if printf 'Authorization: Bearer %s\n' "$token" | curl -sS -f -m 3 -o /dev/null -X POST -H @- -H "Host: api.home" -H "Content-Type: application/json" -d "{\"state\":\"$state\"}" "http://localhost/sessions/$name/state" > /dev/null 2>&1; then
  mkdir -p "$cache" 2> /dev/null && printf '%s\n' "$state" > "$last" 2> /dev/null
fi
exit 0
