#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

mkdir "$work/bin"
cat > "$work/bin/docker" <<'FAKE'
#!/bin/bash
echo "docker $* | card=${SOUND_CARD_NUMBER:-} group=${AUDIO_GROUP_ID:-} token=${API_TOKEN:-}" >> "$DOCKER_LOG"
if [ -n "${DOCKER_FAIL:-}" ] && [[ "$*" == *"$DOCKER_FAIL"* ]]; then exit 1; fi
if [[ "$*" == "compose ps --status running --quiet "* ]] && [[ " ${DOCKER_RUNNING:-} " == *" ${*: -1} "* ]]; then echo 0123456789ab; fi
if [ -n "${DOCKER_INT_DURING:-}" ] && [[ "$*" == *"$DOCKER_INT_DURING"* ]]; then
  kill -INT "$(cat "$SCRIPT_PID")"
  sleep 0.2
  exit "${DOCKER_INT_EXIT:-130}"
fi
if [[ "$*" == *" run --rm "* ]]; then
  if [ -n "${DOCKER_RUN_HOLD:-}" ]; then
    echo $$ > "$DOCKER_RUN_HOLD"
    exec sleep 60
  fi
  exit "${DOCKER_RUN_EXIT:-0}"
fi
exit 0
FAKE
chmod +x "$work/bin/docker"

default_int=()
if env --default-signal=INT true 2> /dev/null; then default_int=(env --default-signal=INT); fi

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

card=pci-0000:04:00.6

fresh() {
  rm -rf "$work/repo" "$work/snd" "$work/claude" "$work/hub-memory" "$work/docker.log"
  mkdir -p "$work/repo/host" "$work/repo/jarvis" "$work/repo/api" "$work/snd/by-path" "$work/claude"
  touch "$work/docker.log"
  cp "$here/jarvis.sh" "$work/repo/host/jarvis.sh"
  printf 'ANTHROPIC_API_KEY=not-a-real-key\nJARVIS_LOG=off\nJARVIS_SOUND_CARD=%s\n' "$card" > "$work/repo/jarvis/.env"
  echo "API_TOKEN=hub-test-token" > "$work/repo/api/.env"
  sound_card_at 1
}

sound_card_at() {
  touch "$work/snd/controlC$1" "$work/snd/pcmC$1D0p" "$work/snd/pcmC$1D0c"
  ln -sfn "../controlC$1" "$work/snd/by-path/$card"
}

run() {
  (cd "$work/repo" && PATH="$work/bin:$PATH" DOCKER_LOG="$work/docker.log" SOUND_DIR="$work/snd" CLAUDE_CONFIG_DIR="$work/claude" SCRIPT_PID="$work/script.pid" bash -c 'echo $$ > "$SCRIPT_PID" && exec "$@"' bash "${default_int[@]}" bash host/jarvis.sh "$@" < /dev/null 2>&1)
}

group() {
  stat -c %g "$work/snd/controlC$1"
}

sound_run="docker compose -f docker-compose.yaml -f docker-compose.sound.yaml run --rm jarvis npm run sound-test"

fresh
output=$(run sound-test)
status=$?
check "the sound test builds Jarvis's image quietly, then runs the test with the sound file added, passing the card and its group" \
  "docker build -q -t home-hub-jarvis jarvis | card= group= token=
$sound_run | card=1 group=$(group 1) token=" "$(cat "$work/docker.log")"
check "and succeeds" "0" "$status"
check_has "it says it's getting the image ready" "Getting Jarvis's sound image ready..." "$output"

other_group=$(id -G | tr ' ' '\n' | grep -vx "$(id -g)" | head -n 1)
if [ -n "$other_group" ]; then
  fresh
  chgrp "$other_group" "$work/snd/controlC1"
  run sound-test > /dev/null
  check "the group passed in is the one that owns the mixer, not its owner" "$sound_run | card=1 group=$other_group token=" "$(tail -n 1 "$work/docker.log")"
fi

fresh
rm "$work/repo/api/.env"
run sound-test > /dev/null
check "the sound test doesn't need the API token" "$sound_run | card=1 group=$(group 1) token=" "$(tail -n 1 "$work/docker.log")"

