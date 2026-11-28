#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/morning-mic.sh"
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

mkdir -p "$work/bin"
cat > "$work/bin/curl" << 'FAKE'
#!/bin/bash
echo "curl $*" >> "$LOG"
timeout 2 cat > "$WORK/curl-stdin"
[ -n "${CURL_FAIL:-}" ] && exit 7
printf '%s' "${MORNING_REPLY:-}"
FAKE
cat > "$work/bin/docker" << 'FAKE'
#!/bin/bash
echo "docker $*" >> "$LOG"
[ -n "${DOCKER_SLEEP:-}" ] && exec sleep "$DOCKER_SLEEP"
case "$*" in
  "compose ps --status running --quiet ears") printf '%s' "${EARS_PS-abc123}" ;;
  "compose exec -T ears node dist/ask.js health") printf '%s\n' "${EARS_HEALTH:-200 muted}" ;;
esac
exit 0
FAKE
cat > "$work/bin/date" << 'FAKE'
#!/bin/bash
echo "${DATE_NS:-1764488700000000000}"
FAKE
chmod +x "$work/bin/"*

home="$work/home"
repo="$home/docker"
state="$home/.local/state/home-hub/morning-mic"

reply() {
  printf '{"day":"%s","at":"06:45","upAt":null,"by":null,"snoozedUntil":null,"speakSlot":%s,"phase":"%s"}' "${2:-2026-11-30}" "$([ "$1" = speaking ] && echo 2 || echo null)" "$1"
}

fresh() {
  rm -rf "$home"
  mkdir -p "$repo/api" "$repo/ears/switch"
  printf 'QBIT_API_KEY=x\nAPI_TOKEN=test-token-123\n' > "$repo/api/.env"
  printf '%s\n' "${1:-muted}" > "$repo/ears/switch/mute"
  : > "$work/log"
}

run() {
  local phase=$1 day=${2:-2026-11-30}
  out=$(cd "$work" && env -u HOME_HUB_DIR HOME="$home" PATH="$work/bin:$PATH" LOG="$work/log" WORK="$work" MORNING_REPLY="$(reply "$phase" "$day")" bash "$script" 2>&1)
  code=$?
  switch=$(cat "$repo/ears/switch/mute" 2> /dev/null)
  held=$(cat "$state" 2> /dev/null)
}

for phase in before early; do
  fresh
  run "$phase"
  check "$phase the morning nothing is written" "muted" "$switch"
  check "$phase the morning nothing is kept" "" "$held"
  check "and nothing is said" "" "$out"
  check "and docker isn't asked" "0" "$(grep -c '^docker' "$work/log")"
done

fresh
run brightening
check "while the wall brightens, the mic stays muted: it opens at wake-up time" "muted" "$switch"
check "and nothing is kept" "" "$held"
run sound
check "and while it sounds" "muted" "$switch"

fresh
run speaking
check "at wake-up time with ears muted, the mic opens with a switch of the morning's own" "unmuted morning-1764488700000000000" "$switch"
check "and the morning keeps what it wrote, for today" "2026-11-30 open unmuted morning-1764488700000000000" "$held"
check "and says so" "Opened the room mic for the morning." "$out"
check "the switch is readable by ears, like ears.sh writes it" "644" "$(stat -c %a "$repo/ears/switch/mute")"
check "no half-written switch is left behind" "" "$(ls -A "$repo/ears/switch" | grep -v '^mute$')"
check "it ran from the Home Hub folder" "0" "$code"
check_has "the hub was asked for the morning by the API's own address" "curl -sS --max-time 5 -H @- -H Host: api.home http://localhost/morning" "$(cat "$work/log")"
check_lacks "the token is never on curl's command line" "test-token-123" "$(cat "$work/log")"
check "it goes in on curl's input, as a header" "Authorization: Bearer test-token-123" "$(cat "$work/curl-stdin")"
check_lacks "and is never printed" "test-token-123" "$out"

: > "$work/log"
run speaking
run snoozed
check "while Jarvis keeps saying morning or is put off, nothing changes" "unmuted morning-1764488700000000000" "$switch"
check "and nothing is said" "" "$out"
check "ears isn't asked again" "0" "$(grep -c 'exec' "$work/log")"

run up
check "once he's up, the mic is muted again" "muted" "$switch"
check "and the note is gone" "" "$held"
check "and it says so" "Muted the room mic again after the morning." "$out"
run up
run over
check "after that nothing more happens that morning" "muted" "$switch"
check "and nothing is said" "" "$out"

