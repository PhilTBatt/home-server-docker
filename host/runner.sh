#!/bin/bash

set -u

hub="${HOME_HUB_DIR:-$HOME/docker}"
requests="$hub/chores/requests"
results="$hub/chores/results"
kept_results=20
output_lines=40
output_bytes=4000

say() {
  echo "home-hub-runner: $*"
}

now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

limit_for() {
  case "$1" in
    rebuild-api) echo 900 ;;
    run-tests) echo 2400 ;;
    pull-images) echo 1200 ;;
    *) echo 0 ;;
  esac
}

write_result() {
  local id="$1" body="$2"
  printf '%s\n' "$body" > "$results/.$id.json.tmp" && mv -f "$results/.$id.json.tmp" "$results/$id.json"
}

run_job() {
  case "$1" in
    rebuild-api)
      timeout --kill-after=30 900 docker compose --ansi never up -d --build --wait api
      ;;
    run-tests)
      local status=0 package
      for package in api mcp jarvis ears; do
        echo "== $package"
        timeout --kill-after=30 600 docker run --rm --init -v "$hub/$package:/src:ro" node:26-alpine sh -c 'mkdir /tmp/app && tar -C /src --exclude=./node_modules --exclude=./dist --exclude=./.env --exclude=./data -cf - . | tar -C /tmp/app -xf - && cd /tmp/app && npm ci --no-audit --no-fund > /dev/null 2>&1 && npm test > /tmp/test.txt 2>&1; status=$?; grep -E "^(ℹ|#) (tests|pass|fail|skipped)" /tmp/test.txt; exit $status' || status=$?
      done
      return "$status"
      ;;
    pull-images)
      timeout --kill-after=30 1200 docker compose --ansi never pull --ignore-buildable
      ;;
    *)
      return 64
      ;;
  esac
}

tidy_output() {
  tail -n "$output_lines" "$1" | sed -e 's/\x1b\[[0-9;?]*[A-Za-z]//g' | tr -d '\000-\010\013-\037\177' | tail -c "$output_bytes"
}

prune() {
  local old
  old=$(cd "$results" && ls -t -- *.json 2>/dev/null | grep -E '^[0-9a-f]{16}\.json$' | tail -n +$((kept_results + 1)))
  for file in $old; do
    rm -f -- "$results/$file" "$results/${file%.json}.out"
  done
}

handle() {
  local file="$1" name id job limit started start_seconds status timed_out seconds bytes
  name=$(basename -- "$file")
  if ! [[ "$name" =~ ^[0-9a-f]{16}\.job$ ]] || [ -L "$file" ] || [ ! -f "$file" ]; then
    rm -f -- "$file"
    say "removed a request that isn't one (not a plain file named with 16 hex characters and .job)"
    return
  fi
  id="${name%.job}"
  if [ "$(stat -c %s -- "$file")" -gt 64 ]; then
    rm -f -- "$file"
    write_result "$id" "{\"id\":\"$id\",\"state\":\"refused\",\"why\":\"the request was too long\",\"endedAt\":\"$(now)\"}"
    say "request $id refused: too long"
    return
  fi
  job=$(head -n 1 -- "$file" | tr -d '\r')
  rm -f -- "$file"
  limit=$(limit_for "$job")
  if [ "$limit" = 0 ]; then
    write_result "$id" "{\"id\":\"$id\",\"state\":\"refused\",\"why\":\"that job isn't on the runner's list\",\"endedAt\":\"$(now)\"}"
    say "request $id refused: not a job on the list"
    return
  fi
  started=$(now)
  start_seconds=$(date +%s)
  write_result "$id" "{\"id\":\"$id\",\"job\":\"$job\",\"state\":\"running\",\"startedAt\":\"$started\",\"limitSeconds\":$limit}"
  say "request $id: $job started, with $limit seconds at most"
  local output
  output=$(mktemp) || return
  ( cd "$hub" && run_job "$job" ) > "$output" 2>&1 < /dev/null
  status=$?
  timed_out=false
  if [ "$status" = 124 ] || [ "$status" = 137 ]; then timed_out=true; fi
  seconds=$(( $(date +%s) - start_seconds ))
  tidy_output "$output" > "$results/.$id.out.tmp" && mv -f "$results/.$id.out.tmp" "$results/$id.out"
  bytes=$(wc -c < "$output")
  rm -f -- "$output"
  write_result "$id" "{\"id\":\"$id\",\"job\":\"$job\",\"state\":\"done\",\"exit\":$status,\"timedOut\":$timed_out,\"seconds\":$seconds,\"startedAt\":\"$started\",\"endedAt\":\"$(now)\",\"limitSeconds\":$limit}"
  say "request $id: $job ended with exit $status after $seconds seconds (timed out: $timed_out, $bytes bytes of output, the last $output_lines lines kept)"
}

if [ ! -d "$requests" ] || [ ! -d "$results" ]; then
  say "no $requests or $results folder, so there's nothing to do"
  exit 1
fi

exec 9> "$results/.lock"
if ! flock -n 9; then
  say "another run is going, so this one leaves the requests to it"
  exit 0
fi

shopt -s nullglob
count=0
next=""
for entry in "$requests"/*.job; do
  if [[ "${entry##*/}" =~ ^[0-9a-f]{16}\.job$ ]] && [ -f "$entry" ] && [ ! -L "$entry" ]; then
    if [ -z "$next" ] || [ "$entry" -ot "$next" ]; then next=$entry; fi
  elif mv -T -- "$entry" "$requests/.set-aside-$(date +%s%N)" 2> /dev/null; then
    say "set aside something in chores/requests that isn't a request (not a plain file named with 16 hex characters and .job): it's now a .set-aside- name there, and can be deleted"
  else
    rm -f -- "$entry"
  fi
done
if [ -n "$next" ]; then
  handle "$next"
  count=1
fi
prune
say "handled $count request(s)"