fresh
rm -f "$work/snd/controlC1" "$work/snd/pcmC1D0p"
sound_card_at 0
run sound-test > /dev/null
check "it follows the name to whichever card it leads to this boot" "$sound_run | card=0 group=$(group 0) token=" "$(tail -n 1 "$work/docker.log")"

fresh
mkdir -p "$work/snd/by-path"
touch "$work/snd/controlC12" "$work/snd/pcmC12D0p"
ln -sfn ../controlC12 "$work/snd/by-path/$card"
run sound-test > /dev/null
check "card numbers above 9 work" "$sound_run | card=12 group=$(group 12) token=" "$(tail -n 1 "$work/docker.log")"

fresh
printf 'ANTHROPIC_API_KEY=not-a-real-key\nJARVIS_SOUND_CARD="%s"  \r\n' "$card" > "$work/repo/jarvis/.env"
run sound-test > /dev/null
check "quotes, spaces and a Windows line ending around the name are ignored" "$sound_run | card=1 group=$(group 1) token=" "$(tail -n 1 "$work/docker.log")"

fresh
touch "$work/snd/controlC2" "$work/snd/pcmC2D0p"
ln -sfn ../controlC2 "$work/snd/by-path/other"
printf 'JARVIS_SOUND_CARD=other\nJARVIS_SOUND_CARD=%s\n' "$card" > "$work/repo/jarvis/.env"
run sound-test > /dev/null
check "if the name is set twice, the last one counts, as in the container" "$sound_run | card=1 group=$(group 1) token=" "$(tail -n 1 "$work/docker.log")"

fresh
printf 'ANTHROPIC_API_KEY=not-a-real-key\nJARVIS_LOG=off\n' > "$work/repo/jarvis/.env"
output=$(run sound-test)
status=$?
check "with no JARVIS_SOUND_CARD, it stops" "1" "$status"
check "before running anything" "" "$(cat "$work/docker.log")"
check_has "and says how to set it" "No JARVIS_SOUND_CARD in jarvis/.env. Set it to the speakers' name from ls /dev/snd/by-path, like pci-0000:04:00.6." "$output"

fresh
printf 'JARVIS_SOUND_CARD=\n' > "$work/repo/jarvis/.env"
output=$(run sound-test)
check "an empty JARVIS_SOUND_CARD counts as missing" "1" "$?"
check "and runs nothing" "" "$(cat "$work/docker.log")"

fresh
rm "$work/repo/jarvis/.env"
output=$(run sound-test)
check "with no jarvis/.env at all, it stops" "1" "$?"
check_has "and says what's missing" "No JARVIS_SOUND_CARD in jarvis/.env" "$output"

fresh
printf 'JARVIS_SOUND_CARD=pci-0000:00:1f.3\n' > "$work/repo/jarvis/.env"
output=$(run sound-test)
check "a name that isn't in by-path stops it" "1" "$?"
check "and runs nothing" "" "$(cat "$work/docker.log")"
check_has "naming it, and where to look" "JARVIS_SOUND_CARD is pci-0000:00:1f.3, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names." "$output"

for name in ../controlC1 by-path/x /etc/passwd "../by-path/$card"; do
  fresh
  printf 'JARVIS_SOUND_CARD=%s\n' "$name" > "$work/repo/jarvis/.env"
  output=$(run sound-test)
  check "a name with a slash in it is refused: $name" "1" "$?"
  check "and runs nothing: $name" "" "$(cat "$work/docker.log")"
done

fresh
rm "$work/snd/by-path/$card"
touch "$work/snd/by-path/$card"
output=$(run sound-test)
check "a by-path entry that isn't a link is refused" "1" "$?"
check "and runs nothing" "" "$(cat "$work/docker.log")"

fresh
ln -sfn ../pcmC1D0p "$work/snd/by-path/$card"
output=$(run sound-test)
check "a name that leads to speakers instead of a mixer is refused" "1" "$?"
check_has "saying it doesn't lead to a mixer" "/dev/snd/by-path/$card doesn't lead to a sound card's mixer." "$output"

