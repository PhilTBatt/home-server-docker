#!/bin/bash

path="$1"
body="$2"

case "$path" in
  /*) ;;
  *)
    echo "Usage: bash host/hub-post.sh /path ['{\"some\":\"json\"}'] (the path must start with /)" >&2
    exit 1
    ;;
esac

token=$(grep '^API_TOKEN=' api/.env | cut -d= -f2)
if [ -z "$token" ]; then
  echo "No API_TOKEN found in api/.env. Run this from ~/docker." >&2
  exit 1
fi

if [ -z "$body" ]; then
  curl -sS -X POST -H "Host: api.home" -H "Authorization: Bearer $token" "http://localhost$path"
else
  curl -sS -X POST -H "Host: api.home" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body" "http://localhost$path"
fi
echo