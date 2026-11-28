#!/bin/bash

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

printf 'Authorization: Bearer %s\n' "$token" | curl -sS -H @- -H "Host: api.home" "http://localhost$path"
echo