fresh
ln -sfn ../controlC5 "$work/snd/by-path/$card"
touch "$work/snd/pcmC5D0p"
output=$(run sound-test)
check "a name that leads to a mixer that isn't there is refused" "1" "$?"
check "and runs nothing" "" "$(cat "$work/docker.log")"
check_has "saying it doesn't lead to a mixer" "/dev/snd/by-path/$card doesn't lead to a sound card's mixer." "$output"

for name in controlCx controlC; do
  fresh
  ln -sfn "../$name" "$work/snd/by-path/$card"
  touch "$work/snd/$name" "$work/snd/pcmCD0p" "$work/snd/pcmCxD0p"
  output=$(run sound-test)
  check "a mixer name without a card number is refused: $name" "1" "$?"
  check_has "saying it doesn't lead to a mixer: $name" "/dev/snd/by-path/$card doesn't lead to a sound card's mixer." "$output"
done

fresh
rm "$work/snd/pcmC1D0p"
output=$(run sound-test)
check "a card with no speakers is refused" "1" "$?"
check "and runs nothing" "" "$(cat "$work/docker.log")"
check_has "naming what's missing" "Sound card 1 ($card) has no speakers at /dev/snd/pcmC1D0p." "$output"

fresh
output=$(DOCKER_FAIL="build" run sound-test)
check "if the image doesn't build, it stops" "1" "$?"
check "before the test runs" "docker build -q -t home-hub-jarvis jarvis | card= group= token=" "$(cat "$work/docker.log")"

for args in "sound" "chat" "sound-test extra" "--help"; do
  fresh
  read -r -a words <<< "$args"
  output=$(run "${words[@]}")
  check "an unknown argument is refused: $args" "1" "$?"
  check "and runs nothing: $args" "" "$(cat "$work/docker.log")"
  check_has "with the usage: $args" "Usage: bash host/jarvis.sh [sound-test]" "$output"
done

fresh
output=$(run)
check "with no argument, Jarvis starts as before, with the token, and no sound file or build" \
  "docker compose run --rm -e API_TOKEN jarvis | card= group= token=hub-test-token" "$(cat "$work/docker.log")"

fresh
mkdir -p "$work/hub-memory"
repo_real=$(cd "$work/repo" && pwd -P)
brain_real=$(cd "$work/hub-memory" && pwd -P)
mkdir -p "$work/claude/projects/$(printf '%s' "$repo_real" | tr -c 'a-zA-Z0-9' '-')/memory" "$work/claude/projects/$(printf '%s' "$brain_real" | tr -c 'a-zA-Z0-9' '-')/memory"
run > /dev/null
check_has "with no argument, the sessions' notes are still mounted" "-v $work/claude/projects/$(printf '%s' "$repo_real" | tr -c 'a-zA-Z0-9' '-')/memory:/notes/docker:ro -v $work/claude/projects/$(printf '%s' "$brain_real" | tr -c 'a-zA-Z0-9' '-')/memory:/notes/brain:ro jarvis" "$(cat "$work/docker.log")"

fresh
rm "$work/repo/api/.env"
output=$(run)
check "with no argument and no API token, it still refuses to start" "1" "$?"
check_has "saying so" "No API_TOKEN found in api/.env." "$output"

voice_on() {
  printf 'ANTHROPIC_API_KEY=not-a-real-key\nJARVIS_LOG=off\nJARVIS_SOUND_CARD=%s\nJARVIS_VOICE=%s\n' "$card" "${1-kokoro}" > "$work/repo/jarvis/.env"
}

plain_run="docker compose run --rm -e API_TOKEN jarvis | card= group= token=hub-test-token"
voice_run="docker compose -f docker-compose.yaml -f docker-compose.sound.yaml run --rm -e API_TOKEN jarvis"
build_line="docker build -q -t home-hub-jarvis jarvis | card= group= token="
ps_line="docker compose ps --status running --quiet kokoro | card= group= token="
up_line="docker compose up -d --wait --wait-timeout 120 kokoro | card= group= token="
kept_line="docker compose up -d --no-recreate --wait --wait-timeout 120 kokoro | card= group= token="
stop_line="docker compose stop kokoro | card= group= token="

