#!/bin/bash
# Reads from the Home Hub API using the token in api/.env, without printing the token.
# Run from ~/docker. Usage: bash host/hub-get.sh /media/downloads

path="$1"

case "$path" in
  /*) ;;
  *)
    echo "Usage: bash host/hub-get.sh /path (the path must start with /)" >&2
    exit 1
    ;;
esac

token=$(grep '^API_TOKEN=' api/.env | cut -d= -f2)
if [ -z "$token" ]; then
  echo "No API_TOKEN found in api/.env. Run this from ~/docker." >&2
  exit 1
fi

curl -sS -H "Host: api.home" -H "Authorization: Bearer $token" "http://localhost$path"
echo