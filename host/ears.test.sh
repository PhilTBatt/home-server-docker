#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

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

fresh() {
  rm -rf "$work/repo"
  mkdir -p "$work/repo/host"
  cp "$here/ears.sh" "$work/repo/host/ears.sh"
}

run() {
  (cd "$work/repo" && bash host/ears.sh "$@" < /dev/null 2>&1)
}

switch="$work/repo/ears/switch/mute"

fresh
output=$(run mute)
status=$?
check "mute writes muted to ears/switch/mute, making the folder" "muted" "$(cat "$switch")"
check "and succeeds" "0" "$status"
check_has "saying what it means" "Muted. Ears ends any recording within about a second, and records nothing until it's unmuted." "$output"
check "the file can be read by ears's own user, and only written by its owner" "644" "$(stat -c %a "$switch")"
check "nothing else is left in the folder" "mute" "$(ls -A "$work/repo/ears/switch")"

fresh
output=$(run unmute)
status=$?
check "unmute writes unmuted and an id" "1" "$(grep -c '^unmuted [0-9]\{19\}$' "$switch")"
check "and succeeds" "0" "$status"
check_has "saying a restart mutes it again" "Unmuted. Ears notices within a second. If ears restarts, it comes back muted and needs this again." "$output"
check "it's one line" "1" "$(wc -l < "$switch")"
first=$(cat "$switch")
sleep 0.01
run unmute > /dev/null
check "each unmute writes a new id, so ears can tell it from one that was there when it started" "different" "$([ "$first" != "$(cat "$switch")" ] && echo different || echo same)"
run mute > /dev/null
check "mute after unmute" "muted" "$(cat "$switch")"
run mute > /dev/null
check "mute twice" "muted" "$(cat "$switch")"
check "nothing else is left in the folder" "mute" "$(ls -A "$work/repo/ears/switch")"

fresh
mkdir -p "$work/repo/ears/switch"
echo "unmuted 1" > "$switch"
ino_before=$(stat -c %i "$switch")
run mute > /dev/null
check "the file is replaced in one step, never rewritten in place, so ears can't read half of it" "replaced" "$([ "$(stat -c %i "$switch")" != "$ino_before" ] && echo replaced || echo "rewritten in place")"

for args in "" "on" "off" "Mute" "mute now" "unmute extra" "--help" "status"; do
  fresh
  read -r -a words <<< "$args"
  output=$(run "${words[@]}")
  check "an unknown or missing argument is refused: '$args'" "1" "$?"
  check "and nothing is written: '$args'" "no folder" "$([ -e "$work/repo/ears" ] && echo folder || echo "no folder")"
  check_has "with the usage: '$args'" "Usage: bash host/ears.sh mute|unmute" "$output"
done

if [ "$(id -u)" != 0 ]; then
  fresh
  mkdir -p "$work/repo/ears/switch"
  echo muted > "$switch"
  chmod 555 "$work/repo/ears/switch"
  output=$(run unmute)
  check "if the folder can't be written, unmute says so and fails" "1" "$?"
  check "and the file is as it was" "muted" "$(cat "$switch")"
  check_has "saying nothing changed" "nothing changed" "$output"
  echo "unmuted 5" > "$switch"
  output=$(run mute)
  check "if the folder can't be written, mute fails too, since the file can't be removed either" "1" "$?"
  check_has "saying ears may still be unmuted, and how to stop it" "Couldn't write or remove ears/switch/mute, so ears may still be unmuted. Stop it with: docker compose stop ears" "$output"
  chmod 755 "$work/repo/ears/switch"
  fresh
  mkdir -p "$work/repo/ears"
  chmod 555 "$work/repo/ears"
  output=$(run mute)
  check "if the switch's folder can't be made, mute fails" "1" "$?"
  check_has "saying so, and that ears won't start without it" "Couldn't make the folder ears/switch, so nothing was written. Ears won't start without it." "$output"
  check "rather than saying the switch was removed" "0" "$(grep -c "removed instead" <<< "$output")"
  chmod 755 "$work/repo/ears"
fi

fresh
mkdir -p "$work/bin"
printf '#!/bin/bash\nexit 1\n' > "$work/bin/mv"
chmod +x "$work/bin/mv"
mkdir -p "$work/repo/ears/switch"
echo muted > "$switch"
output=$(cd "$work/repo" && PATH="$work/bin:$PATH" bash host/ears.sh unmute 2>&1)
check "if the file can't be put in place, it fails" "1" "$?"
check "and leaves no half-written file behind, and the switch as it was" "mute|muted" "$(ls -A "$work/repo/ears/switch" | tr '\n' ' ' | sed 's/ $//')|$(cat "$switch")"
check_has "saying nothing changed" "Couldn't write ears/switch/mute, so nothing changed." "$output"
echo "unmuted 5" > "$switch"
output=$(cd "$work/repo" && PATH="$work/bin:$PATH" bash host/ears.sh mute 2>&1)
check "if a mute can't be written, as on a full disk, the switch is removed instead, which counts as muted" "0|gone|" "$?|$([ -e "$switch" ] && echo there || echo gone)|$(ls -A "$work/repo/ears/switch")"
check_has "saying so" "Couldn't write ears/switch/mute, so it was removed instead. Ears counts a missing switch as muted" "$output"
printf '#!/bin/bash\nexit 1\n' > "$work/bin/rm"
chmod +x "$work/bin/rm"
echo "unmuted 6" > "$switch"
output=$(cd "$work/repo" && PATH="$work/bin:$PATH" bash host/ears.sh mute 2>&1)
check "if a mute can be neither written nor removed, it fails" "1" "$?"
check "and the switch is as it was" "unmuted 6" "$(cat "$switch")"
check_has "saying ears may still be unmuted, and how to stop it" "Couldn't write or remove ears/switch/mute, so ears may still be unmuted. Stop it with: docker compose stop ears" "$output"
command rm -f "$work/repo/ears/switch/".mute.*
rm -rf "$work/bin"