fresh
voice_on
output=$(run)
status=$?
check "with JARVIS_VOICE=kokoro, it builds the sound image, starts Kokoro if it isn't running, runs the chat with the sound file, the card, its group and the token, then stops Kokoro" \
  "$build_line
$ps_line
$up_line
$voice_run | card=1 group=$(group 1) token=hub-test-token
$stop_line" "$(cat "$work/docker.log")"
check "and succeeds" "0" "$status"
check_has "it says it's getting the image ready" "Getting Jarvis's sound image ready..." "$output"
check_has "that it's starting Kokoro" "Starting kokoro, Jarvis's speech engine..." "$output"
check_has "and that it's stopping it afterwards" "Stopping kokoro..." "$output"
check "only the chat itself is given the token" "1" "$(grep -c 'token=hub-test-token' "$work/docker.log")"

fresh
voice_on
output=$(DOCKER_RUNNING=kokoro run)
check "if Kokoro is already running, it's waited for in case it's still getting ready, never recreated, and not stopped afterwards, since someone else started it" \
  "$build_line
$ps_line
$kept_line
$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(cat "$work/docker.log")"
check "and nothing is said about starting or stopping" "0" "$(grep -c -e 'Starting kokoro' -e 'Stopping kokoro' <<< "$output")"
check_has "it says Kokoro was already running and that this script will leave it alone" "kokoro is already running, so this script will leave it as it is and won't stop it afterwards." "$output"

fresh
voice_on
output=$(run)
check "when the script starts Kokoro itself, it doesn't say it was already running" "0" "$(grep -c 'already running' <<< "$output")"

fresh
voice_on
output=$(DOCKER_RUNNING="jellyfin kokoro-old" run)
check "another service running isn't taken for Kokoro, so it's still stopped afterwards" "$stop_line" "$(tail -n 1 "$work/docker.log")"

fresh
voice_on
output=$(DOCKER_FAIL="up -d" run)
status=$?
check "if Kokoro doesn't start, Jarvis still does, and whatever did start is stopped afterwards" \
  "$build_line
$ps_line
$up_line
$voice_run | card=1 group=$(group 1) token=hub-test-token
$stop_line" "$(cat "$work/docker.log")"
check "and the chat's own result is what counts" "0" "$status"
check_has "it says Jarvis will have no voice, and where to look" "kokoro isn't ready, so Jarvis will say his voice is off. If the lines above don't say why, try: docker compose logs --tail 20 kokoro" "$output"

fresh
voice_on
output=$(DOCKER_RUNNING=kokoro DOCKER_FAIL="up -d" run)
check "if a Kokoro that was already running isn't ready in time, Jarvis still starts, and it's still left running" \
  "$build_line
$ps_line
$kept_line
$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(cat "$work/docker.log")"
check_has "and it says Jarvis will have no voice" "kokoro isn't ready, so Jarvis will say his voice is off." "$output"

for code in 130 1 0; do
  fresh
  voice_on
  output=$(DOCKER_INT_DURING="up -d" DOCKER_INT_EXIT=$code run)
  check "Ctrl+C while Kokoro is starting stops the script with 130, whatever Docker's own exit code was: $code" "130" "$?"
  check "the chat is never opened: $code" "0" "$(grep -c ' run --rm ' "$work/docker.log")"
  check "and the Kokoro that was being started is stopped: $code" "$stop_line" "$(tail -n 1 "$work/docker.log")"
  check "and nothing claims Jarvis is about to start without a voice: $code" "0" "$(grep -c "isn't ready" <<< "$output")"
done

fresh
voice_on
output=$(DOCKER_RUNNING=kokoro DOCKER_INT_DURING="up -d" run)
check "Ctrl+C while waiting for a Kokoro that was already running also stops the script" "130" "$?"
check "without opening the chat or stopping that Kokoro" "$kept_line" "$(tail -n 1 "$work/docker.log")"

fresh
voice_on
output=$(DOCKER_INT_DURING="compose ps" run)
check "Ctrl+C while the script is still asking whether Kokoro is running stops it too" "130" "$?"
check "before anything is started, so there's nothing to stop" "$ps_line" "$(tail -n 1 "$work/docker.log")"
check "and nothing is said about starting or stopping Kokoro" "0" "$(grep -c -e 'Starting kokoro' -e 'Stopping kokoro' -e 'already running' <<< "$output")"

