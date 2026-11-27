#!/bin/bash

set -u

script="$(cd "$(dirname "$0")" && pwd)/hub-update.sh"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

mkdir "$work/bin"
cat > "$work/bin/docker" <<'FAKE'
#!/bin/bash
echo "docker $*" >> "$DOCKER_LOG"
if [ -n "${DOCKER_FAIL:-}" ] && [[ "$*" == *"$DOCKER_FAIL"* ]]; then exit 1; fi
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

fresh_repos() {
  rm -rf "$work/origin.git" "$work/laptop" "$work/server" "$work/docker.log"
  touch "$work/docker.log"
  git init -q --bare -b main "$work/origin.git"
  git clone -q "$work/origin.git" "$work/laptop" 2>/dev/null
  mkdir -p "$work/laptop/host" "$work/laptop/api" "$work/laptop/mcp" "$work/laptop/jarvis/src"
  cp "$script" "$work/laptop/host/hub-update.sh"
  echo one > "$work/laptop/api/server.ts"
  echo one > "$work/laptop/mcp/server.ts"
  echo one > "$work/laptop/jarvis/src/chat.ts"
  echo one > "$work/laptop/jarvis/package-lock.json"
  echo one > "$work/laptop/jarvis/package.json"
  echo one > "$work/laptop/docker-compose.yaml"
  echo one > "$work/laptop/docker-compose.sound.yaml"
  echo one > "$work/laptop/jarvis/Dockerfile"
  mkdir -p "$work/laptop/caddy"
  echo one > "$work/laptop/caddy/Caddyfile"
  git -C "$work/laptop" add -A
  git -C "$work/laptop" commit -q -m start
  git -C "$work/laptop" push -q -u origin main 2>/dev/null
  git clone -q "$work/origin.git" "$work/server" 2>/dev/null
}

change() {
  for file in "$@"; do echo two >> "$work/laptop/$file"; done
  git -C "$work/laptop" commit -q -am change
  git -C "$work/laptop" push -q 2>/dev/null
}

update() {
  (cd "$work/server" && PATH="$work/bin:$PATH" DOCKER_LOG="$work/docker.log" bash host/hub-update.sh "$@" < /dev/null 2>&1)
}

in_node() {
  echo "docker run --rm -u node -v $work/server/$1:/app -w /app node:26-alpine npm $2"
}

fresh_repos
change mcp/server.ts
output=$(update)
check "a change in mcp/ rebuilds and tests the copy Jarvis runs, then Claude Code's MCP image" \
  "$(in_node mcp ci)
$(in_node mcp test)
docker compose build mcp" "$(cat "$work/docker.log")"
check_has "the steps are listed before they run" "  $(in_node mcp test)" "$output"

fresh_repos
change jarvis/src/chat.ts
output=$(update)
check "a change to Jarvis's code alone runs nothing, since he builds himself when he starts" "" "$(cat "$work/docker.log")"
check_has "and says so" "Nothing needs rebuilding." "$output"

fresh_repos
change jarvis/package.json
update > /dev/null
check "a change to Jarvis's package.json alone runs nothing, since only the lock file says what npm ci installs" "" "$(cat "$work/docker.log")"

fresh_repos
change jarvis/Dockerfile
update > /dev/null
check "a change to Jarvis's sound image runs nothing, since host/jarvis.sh builds it each time it's needed" "" "$(cat "$work/docker.log")"

fresh_repos
change docker-compose.sound.yaml
update > /dev/null
check "a change to the sound file runs nothing, since only host/jarvis.sh uses it" "" "$(cat "$work/docker.log")"

fresh_repos
change jarvis/package-lock.json
update > /dev/null
check "a change to Jarvis's packages reinstalls them, then runs the engine check" \
  "$(in_node jarvis ci)
$(in_node jarvis "run engine-check")" "$(cat "$work/docker.log")"

fresh_repos
change mcp/server.ts jarvis/package-lock.json api/server.ts docker-compose.yaml caddy/Caddyfile
update > /dev/null
check "with everything changed, each step runs once, the quick ones first" \
  "docker compose up -d
docker compose up --build --wait api
docker compose restart caddy
$(in_node mcp ci)
$(in_node mcp test)
docker compose build mcp
$(in_node jarvis ci)
$(in_node jarvis "run engine-check")" "$(cat "$work/docker.log")"

fresh_repos
change mcp/server.ts jarvis/package-lock.json
before=$(git -C "$work/server" rev-parse HEAD)
output=$(update --dry-run)
check "a dry run runs nothing" "" "$(cat "$work/docker.log")"
check "and leaves the files alone" "$before" "$(git -C "$work/server" rev-parse HEAD)"
check_has "but lists the mcp/ build" "  $(in_node mcp test)" "$output"
check_has "and the engine check" "  $(in_node jarvis "run engine-check")" "$output"

fresh_repos
change jarvis/package-lock.json
output=$(DOCKER_FAIL="npm ci" update)
status=$?
check "a failed install stops the update" "1" "$status"
check "before the engine check runs" "$(in_node jarvis ci)" "$(cat "$work/docker.log")"
check_has "and says what to run once it's fixed" "Once it's fixed, run these yourself:
  $(in_node jarvis ci)
  $(in_node jarvis "run engine-check")" "$output"

fresh_repos
mkdir -p "$work/laptop/host"
echo one > "$work/laptop/host/runner.sh"
echo one > "$work/laptop/host/home-hub-runner@.path"
echo one > "$work/laptop/host/home-hub-runner@.service"
git -C "$work/laptop" add -A
git -C "$work/laptop" commit -q -m runner
git -C "$work/laptop" push -q 2>/dev/null
output=$(update)
check "new host files are never installed with no one there to answer" "" "$(cat "$work/docker.log")"
check_has "the runner script goes to /usr/local/bin, as your user runs it" "Skipped. To install it later: sudo install host/runner.sh /usr/local/bin/home-hub-runner" "$output"
check_has "its path unit goes with the other units, readable by all" "Skipped. To install it later: sudo install -m 644 host/home-hub-runner@.path /etc/systemd/system/home-hub-runner@.path" "$output"
check_has "and its service too" "Skipped. To install it later: sudo install -m 644 host/home-hub-runner@.service /etc/systemd/system/home-hub-runner@.service" "$output"

mkdir -p "$work/bin-sudo"
cat > "$work/bin-sudo/sudo" <<'FAKE'
#!/bin/bash
echo "sudo $*" >> "$DOCKER_LOG"
exit 0
FAKE
chmod +x "$work/bin-sudo/sudo"
fresh_repos
echo one > "$work/laptop/host/home-hub-runner@.path"
git -C "$work/laptop" add -A
git -C "$work/laptop" commit -q -m runner
git -C "$work/laptop" push -q 2>/dev/null
output=$(cd "$work/server" && echo y | PATH="$work/bin-sudo:$work/bin:$PATH" DOCKER_LOG="$work/docker.log" bash host/hub-update.sh 2>&1)
check "a template path unit, once installed, is restarted for every user it's enabled for, never as the template itself" "sudo install -m 644 host/home-hub-runner@.path /etc/systemd/system/home-hub-runner@.path
sudo systemctl daemon-reload
sudo systemctl try-restart home-hub-runner@*.path" "$(cat "$work/docker.log")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