fresh
run speaking
run over
check "when the morning runs out without I'm up, the mic is muted again too" "muted" "$switch"

fresh "unmuted 1764400000000000000"
EARS_HEALTH="200 idle"
export EARS_HEALTH
run speaking
check "if Phil had the mic listening before the morning, it's left as it is" "unmuted 1764400000000000000" "$switch"
check "and the morning notes that it's left it, for today" "2026-11-30 left" "$held"
check "and says so" "The room mic was already listening, so the morning leaves it as it is." "$out"
run speaking
check "it says so once, not every minute" "" "$out"
check "and doesn't ask ears again" "1" "$(grep -c 'exec' "$work/log")"
run up
run over
check "and after the morning it's still as he had it" "unmuted 1764400000000000000" "$switch"
for state_now in recording working; do
  fresh "unmuted 1764400000000000000"
  EARS_HEALTH="200 $state_now"
  run speaking
  check "ears $state_now counts as listening" "unmuted 1764400000000000000" "$switch"
done
unset EARS_HEALTH

fresh "unmuted 1764400000000000000"
run speaking
check "a switch that says unmuted while ears says muted (it muted itself, or restarted) is opened again for the morning" "unmuted morning-1764488700000000000" "$switch"
run up
check "and muted after, since muted is how it was" "muted" "$switch"

fresh
EARS_HEALTH="200 failed"
export EARS_HEALTH
run speaking
check "ears that failed is opened too, which starts it again" "unmuted morning-1764488700000000000" "$switch"
unset EARS_HEALTH

fresh
run speaking
printf 'muted\n' > "$repo/ears/switch/mute"
run speaking
check "if Phil mutes it by hand during the morning, the morning leaves it alone" "2026-11-30 left" "$held"
check "and says so" "The room mic was changed by hand during the morning, so the morning leaves it as it is." "$out"
printf 'unmuted 1764499999000000000\n' > "$repo/ears/switch/mute"
run up
check "even if he unmutes it again later, it's his" "unmuted 1764499999000000000" "$switch"

fresh
run speaking
printf 'unmuted 1764499999000000000\n' > "$repo/ears/switch/mute"
run up
check "a switch changed by hand between two checks isn't muted at the end" "unmuted 1764499999000000000" "$switch"
check "and the morning remembers it's his, for today" "2026-11-30 left" "$held"
check "and it says why" "The room mic was changed by hand during the morning, so it's left as it is." "$out"

unreachable() {
  out=$(cd "$work" && env -u HOME_HUB_DIR HOME="$home" PATH="$work/bin:$PATH" LOG="$work/log" WORK="$work" CURL_FAIL=1 bash "$script" 2>&1)
  switch=$(cat "$repo/ears/switch/mute" 2> /dev/null)
  held=$(cat "$state" 2> /dev/null)
}

fresh
run speaking
EARS_HEALTH="200 idle"
export EARS_HEALTH
unreachable
check "if the hub can't be asked while the mic is listening, it's muted again, to be safe" "muted" "$switch"
check "and the morning notes that it paused it" "2026-11-30 paused" "$held"
check "and says so" "Couldn't ask the hub about the morning, so the room mic is muted for now, and opened again if the morning's still on." "$out"
unset EARS_HEALTH
run speaking
check "and it's opened again once the hub answers and it's still morning" "unmuted morning-1764488700000000000" "$switch"
check "with a new note" "2026-11-30 open unmuted morning-1764488700000000000" "$held"
run up
check "and muted after" "muted" "$switch"

fresh
run speaking
EARS_HEALTH="200 idle"
export EARS_HEALTH
unreachable
unset EARS_HEALTH
run up
check "a paused morning that's over when the hub answers again stays muted" "muted" "$switch"
check "and nothing more is said" "" "$out"

fresh
run speaking
unreachable
check "if the hub can't be asked after ears muted itself (stop listening), the switch is muted too" "muted" "$switch"
check "and the morning leaves it, for today" "2026-11-30 left" "$held"
check "saying it's muted for now" "Couldn't ask the hub about the morning, so the room mic is muted for now." "$out"
run speaking
check "so it isn't opened again when the hub answers" "muted" "$switch"
check "and nothing is said" "" "$out"