for code in 0 7; do
  fresh
  voice_on
  output=$(DOCKER_INT_DURING=" run --rm " DOCKER_INT_EXIT=$code run)
  check "Ctrl+C during the chat is the chat's to handle, so its own exit code still stands: $code" "$code" "$?"
  check "and Kokoro is stopped afterwards: $code" "$stop_line" "$(tail -n 1 "$work/docker.log")"
done

for code in 1 130; do
  fresh
  voice_on
  output=$(DOCKER_RUN_EXIT=$code run)
  check "the chat's exit code is passed on: $code" "$code" "$?"
  check "and Kokoro is still stopped afterwards: $code" "$stop_line" "$(tail -n 1 "$work/docker.log")"
done

fresh
voice_on
output=$(DOCKER_FAIL="compose stop" DOCKER_RUN_EXIT=3 run)
check "if Kokoro can't be stopped, the chat's exit code still stands" "3" "$?"
check_has "and it says how to stop it by hand" "Couldn't stop kokoro. Stop it with: docker compose stop kokoro" "$output"

fresh
voice_on
rm -f "$work/script.pid" "$work/chat.pid"
(
  cd "$work/repo" || exit 1
  PATH="$work/bin:$PATH" DOCKER_LOG="$work/docker.log" SOUND_DIR="$work/snd" CLAUDE_CONFIG_DIR="$work/claude" DOCKER_RUN_HOLD="$work/chat.pid" bash host/jarvis.sh < /dev/null > /dev/null 2>&1 &
  echo $! > "$work/script.pid"
  wait
) 2> /dev/null &
waiting=0
until [ -s "$work/chat.pid" ] || [ "$waiting" -ge 100 ]; do
  sleep 0.1
  waiting=$((waiting + 1))
done
check "the chat was open when the script was ended" "1" "$(grep -c ' run --rm ' "$work/docker.log")"
kill -TERM "$(cat "$work/script.pid")" 2> /dev/null
kill "$(cat "$work/chat.pid")" 2> /dev/null
wait 2> /dev/null
check "if the script is ended while the chat is open, it still stops the Kokoro it started" "$stop_line" "$(tail -n 1 "$work/docker.log")"

for value in piper on Kokoro KOKORO kokoro,piper 'kokoro#mine' true; do
  fresh
  voice_on "$value"
  output=$(run)
  check "a JARVIS_VOICE the script doesn't know is refused: $value" "1" "$?"
  check "and runs nothing: $value" "" "$(cat "$work/docker.log")"
  check_has "naming it: $value" "JARVIS_VOICE is $value in jarvis/.env, but it must be off or kokoro." "$output"
done

for value in off ""; do
  fresh
  voice_on "$value"
  run > /dev/null
  check "JARVIS_VOICE=$value starts Jarvis as before, with no sound file, build or Kokoro" "$plain_run" "$(cat "$work/docker.log")"
done

fresh
printf 'JARVIS_SOUND_CARD=%s\nJARVIS_VOICE="kokoro"  \r\n' "$card" > "$work/repo/jarvis/.env"
run > /dev/null
check "quotes, spaces and a Windows line ending around JARVIS_VOICE are ignored" "$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(grep ' run --rm ' "$work/docker.log")"

fresh
printf 'JARVIS_SOUND_CARD=%s\r\nJARVIS_VOICE=kokoro  \r\n' "$card" > "$work/repo/jarvis/.env"
run > /dev/null
check "in a file saved with Windows line endings, a plain value and the card's name are still read, with any spaces after them dropped" "$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(grep ' run --rm ' "$work/docker.log")"

fresh
printf 'JARVIS_SOUND_CARD=%s\nJARVIS_VOICE=off\nJARVIS_VOICE=kokoro\n' "$card" > "$work/repo/jarvis/.env"
run > /dev/null
check "if JARVIS_VOICE is set twice, the last one counts, as in the container: on" "$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(grep ' run --rm ' "$work/docker.log")"

