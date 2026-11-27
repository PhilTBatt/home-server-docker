#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/runner.sh"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

mkdir "$work/bin"
cat > "$work/bin/docker" <<'FAKE'
#!/bin/bash
echo "$PWD :: $*" >> "$DOCKER_LOG"
if [ -n "${DOCKER_LINES:-}" ]; then for i in $(seq 1 "$DOCKER_LINES"); do printf '\033[1mline %s of the output\033[0m\n' "$i"; done; fi
if [ -n "${DOCKER_SLEEP:-}" ]; then sleep "$DOCKER_SLEEP"; fi
if [ -n "${DOCKER_FAIL:-}" ] && [[ "$*" == *"$DOCKER_FAIL"* ]]; then echo "it failed"; exit 3; fi
echo "fake docker ran"
exit 0
FAKE
chmod +x "$work/bin/docker"

passed=0
failed=0

check() {
  if [ "$2" = "$3" ]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1"
    echo "  expected: $2"
    echo "  got:      $3"
  fi
}

check_has() {
  if [[ "$3" == *"$2"* ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1"
    echo "  expected to find: $2"
    echo "  in: $3"
  fi
}

check_lacks() {
  if [[ "$3" != *"$2"* ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1"
    echo "  expected not to find: $2"
    echo "  in: $3"
  fi
}

fresh() {
  rm -rf "$work/hub" "$work/docker.log"
  mkdir -p "$work/hub/chores/requests" "$work/hub/chores/results"
  touch "$work/docker.log"
}

ask() {
  printf '%s\n' "$2" > "$work/hub/chores/requests/$1.job"
}

run() {
  (cd "$work" && PATH="$work/bin:$PATH" HOME_HUB_DIR="$work/hub" DOCKER_LOG="$work/docker.log" bash "${RUNNER:-$script}" 2>&1)
}

result() {
  cat "$work/hub/chores/results/$1.json" 2>/dev/null
}

id1=0123456789abcdef
id2=fedcba9876543210

fresh
rm -rf "$work/hub/chores"
output=$(run)
check "with no chores folders it does nothing and says why" "1" "$?"
check_has "naming the folder" "chores/requests" "$output"

fresh
ask "$id1" rebuild-api
output=$(run)
check "rebuild-api rebuilds and restarts the API from the hub's folder, waiting for its health check, and nothing else" "$work/hub :: compose --ansi never up -d --build --wait api" "$(cat "$work/docker.log")"
check "the request is gone once it's read" "" "$(ls "$work/hub/chores/requests")"
check_has "the result says it's done, with its exit code" "\"id\":\"$id1\",\"job\":\"rebuild-api\",\"state\":\"done\",\"exit\":0,\"timedOut\":false,\"seconds\":" "$(result "$id1")"
check_has "and its time limit" "\"limitSeconds\":900}" "$(result "$id1")"
check "the output is kept beside it" "fake docker ran" "$(cat "$work/hub/chores/results/$id1.out")"
check_has "the log says what ran and how it ended, in numbers" "request $id1: rebuild-api ended with exit 0 after" "$output"
check_has "and how many it handled" "handled 1 request(s)" "$output"

fresh
ask "$id1" run-tests
run > /dev/null
log=$(cat "$work/docker.log")
check "run-tests runs each package's tests in its own throwaway container" "4" "$(grep -c 'run --rm --init' <<< "$log")"
for package in api mcp jarvis ears; do
  check_has "with $package mounted read-only, so nothing on the server changes" "-v $work/hub/$package:/src:ro node:26-alpine" "$log"
done
check_lacks "never as a writable mount" ":/app" "$log"
check_has "copying it inside the container, without the server's packages" "--exclude=./node_modules" "$log"
check_has "or its secrets and data, which npm's install scripts would see" "--exclude=./.env --exclude=./data" "$log"
check_has "each package is named in the output" "== jarvis" "$(cat "$work/hub/chores/results/$id1.out")"

fresh
ask "$id1" run-tests
DOCKER_FAIL="$work/hub/mcp:/src" run > /dev/null
check_has "a package whose tests fail makes the whole run fail, and the others still run" "\"exit\":3" "$(result "$id1")"
check "and the others still run" "4" "$(grep -c 'run --rm' "$work/docker.log")"

fresh
ask "$id1" pull-images
run > /dev/null
check "pull-images only downloads the images, leaving the ones it builds itself" "$work/hub :: compose --ansi never pull --ignore-buildable" "$(cat "$work/docker.log")"

fresh
ask "$id1" rebuild-api
DOCKER_FAIL="up -d" run > /dev/null
check_has "a failed job keeps its exit code" "\"state\":\"done\",\"exit\":3,\"timedOut\":false" "$(result "$id1")"
check_has "and its output" "it failed" "$(cat "$work/hub/chores/results/$id1.out")"

fresh
for job in "reboot" "rm -rf ~" 'rebuild-api; touch '"$work"'/pwned' '$(touch '"$work"'/pwned)' "REBUILD-API" " rebuild-api" "rebuild-api "; do
  rm -f "$work/hub/chores/results/"*
  ask "$id1" "$job"
  output=$(run)
  check "a job that isn't on the list is refused: $job" '"state":"refused","why":"that job isn'"'"'t on the runner'"'"'s list"' "$(result "$id1" | grep -o '"state":"refused","why":"[^"]*"')"
done
check "and nothing ran" "" "$(cat "$work/docker.log")"
check "and nothing in it was run as a command" "no" "$([ -e "$work/pwned" ] && echo yes || echo no)"

fresh
printf 'rebuild-api\nrun-tests\n' > "$work/hub/chores/requests/$id1.job"
run > /dev/null
check "only the first line names the job" "$work/hub :: compose --ansi never up -d --build --wait api" "$(cat "$work/docker.log")"

fresh
printf '%070d\n' 0 > "$work/hub/chores/requests/$id1.job"
run > /dev/null
check_has "a request over 64 bytes is refused unread" '"state":"refused","why":"the request was too long"' "$(result "$id1")"

fresh
echo rebuild-api > "$work/hub/chores/requests/abc.job"
echo rebuild-api > "$work/hub/chores/requests/0123456789ABCDEF.job"
output=$(run)
check "a request whose name isn't 16 hex characters is set aside without running" "" "$(cat "$work/docker.log")$(ls "$work/hub/chores/requests")"
check "and gets no result" "" "$(ls "$work/hub/chores/results")"
check_has "and the log says so" "set aside something in chores/requests that isn't a request" "$output"

fresh
mkdir -p "$work/hub/chores/requests/$id1.job/inner"
echo rebuild-api > "$work/hub/chores/requests/$id1.job/inner/x"
echo rebuild-api > "$work/hub/chores/requests/$id2"$'\n'".job"
output=$(run)
check "a folder or a name with a newline in it is set aside, never run" "" "$(cat "$work/docker.log")"
check "so nothing is left for the path unit's *.job to keep starting the runner for" "" "$(cd "$work/hub/chores/requests" && compgen -G '*.job')"
check "and the set-aside folder keeps what was in it" "rebuild-api" "$(cat "$work/hub/chores/requests"/.set-aside-*/inner/x)"
check_has "and nothing is handled" "handled 0 request(s)" "$output"

fresh
echo rebuild-api > "$work/target"
ln -s "$work/target" "$work/hub/chores/requests/$id1.job"
run > /dev/null
check "a request that's a link is removed without running, and what it pointed to is left alone" "rebuild-api" "$(cat "$work/docker.log")$(cat "$work/target")"
check "the link is gone" "" "$(ls "$work/hub/chores/requests")"

fresh
echo pull-images > "$work/hub/chores/requests/notes.txt"
run > /dev/null
check "a file that isn't a .job is never read" "" "$(cat "$work/docker.log")"

fresh
ask "$id1" pull-images
DOCKER_LINES=60 run > /dev/null
out=$(cat "$work/hub/chores/results/$id1.out")
check "only the last 40 lines of output are kept" "40" "$(wc -l <<< "$out")"
check_has "the last ones" "line 60 of the output" "$out"
check_lacks "with colour codes taken out" $'\033' "$out"
check_lacks "whole, not leaving their letters behind" "[1m" "$out"

fresh
ask "$id1" pull-images
DOCKER_LINES=2000 run > /dev/null
check "and no more than 4,000 bytes" "yes" "$([ "$(wc -c < "$work/hub/chores/results/$id1.out")" -le 4000 ] && echo yes || echo no)"

fresh
sed -e 's/timeout --kill-after=30 900 /timeout --kill-after=1 1 /' "$script" > "$work/runner-quick.sh"
ask "$id1" rebuild-api
DOCKER_SLEEP=5 RUNNER="$work/runner-quick.sh" run > /dev/null
check_has "a job past its time limit is stopped and says it timed out" '"state":"done","exit":124,"timedOut":true' "$(result "$id1")"

fresh
ask "$id1" rebuild-api
sleep 1
ask "$id2" pull-images
output=$(run)
check "each start of the runner handles one request, the oldest" "$work/hub :: compose --ansi never up -d --build --wait api" "$(cat "$work/docker.log")"
check_has "and says so" "handled 1 request(s)" "$output"
run > /dev/null
check "and the next start, which the path unit makes while one is left, handles the next" "$work/hub :: compose --ansi never up -d --build --wait api
$work/hub :: compose --ansi never pull --ignore-buildable" "$(cat "$work/docker.log")"

fresh
exec 8> "$work/hub/chores/results/.lock"
flock -n 8
ask "$id1" rebuild-api
output=$(run)
check "while another run holds the lock, a second leaves the request alone" "" "$(cat "$work/docker.log")"
check_has "and says why" "another run is going" "$output"
check "the request is still there" "$id1.job" "$(ls "$work/hub/chores/requests")"
exec 8>&-

fresh
for i in $(seq 1 25); do
  printf '{"id":"%016x"}\n' "$i" > "$work/hub/chores/results/$(printf '%016x' "$i").json"
  echo out > "$work/hub/chores/results/$(printf '%016x' "$i").out"
  touch -d "@$((1700000000 + i))" "$work/hub/chores/results/$(printf '%016x' "$i").json"
done
echo keep > "$work/hub/chores/results/README.md"
run > /dev/null
check "it keeps the last 20 results and their output" "20 20" "$(ls "$work/hub/chores/results" | grep -c '\.json$') $(ls "$work/hub/chores/results" | grep -c '\.out$')"
check "the newest ones" "yes" "$([ -e "$work/hub/chores/results/$(printf '%016x' 25).json" ] && [ ! -e "$work/hub/chores/results/$(printf '%016x' 1).json" ] && echo yes || echo no)"
check "and never removes anything else" "keep" "$(cat "$work/hub/chores/results/README.md")"

service=$(cat "$here/home-hub-runner@.service")
path=$(cat "$here/home-hub-runner@.path")
check_has "the service runs as the user it's enabled for, never root" "User=%i" "$service"
check_lacks "never as root" "User=root" "$service"
check_has "from that user's home folder" "WorkingDirectory=~" "$service"
check_has "with the hub's folder in that home" "Environment=HOME_HUB_DIR=/home/%i/docker" "$service"
check_lacks "and never %h, which a system unit takes as root's home" "%h" "$service$path"
check "and no user's home is written in either, only the one %i names" "" "$(grep -E '/home/[^%]' <<< "$service$path")"
check "and no user but %i" "User=%i" "$(grep '^User=' <<< "$service")"
check_has "the installed copy, where hub-update.sh puts it" "ExecStart=/usr/local/bin/home-hub-runner" "$service"
check_has "and can't gain rights it wasn't started with" "NoNewPrivileges=yes" "$service"
check_has "the path unit starts it when a request appears" "PathExistsGlob=/home/%i/docker/chores/requests/*.job" "$path"
check_has "and names the same user's service" "Unit=home-hub-runner@%i.service" "$path"

compose=$(sed -n '/^  api:/,/^  mcp:/p' "$here/../docker-compose.yaml")
check_has "the API can write requests" "source: ./chores/requests
        target: /chores/requests" "$compose"
check_has "and only read results" "source: ./chores/results
        target: /chores/results
        read_only: true" "$compose"
check_lacks "and never gets the Docker socket" "docker.sock" "$compose"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