fresh
run speaking
DOCKER_SLEEP=30
export DOCKER_SLEEP
started=$(/usr/bin/date +%s)
unreachable
took=$(( $(/usr/bin/date +%s) - started ))
unset DOCKER_SLEEP
check "if the hub can't be asked and docker hangs, the mic is still muted, without waiting long on docker" "muted" "$switch"
check "and it's left muted for the day, since ears couldn't say it was listening" "2026-11-30 left" "$held"
check "well inside the unit's 45 seconds" "yes" "$([ "$took" -le 12 ] && echo yes || echo "no, $took seconds")"
check_has "the service gives a run 45 seconds" "TimeoutStartSec=45s" "$(cat "$here/home-hub-morning-mic@.service")"

fresh
run speaking
EARS_PS=""
export EARS_PS
unreachable
unset EARS_PS
check "with ears stopped as well, it's muted and left, never reopened" "2026-11-30 left" "$held"

fresh
run speaking
printf 'muted\n' > "$repo/ears/switch/mute"
EARS_HEALTH="200 muted"
export EARS_HEALTH
unreachable
unset EARS_HEALTH
check "a mic Phil muted by hand is left as it is when the hub can't be asked" "muted" "$switch"
check "and the morning remembers it's his, for today" "2026-11-30 left" "$held"
check "and says so" "The room mic was changed by hand during the morning, so it's left as it is." "$out"
run speaking
check "so it isn't reopened when the hub answers a minute later" "muted" "$switch"
check "quietly" "" "$out"

fresh
run speaking
out=$(cd "$work" && env -u HOME_HUB_DIR HOME="$home" PATH="$work/bin:$PATH" LOG="$work/log" WORK="$work" MORNING_REPLY='{"error":"The morning is switched off"}' bash "$script" 2>&1)
check "the morning switched off at the hub mutes it again too" "muted" "$(cat "$repo/ears/switch/mute")"

fresh
run speaking
run before 2026-12-01
check "a note left from another day is put right the next morning" "muted" "$switch"
check "and goes" "" "$held"

fresh
EARS_PS=""
export EARS_PS
run speaking
check "with ears not running there's nothing to open" "muted" "$switch"
check "and nothing kept, so it's tried again next minute" "" "$held"
check "quietly" "" "$out"
unset EARS_PS

for health in "ears is starting" "x200 muted" "200 muted now" "200 muted"$'\n'"200 idle" "201 muted" "200 MUTED"; do
  fresh
  EARS_HEALTH="$health"
  export EARS_HEALTH
  run speaking
  check "if ears doesn't plainly say it's muted ($health), the mic isn't opened" "muted" "$switch"
  check_has "and it says so" "Ears didn't say whether it's muted" "$out"
  unset EARS_HEALTH
done

fresh
printf 'QBIT_API_KEY=x\n' > "$repo/api/.env"
run speaking
check "without the API's token the hub can't be asked, so nothing opens" "muted" "$switch"

fresh
rm -rf "$repo/ears/switch"
run speaking
check "if the switch can't be written, nothing is kept" "" "$held"
check_has "and it says so" "Couldn't write ears/switch/mute" "$out"
check "and it fails, so systemd shows it" "1" "$code"

fresh
out=$(cd "$work" && env -u HOME_HUB_DIR HOME="$home" PATH="$work/bin:$PATH" LOG="$work/log" WORK="$work" MORNING_REPLY='{"phase":"speaking; touch /tmp/x","day":"2026-11-30"}' bash "$script" 2>&1)
check "a reply it can't read opens nothing" "muted" "$(cat "$repo/ears/switch/mute")"

fresh
out=$(env HOME="$home" HOME_HUB_DIR="$work/nowhere" PATH="$work/bin:$PATH" LOG="$work/log" WORK="$work" bash "$script" 2>&1)
check "with no Home Hub folder it says so and stops" "There's no Home Hub folder at $work/nowhere." "$out"

unit="$here/home-hub-morning-mic@.service"
timer="$here/home-hub-morning-mic@.timer"
check_has "the service runs as Phil's own user" "User=%i" "$(cat "$unit")"
check_has "with no way to gain privileges" "NoNewPrivileges=yes" "$(cat "$unit")"
check_has "from the installed copy" "ExecStart=/usr/local/bin/home-hub-morning-mic" "$(cat "$unit")"
check_has "in his Home Hub folder, never by %h" "Environment=HOME_HUB_DIR=/home/%i/docker" "$(cat "$unit")"
check_has "the timer runs every minute, only from 03:00 to 12:59, London time" "OnCalendar=*-*-* 03..12:*:00 Europe/London" "$(cat "$timer")"
check_has "on the minute" "AccuracySec=1s" "$(cat "$timer")"
check_lacks "and never as root" "User=root" "$(cat "$unit")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