fresh
printf 'JARVIS_SOUND_CARD=%s\nJARVIS_VOICE=kokoro\nJARVIS_VOICE=off\n' "$card" > "$work/repo/jarvis/.env"
run > /dev/null
check "if JARVIS_VOICE is set twice, the last one counts, as in the container: off" "$plain_run" "$(cat "$work/docker.log")"

while IFS= read -r line; do
  fresh
  printf 'JARVIS_SOUND_CARD=%s\n%s\n' "$card" "$line" > "$work/repo/jarvis/.env"
  run > /dev/null
  check "a line Docker reads as kokoro, the script reads as kokoro too: $line" "$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(grep ' run --rm ' "$work/docker.log")"
done << 'LINES'
export JARVIS_VOICE=kokoro
  JARVIS_VOICE=kokoro
	export   JARVIS_VOICE=kokoro
JARVIS_VOICE = kokoro
JARVIS_VOICE: kokoro
JARVIS_VOICE=kokoro # the first engine
JARVIS_VOICE="kokoro" # the first engine
JARVIS_VOICE='kokoro'
JARVIS_VOICE=  kokoro
JARVIS_VOICE="kokoro"#mine
JARVIS_VOICE="kokoro" mine
JARVIS_VOICE='kokoro' # the first engine
LINES

while IFS= read -r line; do
  fresh
  printf 'JARVIS_SOUND_CARD=%s\nJARVIS_VOICE=kokoro\n%s\n' "$card" "$line" > "$work/repo/jarvis/.env"
  run > /dev/null
  check "a later line Docker reads as off turns the voice off for the script too: $line" "$plain_run" "$(cat "$work/docker.log")"
done << 'LINES'
export JARVIS_VOICE=off
  JARVIS_VOICE=off
JARVIS_VOICE = off
JARVIS_VOICE=off # for now
JARVIS_VOICE=
LINES

while IFS='|' read -r line shown; do
  fresh
  printf 'JARVIS_SOUND_CARD=%s\n%s\n' "$card" "$line" > "$work/repo/jarvis/.env"
  output=$(run)
  check "a value Jarvis himself would refuse is refused by the script first: $line" "1" "$?"
  check "and runs nothing: $line" "" "$(cat "$work/docker.log")"
  check_has "naming it as Docker would read it: $line" "JARVIS_VOICE is $shown in jarvis/.env, but it must be off or kokoro." "$output"
done << 'LINES'
JARVIS_VOICE=kok oro|kok oro
JARVIS_VOICE=kokoro#mine|kokoro#mine
JARVIS_VOICE="kokoro piper"|kokoro piper
export JARVIS_VOICE=on|on
JARVIS_VOICE=kokoro	# after a tab|kokoro	# after a tab
JARVIS_VOICE="kokoro # mine"|kokoro # mine
JARVIS_VOICE='kokoro # mine'|kokoro # mine
LINES

while IFS= read -r line; do
  fresh
  printf "$line\nJARVIS_VOICE=kokoro\n" "$card" > "$work/repo/jarvis/.env"
  run > /dev/null
  check "the card's name is read the same way: $line" "$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(grep ' run --rm ' "$work/docker.log")"
done << 'LINES'
export JARVIS_SOUND_CARD=%s
  JARVIS_SOUND_CARD=%s
JARVIS_SOUND_CARD = %s
JARVIS_SOUND_CARD=%s # the laptop's own speakers
JARVIS_SOUND_CARD='%s'
LINES

fresh
printf 'JARVIS_SOUND_CARD=%s\n#JARVIS_VOICE=kokoro\nMY_JARVIS_VOICE=kokoro\nJARVIS_VOICE_NOTE=kokoro\n' "$card" > "$work/repo/jarvis/.env"
run > /dev/null
check "a commented-out line, or another setting with JARVIS_VOICE in its name, doesn't turn the voice on" "$plain_run" "$(cat "$work/docker.log")"

fresh
printf 'ANTHROPIC_API_KEY=not-a-real-key\nJARVIS_VOICE=kokoro\n' > "$work/repo/jarvis/.env"
output=$(run)
check "with the voice on and no JARVIS_SOUND_CARD, it stops" "1" "$?"
check "before running anything" "" "$(cat "$work/docker.log")"
check_has "and says how to set it" "No JARVIS_SOUND_CARD in jarvis/.env." "$output"

