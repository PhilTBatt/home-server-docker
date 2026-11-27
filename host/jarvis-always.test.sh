#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/jarvis-always.sh"
unit="$here/home-hub-jarvis@.service"
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
cat > "$work/bin/tmux" << 'FAKE'
#!/bin/bash
echo "tmux $*" >> "$LOG"
case "$*" in
  *has-session*) [ -e "$WORK/running" ]; exit ;;
  *new-session*)
    [ -n "${TMUX_FAIL:-}" ] && exit 1
    touch "$WORK/running"
    ;;
  *send-keys*) [ "${TMUX_STOPS:-yes}" = yes ] && rm -f "$WORK/running"; exit 0 ;;
  *kill-session*) rm -f "$WORK/running" ;;
esac
exit 0
FAKE
cat > "$work/bin/docker" << 'FAKE'
#!/bin/bash
echo "docker $*" >> "$LOG"
[ "$1" = ps ] && printf '%s' "${DOCKER_PS:-}"
exit 0
FAKE
cat > "$work/bin/sleep" << 'FAKE'
#!/bin/bash
echo "sleep $*" >> "$LOG"
FAKE
cat > "$work/bin/date" << 'FAKE'
#!/bin/bash
now=$(cat "$WORK/clock" 2> /dev/null || echo 1000)
echo "$((now + ${DATE_STEP:-1}))" > "$WORK/clock"
echo "$now"
FAKE
chmod +x "$work/bin/"*

home="$work/home"
repo="$home/docker"
stop_file="$home/.local/state/home-hub/jarvis-stop"

fresh() {
  rm -rf "$home" "$work/running" "$work/clock" "$work/log" "$work/runs"
  mkdir -p "$repo/host" "$repo/jarvis"
  touch "$work/log"
  printf 'JARVIS_EARS=wake\n' > "$repo/jarvis/.env"
  cat > "$repo/host/jarvis.sh" << 'FAKE'
runs=$(($(cat "$WORK/runs" 2> /dev/null || echo 0) + 1))
echo "$runs" > "$WORK/runs"
echo "jarvis.sh in $PWD" >> "$LOG"
[ "$runs" -ge "${STOP_AFTER:-1}" ] && mkdir -p "$HOME/.local/state/home-hub" && touch "$HOME/.local/state/home-hub/jarvis-stop"
exit "${JARVIS_EXIT:-0}"
FAKE
  cat > "$repo/host/ears.sh" << 'FAKE'
echo "ears.sh $*" >> "$LOG"
exit "${EARS_EXIT:-0}"
FAKE
}

always() {
  env -i PATH="$work/bin:/usr/bin:/bin" HOME="$home" WORK="$work" LOG="$work/log" "$@"
}

fresh
output=$(always bash "$script" 2>&1)
check "no command is refused with how to use it" "1 Usage: home-hub-jarvis start|stop|restart|attach|status" "$? $output"
output=$(always bash "$script" begin 2>&1)
check "an unknown command is refused with how to use it" "1 Usage: home-hub-jarvis start|stop|restart|attach|status" "$? $output"

fresh
mkdir -p "$(dirname "$stop_file")" && touch "$stop_file"
output=$(always bash "$script" start 2>&1)
check "start says how to see him" "0 Jarvis is starting in tmux. See him with: home-hub-jarvis attach" "$? $output"
check "start runs one tmux command on Jarvis's own server, with 50,000 lines to scroll back through and the mouse on, before his session starts in the repo running this script" "tmux -L jarvis has-session -t jarvis|tmux -L jarvis start-server ; set-option -g history-limit 50000 ; set-option -g mouse on ; new-session -d -s jarvis -x 200 -y 50 -c $repo $(readlink -f "$script") run" "$(paste -sd'|' "$work/log")"
check "start clears an earlier stop" "no" "$([ -e "$stop_file" ] && echo yes || echo no)"

: > "$work/log"
output=$(always bash "$script" start 2>&1)
check "start leaves a running Jarvis alone" "0 Jarvis is already running. See him with: home-hub-jarvis attach" "$? $output"
check "and asks tmux nothing else" "tmux -L jarvis has-session -t jarvis" "$(cat "$work/log")"

fresh
output=$(always env HOME_HUB_DIR="$work/elsewhere" bash "$script" start 2>&1)
check "start with no repo folder says so" "1 There's no Home Hub folder at $work/elsewhere." "$? $output"
output=$(always env TMUX_FAIL=1 bash "$script" start 2>&1)
check "start says when tmux fails" "1 tmux couldn't start Jarvis's session." "$? $output"
output=$(always env HOME_HUB_DIR="$repo" bash "$script" start 2>&1)
check_has "HOME_HUB_DIR, as the unit sets it, is where his session starts" "-c $repo " "$(cat "$work/log")"

fresh
output=$(always env STOP_AFTER=3 bash "$script" run 2>&1)
check "run starts ears once, muted, then Jarvis from the repo again after each stop until told to stop" "ears.sh start|jarvis.sh in $repo|sleep 60|jarvis.sh in $repo|sleep 60|jarvis.sh in $repo" "$(paste -sd'|' "$work/log")"
check_has "it says ears starts muted and how to unmute it" "Starting ears, which always starts muted. Unmute it on the server with: bash host/ears.sh unmute" "$output"
check_has "it says why it's starting him again, and how to stop that" "Jarvis stopped (exit 0) after 1 seconds. Starting him again in 60 seconds. To stop him until home-hub-jarvis start, press Ctrl+C now." "$output"
check_has "it says when it has stopped" "Jarvis has stopped, and won't start again until: home-hub-jarvis start" "$output"