fresh
cd "$work" || exit 1
output=$(bash "$work/repo/host/ears.sh" mute 2>&1)
check "it works from any folder, writing into the repo it's in" "muted" "$(cat "$switch")"
cd "$here" || exit 1

compose_file="$here/../docker-compose.yaml"
ears=$(awk '/^  ears:$/ {on=1; next} on && /^  [a-z]/ {on=0} on && /^[a-z]/ {on=0} on' <(sed -n '/^services:$/,/^networks:$/p' "$compose_file"))
check "ears is built from its own folder" "    build: ./ears" "$(grep '^    build:' <<< "$ears")"
check "ears publishes no port" "0" "$(grep -c -e 'ports:' -e 'expose:' -e 'network_mode' <<< "$ears")"
check "ears gets no devices, so no microphone yet, and no extra rights" "0" "$(grep -c -e 'devices:' -e 'privileged' -e 'cap_add' -e 'docker.sock' -e 'group_add' -e 'user:' -e 'pid:' -e 'ipc:' -e 'security_opt' -e 'extra_hosts' <<< "$ears")"
check "its settings and token come from its own git-ignored file" "    env_file:
      - ./ears/.env" "$(grep -A1 '^    env_file:$' <<< "$ears")"
check "its one folder is the switch, read-only, and Docker won't make it if it's missing" "    volumes:
      - type: bind
        source: ./ears/switch
        target: /switch
        read_only: true
        bind:
          create_host_path: false" "$(grep -A6 '^    volumes:$' <<< "$ears")"
check "and it has no other" "1" "$(grep -c -e 'source:' -e '^      - [./~][^ ]*:' <<< "$ears")"
check "ears is on its own network and no other" "    networks:
      - ears" "$(grep -A2 '^    networks:$' <<< "$ears" | grep -e 'networks:' -e '^      - ')"
check "ears only starts when it's named" "    profiles:
      - ears" "$(grep -A1 '^    profiles:$' <<< "$ears")"
check "ears never restarts by itself" "0" "$(grep -c 'restart:' <<< "$ears")"
check "ears has a memory limit" "1" "$(grep -c '^    mem_limit: [0-9]*m$' <<< "$ears")"
check "its healthcheck asks its own state with its own helper, which reads the token itself, so it's never on a command line" '    healthcheck:
      test: ["CMD", "node", "/app/dist/ask.js", "state"]
      interval: 1m
      timeout: 5s
      retries: 3
      start_period: 30s
      start_interval: 2s' "$(grep -A6 '^    healthcheck:$' <<< "$ears")"
check "the port is the one ears listens on" "1" "$(grep -c '^export const earsPort = 8090;$' "$here/../ears/src/server.ts")"
check "and the switch is where ears reads it" "1" "$(grep -c '^export const switchFile = "/switch/mute";$' "$here/../ears/src/mute.ts")"
networks=$(sed -n '/^networks:$/,$p' "$compose_file")
check "the ears network has no way out, and the server has no address on it" "  ears:
    internal: true
    driver_opts:
      com.docker.network.bridge.gateway_mode_ipv4: isolated" "$(grep -A3 '^  ears:$' <<< "$networks")"
check "and nothing else is set on it" "0" "$(grep -A4 '^  ears:$' <<< "$networks" | tail -n +5 | grep -c '^    ')"
others=$(awk '/^  ears:$/ {skip=1; next} skip && /^  [a-z]/ {skip=0} skip && /^[a-z]/ {skip=0} !skip' <(sed -n '/^services:$/,/^networks:$/p' "$compose_file"))
check "nothing else is on the ears network yet" "0" "$(grep -c -e '- ears$' -e 'ears:' <<< "$others")"
check "the sound file doesn't put Jarvis on it" "0" "$(grep -c 'ears' "$here/../docker-compose.sound.yaml")"
check "the switch, ears's settings and its build are git-ignored" "ears/node_modules/ ears/dist/ ears/switch/ " "$(grep '^ears/' "$here/../.gitignore" | tr '\n' ' ')"
check "and .env files are too" "1" "$(grep -c '^\.env$' "$here/../.gitignore")"
check "the image runs as node, not root" "USER node" "$(grep '^USER' "$here/../ears/Dockerfile")"
check "the image doesn't get the test files" "1" "$(grep -c '^\*\*/\*\.test\.ts$' "$here/../ears/.dockerignore")"
check "and needs nothing installed beyond Node itself" "0" "$(grep -c -e 'apk' -e 'apt' -e 'omit=dev' "$here/../ears/Dockerfile")"
check "ears has no packages it runs with, only the two to build and test it" "0" "$(grep -c '"dependencies"' "$here/../ears/package.json")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