fresh
printf 'JARVIS_SOUND_CARD=pci-0000:00:1f.3\nJARVIS_VOICE=kokoro\n' > "$work/repo/jarvis/.env"
output=$(run)
check "with the voice on and a card name that isn't there, it stops" "1" "$?"
check "before running anything" "" "$(cat "$work/docker.log")"

fresh
voice_on
rm "$work/repo/api/.env"
output=$(run)
check "with the voice on and no API token, it still refuses to start" "1" "$?"
check "before running anything" "" "$(cat "$work/docker.log")"
check_has "saying so" "No API_TOKEN found in api/.env." "$output"

fresh
voice_on
output=$(DOCKER_FAIL="build" run)
check "with the voice on, if the image doesn't build, it stops" "1" "$?"
check "before Kokoro or the chat is touched" "$build_line" "$(cat "$work/docker.log")"

fresh
voice_on
mkdir -p "$work/hub-memory"
repo_real=$(cd "$work/repo" && pwd -P)
mkdir -p "$work/claude/projects/$(printf '%s' "$repo_real" | tr -c 'a-zA-Z0-9' '-')/memory"
run > /dev/null
check_has "with the voice on, the sessions' notes are still mounted" "run --rm -e API_TOKEN -v $work/claude/projects/$(printf '%s' "$repo_real" | tr -c 'a-zA-Z0-9' '-')/memory:/notes/docker:ro jarvis" "$(cat "$work/docker.log")"

for value in kokoro piper off; do
  fresh
  voice_on "$value"
  run sound-test > /dev/null
  check "the sound test doesn't read JARVIS_VOICE, or start Kokoro: $value" \
    "docker build -q -t home-hub-jarvis jarvis | card= group= token=
$sound_run | card=1 group=$(group 1) token=" "$(cat "$work/docker.log")"
done

known=$(grep -o '^if \[ "\$voice" != off \].*' "$here/jarvis.sh" | grep -o '!= [a-z]*' | cut -d' ' -f2 | tr '\n' ' ')
in_code=$(grep '^export const voiceModes = ' "$here/../jarvis/src/config.ts" | grep -o '"[a-z]*"' | tr -d '"' | tr '\n' ' ')
check "the script accepts exactly the values Jarvis's own settings do" "$in_code" "$known"

compose_file="$here/../docker-compose.yaml"
kokoro=$(awk '/^  kokoro:$/ {on=1; next} on && /^  [a-z]/ {on=0} on && /^[a-z]/ {on=0} on' "$compose_file")
check "Kokoro's image is pinned to a version and to its digest" "1" "$(grep -c '^    image: ghcr.io/remsky/kokoro-fastapi-cpu:v[0-9.]*@sha256:[0-9a-f]\{64\}$' <<< "$kokoro")"
check "Kokoro publishes no port" "0" "$(grep -c -e 'ports:' -e 'expose:' -e 'network_mode' <<< "$kokoro")"
check "Kokoro gets no folders, devices or extra rights" "0" "$(grep -c -e 'volumes:' -e 'devices:' -e 'privileged' -e 'cap_add' -e 'docker.sock' -e 'env_file' <<< "$kokoro")"
check "Kokoro is on the speech network and no other" "    networks:
      - speech" "$(grep -A2 '^    networks:$' <<< "$kokoro" | grep -v '^    [a-z_]*:.*[^:]$' | head -n 3 | grep -e 'networks:' -e '^      - ')"
check "Kokoro only starts when it's named, never with a plain docker compose up" "    profiles:
      - kokoro" "$(grep -A1 '^    profiles:$' <<< "$kokoro")"
check "Kokoro never restarts by itself" "0" "$(grep -c 'restart:' <<< "$kokoro")"
check "Kokoro has a memory limit" "1" "$(grep -c '^    mem_limit: [0-9]*g$' <<< "$kokoro")"
check "Kokoro's healthcheck asks its own health route, inside its own container, every 2 seconds while it starts, which up --wait relies on" '    healthcheck:
      test: ["CMD", "curl", "-fsS", "-o", "/dev/null", "http://127.0.0.1:8880/health"]
      interval: 1m
      timeout: 5s
      retries: 3
      start_period: 2m
      start_interval: 2s' "$(grep -A6 '^    healthcheck:$' <<< "$kokoro")"
