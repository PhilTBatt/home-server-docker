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
cat > "$work/bin/tmux" <<'FAKE'
#!/bin/bash
echo "$PWD :: tmux $*" >> "$TMUX_LOG"
[ "$1" = -L ] && shift 2
if [ "$1" = has-session ]; then [ -n "${TMUX_HAS:-}" ]; exit $?; fi
exit 0
FAKE
chmod +x "$work/bin/tmux"
mkdir -p "$work/home/.local/bin" "$work/home/docker-copy" "$work/home/brain-copy"
printf '#!/bin/bash\n' > "$work/home/.local/bin/claude"
chmod +x "$work/home/.local/bin/claude"

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
  rm -rf "$work/hub" "$work/docker.log" "$work/tmux.log"
  mkdir -p "$work/hub/chores/requests" "$work/hub/chores/results" "$work/hub/host"
  touch "$work/docker.log" "$work/tmux.log"
}

ask() {
  printf '%s\n' "$2" > "$work/hub/chores/requests/$1.job"
}

run() {
  (cd "$work" && PATH="$work/bin:${RUN_PATH:-$PATH}" HOME="$work/home" HOME_HUB_DIR="$work/hub" DOCKER_LOG="$work/docker.log" TMUX_LOG="$work/tmux.log" bash "${RUNNER:-$script}" 2>&1)
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
check_has "or its secrets and data, which npm's install scripts would see" "--exclude=./.env --exclude=\"./.env.*\" --exclude=./data" "$log"
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

sessions_ok() {
  printf 'docker hub-docker %s\nbrain hub-brain %s\n' "$work/home/docker-copy" "$work/home/brain-copy" > "$work/hub/host/hub-sessions.conf"
}

fresh
sessions_ok
ask "$id1" session-start-docker
output=$(run)
check "starting a session starts Claude Code in a detached tmux session named and placed as the settings say, on its own tmux server, so the runner's limits never reach my own tmux windows" "$work/hub :: tmux -L home-hub has-session -t =hub-docker
$work/hub :: tmux -L home-hub new-session -d -s hub-docker -c $work/home/docker-copy $work/home/.local/bin/claude" "$(cat "$work/tmux.log")"
check_has "and says so" "started the tmux session for docker" "$(cat "$work/hub/chores/results/$id1.out")"
check_has "with its own short limit" '"job":"session-start-docker","state":"done","exit":0,"timedOut":false' "$(result "$id1")"
check_has "of 30 seconds" '"limitSeconds":30}' "$(result "$id1")"
check "and Docker isn't touched" "" "$(cat "$work/docker.log")"

fresh
sessions_ok
ask "$id1" session-start-brain
TMUX_HAS=1 run > /dev/null
check "starting one that's already running leaves it alone" "$work/hub :: tmux -L home-hub has-session -t =hub-brain" "$(cat "$work/tmux.log")"
check_has "and says so" "already running" "$(cat "$work/hub/chores/results/$id1.out")"

fresh
sessions_ok
ask "$id1" session-stop-docker
TMUX_HAS=1 run > /dev/null
check "stopping one ends exactly that tmux session" "$work/hub :: tmux -L home-hub has-session -t =hub-docker
$work/hub :: tmux -L home-hub kill-session -t =hub-docker" "$(cat "$work/tmux.log")"

fresh
sessions_ok
ask "$id1" session-stop-docker
run > /dev/null
check "stopping one that isn't running does nothing" "$work/hub :: tmux -L home-hub has-session -t =hub-docker" "$(cat "$work/tmux.log")"

fresh
sessions_ok
ask "$id1" session-start-other
run > /dev/null
check_has "a session that isn't in the settings is refused" '"job":"session-start-other","state":"refused","why":"that session isn'"'"'t in the runner'"'"'s settings"' "$(result "$id1")"
check "and tmux isn't asked" "" "$(cat "$work/tmux.log")"

fresh
ask "$id1" session-start-docker
run > /dev/null
check_has "with no settings file, no session is known" '"state":"refused"' "$(result "$id1")"

for bad in "docker bad;name $work/home/docker-copy" "docker hub-docker relative/folder" "docker hub-docker $work/home/docker-copy/../../etc" "docker hub-docker /etc" "docker hub-docker $work/home/missing" "docker hub-docker $work/home/docker-copy extra"; do
  fresh
  printf '%s\n' "$bad" > "$work/hub/host/hub-sessions.conf"
  ask "$id1" session-start-docker
  run > /dev/null
  check_has "a settings line that isn't safe is refused: $bad" '"state":"refused"' "$(result "$id1")"
  check "and nothing ran: $bad" "" "$(cat "$work/tmux.log")"
done

fresh
sessions_ok
for job in "session-start-Docker" "session-start-" "session-start-docker;ls" "session-restart-docker"; do
  rm -f "$work/hub/chores/results/"*
  ask "$id1" "$job"
  run > /dev/null
  check "an odd session job is refused as not on the list: $job" '"state":"refused","why":"that job isn'"'"'t on the runner'"'"'s list"' "$(result "$id1" | grep -o '"state":"refused","why":"[^"]*"')"
done
check "and tmux was never asked" "" "$(cat "$work/tmux.log")"

fresh
sessions_ok
rm "$work/home/.local/bin/claude"
mkdir -p "$work/no-claude"
for tool in /usr/bin/* /bin/*; do
  [ "${tool##*/}" = claude ] || ln -sf "$tool" "$work/no-claude/${tool##*/}"
done
ask "$id1" session-start-docker
RUN_PATH="$work/no-claude" run > /dev/null
check_has "without Claude Code installed it says so, even on a machine where it's installed system-wide" "claude isn't installed for this user" "$(cat "$work/hub/chores/results/$id1.out")"
printf '#!/bin/bash\n' > "$work/home/.local/bin/claude"
chmod +x "$work/home/.local/bin/claude"

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
check_has "and leaves a tmux session it started running when it ends" "KillMode=process" "$service"
check "the example settings name no one" "" "$(grep -v '/home/you/' "$here/hub-sessions.example.conf")"
check_has "the path unit starts it when a request appears" "PathExistsGlob=/home/%i/docker/chores/requests/*.job" "$path"
check_has "and names the same user's service" "Unit=home-hub-runner@%i.service" "$path"

compose=$(sed -n '/^  api:/,/^  mcp:/p' "$here/../docker-compose.yaml")
check_has "the API can write requests" "source: ./chores/requests
        target: /chores/requests" "$compose"
check_has "and only read results" "source: ./chores/results
        target: /chores/results
        read_only: true" "$compose"
check_lacks "and never gets the Docker socket" "docker.sock" "$compose"

switch_env() {
  mkdir -p "$work/hub/api"
  printf 'CHORES=on\nSWITCHES=on\n%s' "$1" > "$work/hub/api/.env"
  chmod 600 "$work/hub/api/.env"
}

flat_env() {
  grep -v -x -e 'CHORES=on' -e 'SWITCHES=on' "$work/hub/api/.env" | tr '\n' ' ' | sed 's/ $//'
}

raw_env() {
  mkdir -p "$work/hub/api"
  printf '%s' "$1" > "$work/hub/api/.env"
  chmod 600 "$work/hub/api/.env"
}

fresh
switch_env $'API_TOKEN=secret-value-123\nREMINDERS=off\nMODES=on\n'
ask "$id1" switch-on-reminders
output=$(run)
check "switch-on-reminders changes only that one line of api/.env" "API_TOKEN=secret-value-123 REMINDERS=on MODES=on" "$(flat_env)"
check "and restarts only the API, recreated so it reads the new setting, waiting for its health check" "$work/hub :: compose --ansi never up -d --no-deps --force-recreate --wait api" "$(cat "$work/docker.log")"
check "api/.env keeps its permissions" "600" "$(stat -c %a "$work/hub/api/.env")"
check "and no copy of it is left beside it" "" "$(ls -A "$work/hub/api" | grep -v '^\.env$')"

fresh
switch_env $'REMINDERS=off\n'
printf 'API_TOKEN=left-from-a-killed-run\n' > "$work/hub/api/.env.switch.AbC123"
ask "$id1" switch-on-reminders
run > /dev/null
check "a copy left by a run that was killed part-way is cleared at the next switch chore" "" "$(ls -A "$work/hub/api" | grep -v '^\.env$')"
check_has "the result says it's done" '"job":"switch-on-reminders","state":"done","exit":0,"timedOut":false' "$(result "$id1")"
check_has "with a 5-minute limit" '"limitSeconds":300}' "$(result "$id1")"
check_has "the output says what was set" "set REMINDERS=on in api/.env, restarting the API" "$(cat "$work/hub/chores/results/$id1.out")"
check_lacks "nothing else from api/.env is ever in the output" "secret-value-123" "$(cat "$work/hub/chores/results/$id1.out") $output"

fresh
switch_env $'MODES=off\nFIND_PHONE=on\n'
ask "$id1" switch-off-find-phone
run > /dev/null
check "a switch with an underscore is named with a dash" "MODES=off FIND_PHONE=off" "$(flat_env)"

fresh
switch_env $'MODES=off\n'
ask "$id1" switch-off-modes
run > /dev/null
check "a switch already that way changes nothing" "MODES=off" "$(flat_env)"
check "and restarts nothing" "" "$(cat "$work/docker.log")"
check_has "and says so" "MODES is already off, so nothing was changed" "$(cat "$work/hub/chores/results/$id1.out")"

fresh
switch_env $'SPOTIFY=off\n'
ask "$id1" switch-on-spotify
DOCKER_FAIL="up -d" run > /dev/null
check "if the API doesn't come back, the switch is put back" "SPOTIFY=off" "$(flat_env)"
check "and the API started again with it" "2" "$(grep -c 'up -d --no-deps --force-recreate --wait api' "$work/docker.log")"
check_has "the chore fails, saying why" '"exit":70' "$(result "$id1")"
check_has "in words" "the API didn't come back with SPOTIFY=on, so it was put back to SPOTIFY=off" "$(cat "$work/hub/chores/results/$id1.out")"

for case in "LOGIN_GUARD=off:switch-on-login-guard" "API_TOKEN=x:switch-on-api-token" "DEALS_AI=off:switch-on-deals-ai"; do
  fresh
  switch_env "${case%%:*}"$'\n'
  ask "$id1" "${case#*:}"
  run > /dev/null
  check "${case#*:} isn't one of the hub's feature switches, so it's refused" "${case%%:*}" "$(flat_env)"
  check_has "saying so" "\"state\":\"refused\",\"why\":\"that isn't one of the hub's switches\"" "$(result "$id1")"
  check "and docker isn't touched" "" "$(cat "$work/docker.log")"
done

for job in "switch-on-REMINDERS" "switch-on-reminders;ls" 'switch-on-$(touch x)' "switch-maybe-reminders" "switch-on-" "switch-on-reminders "; do
  fresh
  switch_env $'REMINDERS=off\n'
  ask "$id1" "$job"
  run > /dev/null
  check "$job is refused and changes nothing" "REMINDERS=off" "$(flat_env)"
  check "with no docker" "" "$(cat "$work/docker.log")"
done

for env in $'REMINDERS=off\nREMINDERS=off\n' $'MODES=on\n' $'REMINDERS=off # off for now\n' $'REMINDERS=no\n' $'REMINDERS=off\nREMINDERS="on"\n' $'REMINDERS=off\n  REMINDERS = on\n' $'REMINDERS=off\r\n'; do
  fresh
  switch_env "$env"
  ask "$id1" switch-on-reminders
  run > /dev/null
  check "api/.env without exactly one REMINDERS=on or off line is left as it was" "$(printf '%s' "$env" | tr '\n' ' ' | sed 's/ $//')" "$(flat_env)"
  check_has "and the chore says why" "doesn't have exactly one REMINDERS=on or REMINDERS=off line" "$(cat "$work/hub/chores/results/$id1.out")"
done

fresh
mkdir -p "$work/hub/api"
printf 'REMINDERS=off\n' > "$work/elsewhere.env"
ln -s "$work/elsewhere.env" "$work/hub/api/.env"
ask "$id1" switch-on-reminders
run > /dev/null
check "api/.env as a link isn't followed" "REMINDERS=off" "$(cat "$work/elsewhere.env")"
check_has "and the chore says so" "api/.env isn't a plain file" "$(cat "$work/hub/chores/results/$id1.out")"

for env in $'CHORES=on\nSWITCHES=off\nTALK=off\n' $'CHORES=off\nSWITCHES=on\nTALK=off\n' $'TALK=off\n' $'CHORES=on\nSWITCHES=on # yes\nTALK=off\n' $'CHORES="on"\nSWITCHES=on\nTALK=off\n'; do
  fresh
  raw_env "$env"
  ask "$id1" switch-on-talk
  run > /dev/null
  check "without CHORES=on and SWITCHES=on written plainly in api/.env, the runner itself refuses a switch chore" "$(printf '%s' "$env" | tr '\n' ' ')" "$(tr '\n' ' ' < "$work/hub/api/.env")"
  check "and docker isn't touched" "" "$(cat "$work/docker.log")"
  check_has "saying why" "api/.env doesn't say CHORES=on and SWITCHES=on, so switch chores are off" "$(cat "$work/hub/chores/results/$id1.out")"
done

fresh
raw_env $'CHORES=on\nSWITCHES=on\n'
ask "$id1" switch-off-switches
run > /dev/null
check "switching SWITCHES itself off works, since it's on beforehand" "CHORES=on SWITCHES=off" "$(tr '\n' ' ' < "$work/hub/api/.env" | sed 's/ $//')"

fresh
switch_env $'TRAIN_ALERTS=off\nALERTS=off\nEXPIRY_ALERTS=off\n'
ask "$id1" switch-on-alerts
run > /dev/null
check "a switch whose name ends another's changes only its own line" "TRAIN_ALERTS=off ALERTS=on EXPIRY_ALERTS=off" "$(flat_env)"

fresh
switch_env $'REMINDERS=off\n'
chmod 640 "$work/hub/api/.env"
ask "$id1" switch-on-reminders
run > /dev/null
check "api/.env keeps whatever permissions it had" "640" "$(stat -c %a "$work/hub/api/.env")"
check "and no copy of it, the runner's or sed's, is left beside it" "" "$(ls -A "$work/hub/api" | grep -v '^\.env$')"

check "both restarts have a 2-minute limit" "2" "$(grep -c 'timeout --kill-after=15 120 docker compose --ansi never up -d --no-deps --force-recreate --wait api' "$script")"
check "and nothing writes api/.env with sed -i, which leaves its own copy if killed" "0" "$(grep -c 'sed -i' "$script")"

hub_switches=$(sed -n '/^export const switchKeys/,/^};/p' "$here/../api/src/config.ts" | sed -n -E 's/^  [a-zA-Z]+: "([A-Z_]+)",$/\1/p' | tr '\n' ' ' | sed 's/ $//')
check "the hub has its switch list" "23" "$(wc -w <<< "$hub_switches" | tr -d ' ')"
check "and the runner's list is the same, in the same order" "$hub_switches" "$(sed -n -E 's/^switches="([A-Z_ ]+)"$/\1/p' "$script")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