fresh
output=$(always env STOP_AFTER=2 DATE_STEP=90 JARVIS_EXIT=1 bash "$script" run 2>&1)
check "a Jarvis that ran a minute or more is started again after 5 seconds, with his exit code said" "sleep 5" "$(grep '^sleep' "$work/log")"
check_has "his exit code is shown" "Jarvis stopped (exit 1) after 90 seconds. Starting him again in 5 seconds." "$output"

fresh
printf 'JARVIS_EARS=off\n' > "$repo/jarvis/.env"
always bash "$script" run > /dev/null 2>&1
check "with JARVIS_EARS off, ears isn't started" "jarvis.sh in $repo" "$(cat "$work/log")"
rm "$repo/jarvis/.env"
: > "$work/log"
rm -f "$stop_file" "$work/runs"
always bash "$script" run > /dev/null 2>&1
check "with no jarvis/.env, ears isn't started either" "jarvis.sh in $repo" "$(cat "$work/log")"
printf 'JARVIS_EARS="push" # by hand\n' > "$repo/jarvis/.env"
: > "$work/log"
rm -f "$stop_file" "$work/runs"
output=$(always env EARS_EXIT=1 bash "$script" run 2>&1)
check "a quoted setting is read like jarvis.sh reads it, and ears failing doesn't stop Jarvis starting" "ears.sh start|jarvis.sh in $repo" "$(paste -sd'|' "$work/log")"
check_has "it says ears didn't start" "Ears didn't start, so Jarvis will say what he can't do without it." "$output"

fresh
output=$(always bash "$script" stop 2>&1)
check "stop with nothing running says so" "0 Jarvis isn't running." "$? $output"
check "and still leaves the stop for a loop that's starting" "yes" "$([ -e "$stop_file" ] && echo yes || echo no)"

fresh
touch "$work/running"
output=$(always bash "$script" stop 2>&1)
check "stop sends Ctrl+C to Jarvis and waits for his session to end" "0 Jarvis has stopped." "$? $output"
check "it leaves scrolling first, since keys go to tmux there, then presses Ctrl+C in his session, kills nothing, and stops no container" "tmux -L jarvis has-session -t jarvis|tmux -L jarvis copy-mode -q -t jarvis|tmux -L jarvis send-keys -t jarvis C-c|tmux -L jarvis has-session -t jarvis" "$(paste -sd'|' "$work/log")"
check "and the loop won't start him again" "yes" "$([ -e "$stop_file" ] && echo yes || echo no)"

fresh
touch "$work/running"
output=$(always env TMUX_STOPS=no DOCKER_PS=abc123 bash "$script" stop 2>&1)
check "a Jarvis that doesn't stop in 30 seconds has his session closed" "0 Jarvis didn't stop within 30 seconds, so his tmux session was closed." "$? $output"
check "it waited a second at a time, 30 times" "30" "$(grep -c '^sleep 1$' "$work/log")"
check_has "then closed his session" "tmux -L jarvis kill-session -t jarvis" "$(cat "$work/log")"
check_has "and looked for his container only, by this repo's own labels" "docker ps -q --filter label=com.docker.compose.service=jarvis --filter label=com.docker.compose.oneoff=True --filter label=com.docker.compose.project.working_dir=$repo" "$(cat "$work/log")"
check_has "and stopped what it found" "docker stop abc123" "$(cat "$work/log")"
fresh
touch "$work/running"
always env TMUX_STOPS=no bash "$script" stop > /dev/null 2>&1
check_lacks "with no container left, nothing is stopped" "docker stop" "$(cat "$work/log")"

fresh
touch "$work/running"
output=$(always bash "$script" restart 2>&1)
check "restart stops him, then starts him again" "0 Jarvis has stopped.|Jarvis is starting in tmux. See him with: home-hub-jarvis attach" "$? $(paste -sd'|' <<< "$output")"
check "and the new loop isn't told to stop" "no" "$([ -e "$stop_file" ] && echo yes || echo no)"

fresh
output=$(always bash "$script" attach 2>&1)
check "attach with nothing running says how to start him" "1 Jarvis isn't running. Start him with: home-hub-jarvis start" "$? $output"
touch "$work/running"
always bash "$script" attach > /dev/null 2>&1
check_has "attach joins his session" "tmux -L jarvis attach -t jarvis" "$(cat "$work/log")"
check "status says he's running" "Jarvis is running. See him with: home-hub-jarvis attach" "$(always bash "$script" status)"
rm "$work/running"
check "status says he isn't" "Jarvis isn't running." "$(always bash "$script" status)"

contents=$(cat "$unit")
check_has "the unit runs as the user it's enabled for" "User=%i" "$contents"
check_has "and never gains privileges" "NoNewPrivileges=yes" "$contents"
check_has "it finds the repo under that user's home, not %h" "Environment=HOME_HUB_DIR=/home/%i/docker" "$contents"
check_lacks "it never uses %h, which is root's home in a system unit" "%h" "$contents"
check_has "it starts from the installed copy" "ExecStart=/usr/local/bin/home-hub-jarvis start" "$contents"
check_has "and stops with it" "ExecStop=/usr/local/bin/home-hub-jarvis stop" "$contents"
check_has "it stays active after starting his session" "RemainAfterExit=yes" "$contents"
check_has "it waits for Docker" "After=docker.service network-online.target" "$contents"
check_has "it starts at boot" "WantedBy=multi-user.target" "$contents"
check_lacks "it shares no temporary folder of its own, so tmux's socket is where attach looks" "PrivateTmp" "$contents"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