kokoro_port=$(grep -o '^export const kokoroUrl = "http://kokoro:[0-9]*";$' "$here/../jarvis/src/kokoro.ts" | grep -o '[0-9]*";' | tr -d '";')
check "the healthcheck asks the port Jarvis asks" "1" "$(grep -c "http://127.0.0.1:$kokoro_port/health\"\]$" <<< "$kokoro")"
check "and the route Jarvis's own check asks" "1" "$(grep -c 'fetch(`${url}/health`' "$here/../jarvis/src/kokoro.ts")"
default_voice=$(grep -o '^export const defaultKokoroVoice = "[a-z_]*";$' "$here/../jarvis/src/config.ts" | grep -o '"[a-z_]*"' | tr -d '"')
check "Kokoro's four settings: it warms up with Jarvis's default voice, asks Hugging Face nothing as it starts, serves no web page, and logs errors only" "    environment:
      DEFAULT_VOICE: $default_voice
      HF_HUB_DISABLE_TELEMETRY: \"1\"
      ENABLE_WEB_PLAYER: \"false\"
      API_LOG_LEVEL: ERROR" "$(grep -A4 '^    environment:$' <<< "$kokoro")"
check "and no others" "    mem_limit: 2g" "$(grep -A5 '^    environment:$' <<< "$kokoro" | tail -n 1)"
check "Kokoro runs as its image's own ordinary user, with no extra reach into the server" "0" "$(grep -c -e 'user:' -e 'pid:' -e 'ipc:' -e 'security_opt' -e 'extra_hosts' -e 'group_add' <<< "$kokoro")"
check "the speech network has no way out to the internet" "  speech:
    internal: true" "$(grep -A1 '^  speech:$' "$compose_file")"
check "the compose service has the name the script starts and Jarvis asks" "1" "$(grep -c '^export const kokoroUrl = "http://kokoro:8880";$' "$here/../jarvis/src/kokoro.ts")"
others=$(awk '/^  kokoro:$/ {skip=1; next} skip && /^  [a-z]/ {skip=0} skip && /^[a-z]/ {skip=0} !skip' "$compose_file")
check "nothing else in the main compose file is on the speech network" "1" "$(grep -c 'speech' <<< "$others")"

sound_file="$here/../docker-compose.sound.yaml"
devices=$(grep -E '^ +- /dev/' "$sound_file")
check "the sound file passes exactly two devices" "2" "$(grep -c . <<< "$devices")"
check "one is the card's mixer" "1" "$(grep -c '^ *- /dev/snd/controlC.*:/dev/snd/controlC.*:rw$' <<< "$devices")"
check "one is the card's speakers" "1" "$(grep -c '^ *- /dev/snd/pcmC.*D0p:/dev/snd/pcmC.*D0p:rw$' <<< "$devices")"
check "neither can record" "0" "$(grep -c 'c:' <<< "${devices//controlC/}")"
check "both are read and write only" "2" "$(grep -c ':rw$' <<< "$devices")"
while read -r line; do
  check "each device takes the card number the script found, on both sides: $line" "2" "$(grep -o 'SOUND_CARD_NUMBER' <<< "$line" | wc -l)"
done <<< "$devices"
check "the sound file uses the image the script builds" "1" "$(grep -c '^    image: home-hub-jarvis$' "$sound_file")"
check_has "and the group the script found" "AUDIO_GROUP_ID:?" "$(grep -A1 '^    group_add:$' "$sound_file" | tail -n 1)"
check "the sound file never pulls an image from a registry" "1" "$(grep -c '^    pull_policy: never$' "$sound_file")"
check "the sound file is the only place Jarvis joins the speech network" "    networks:
      - speech" "$(grep -A1 '^    networks:$' "$sound_file")"
check "and it's the only network the sound file adds" "1" "$(grep -c '^      - [a-z]*$' "$sound_file")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
