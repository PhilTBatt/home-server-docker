#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

mkdir "$work/bin"
cat > "$work/bin/docker" <<'FAKE'
#!/bin/bash
echo "docker $* | card=${SOUND_CARD_NUMBER:-} group=${AUDIO_GROUP_ID:-} token=${API_TOKEN:-}" >> "$DOCKER_LOG"
if [ -n "${PIPER_VOICE+set}" ]; then echo "PIPER_VOICE=$PIPER_VOICE for: docker $*" >> "$DOCKER_LOG.piper"; fi
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

cat > "$work/bin/curl" <<'FAKE'
#!/bin/bash
echo "curl $*" >> "$CURL_LOG"
out=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [ "${args[$i]}" = -o ]; then out=${args[$((i + 1))]}; fi
done
url=${args[$((${#args[@]} - 1))]}
if [ -n "${CURL_FAIL_ON:-}" ] && [[ "$url" == *"$CURL_FAIL_ON" ]]; then
  echo "curl: (22) The requested URL returned error: 404" >&2
  exit 22
fi
if [ -n "${CURL_EMPTY_ON:-}" ] && [[ "$url" == *"$CURL_EMPTY_ON" ]]; then
  : > "$out"
elif [[ "$url" == *.onnx.json ]]; then
  if [ "${CURL_RATE:-22050}" = none ]; then
    printf '{"audio": {"quality": "medium"}}\n' > "$out"
  else
    printf '{\n  "audio": {\n    "sample_rate": %s,\n    "quality": "medium"\n  }\n}\n' "${CURL_RATE:-22050}" > "$out"
  fi
else
  printf 'downloaded from %s\n' "$url" > "$out"
fi
FAKE
chmod +x "$work/bin/curl"

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
  rm -rf "$work/repo" "$work/snd" "$work/claude" "$work/hub-memory" "$work/docker.log" "$work/docker.log.piper" "$work/curl.log"
  mkdir -p "$work/repo/host" "$work/repo/jarvis" "$work/repo/api" "$work/snd/by-path" "$work/claude"
  touch "$work/docker.log" "$work/curl.log"
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
  (cd "$work/repo" && PATH="$work/bin:$PATH" DOCKER_LOG="$work/docker.log" CURL_LOG="$work/curl.log" SOUND_DIR="$work/snd" CLAUDE_CONFIG_DIR="$work/claude" SCRIPT_PID="$work/script.pid" bash -c 'echo $$ > "$SCRIPT_PID" && exec "$@"' bash "${default_int[@]}" bash host/jarvis.sh "$@" < /dev/null 2>&1)
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

for args in "sound" "chat" "sound-test extra" "--help" "piper" "piper-voice extra" "piper-voice sound-test"; do
  fresh
  read -r -a words <<< "$args"
  output=$(run "${words[@]}")
  check "an unknown argument is refused: $args" "1" "$?"
  check "and runs nothing: $args" "" "$(cat "$work/docker.log")$(cat "$work/curl.log")"
  check_has "with the usage: $args" "Usage: bash host/jarvis.sh [sound-test | piper-voice]" "$output"
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

for value in on Kokoro KOKORO Piper PIPER kokoro,piper 'kokoro#mine' true; do
  fresh
  voice_on "$value"
  output=$(run)
  check "a JARVIS_VOICE the script doesn't know is refused: $value" "1" "$?"
  check "and runs nothing: $value" "" "$(cat "$work/docker.log")"
  check_has "naming it: $value" "JARVIS_VOICE is $value in jarvis/.env, but it must be off, kokoro or piper." "$output"
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
  check_has "naming it as Docker would read it: $line" "JARVIS_VOICE is $shown in jarvis/.env, but it must be off, kokoro or piper." "$output"
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

piper_up() {
  printf 'ANTHROPIC_API_KEY=not-a-real-key\nJARVIS_LOG=off\nJARVIS_SOUND_CARD=%s\nJARVIS_VOICE=piper\n%s' "$card" "${1:-}" > "$work/repo/jarvis/.env"
}

voice_files() {
  mkdir -p "$work/repo/piper/voices"
  printf 'model\n' > "$work/repo/piper/voices/$1.onnx"
  printf '{"audio": {"sample_rate": 22050}}\n' > "$work/repo/piper/voices/$1.onnx.json"
}

saved() {
  (cd "$work/repo/piper/voices" 2> /dev/null && ls -A | tr '\n' ' ')
}

piper_ps="docker compose ps --status running --quiet piper | card= group= token="
piper_up_line="docker compose up -d --wait --wait-timeout 120 piper | card= group= token="
piper_kept="docker compose up -d --no-recreate --wait --wait-timeout 120 piper | card= group= token="
piper_stop="docker compose stop piper | card= group= token="
hf=https://huggingface.co/rhasspy/piper-voices/resolve/main

fresh
piper_up
voice_files en_GB-alan-medium
output=$(run)
status=$?
check "with JARVIS_VOICE=piper and its voice downloaded, it builds the sound image, starts Piper if it isn't running, runs the chat with the sound file, then stops Piper" \
  "$build_line
$piper_ps
$piper_up_line
$voice_run | card=1 group=$(group 1) token=hub-test-token
$piper_stop" "$(cat "$work/docker.log")"
check "and succeeds" "0" "$status"
check "Piper is started with the default voice, en_GB-alan-medium, passed in as PIPER_VOICE" "PIPER_VOICE=en_GB-alan-medium for: docker compose up -d --wait --wait-timeout 120 piper" "$(cat "$work/docker.log.piper")"
check_has "it says it's starting Piper" "Starting piper, Jarvis's speech engine..." "$output"
check_has "and stopping it afterwards" "Stopping piper..." "$output"
check "and downloads nothing" "" "$(cat "$work/curl.log")"

fresh
piper_up 'JARVIS_PIPER_VOICE="en_GB-northern_english_male-medium" # mine'
voice_files en_GB-northern_english_male-medium
run > /dev/null
check "JARVIS_PIPER_VOICE, read as Docker reads it, is the voice Piper is started with" "PIPER_VOICE=en_GB-northern_english_male-medium for: docker compose up -d --wait --wait-timeout 120 piper" "$(cat "$work/docker.log.piper")"

fresh
piper_up
voice_files en_GB-alan-medium
output=$(DOCKER_RUNNING=piper run)
check "a Piper that's already running is waited for, never recreated or stopped" "$build_line
$piper_ps
$piper_kept
$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(cat "$work/docker.log")"
check_has "and it says so" "piper is already running, so this script will leave it as it is and won't stop it afterwards." "$output"

fresh
voice_on
voice_files en_GB-alan-medium
run > /dev/null
check "with Kokoro, Piper isn't touched and its voice isn't passed in" "$build_line
$ps_line
$up_line
$voice_run | card=1 group=$(group 1) token=hub-test-token
$stop_line" "$(cat "$work/docker.log")"
check "PIPER_VOICE is empty for Kokoro's start, so it changes nothing there" "PIPER_VOICE= for: docker compose up -d --wait --wait-timeout 120 kokoro" "$(cat "$work/docker.log.piper")"

fresh
voice_on
printf 'JARVIS_PIPER_VOICE=alan\n' >> "$work/repo/jarvis/.env"
run > /dev/null
check "with Kokoro, the script doesn't judge JARVIS_PIPER_VOICE; Jarvis's own settings do" "$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(grep ' run --rm ' "$work/docker.log")"

for missing in "" en_GB-alan-medium.onnx en_GB-alan-medium.onnx.json; do
  fresh
  piper_up
  if [ -n "$missing" ]; then
    voice_files en_GB-alan-medium
    rm "$work/repo/piper/voices/$missing"
  fi
  output=$(run)
  check "with JARVIS_VOICE=piper and its voice not downloaded, it stops: ${missing:-no folder}" "1" "$?"
  check "before running anything: ${missing:-no folder}" "" "$(cat "$work/docker.log")"
  check_has "and says how to download it: ${missing:-no folder}" "Piper's voice en_GB-alan-medium isn't in piper/voices yet. Download it once with: bash host/jarvis.sh piper-voice" "$output"
done

for empty in en_GB-alan-medium.onnx en_GB-alan-medium.onnx.json; do
  fresh
  piper_up
  voice_files en_GB-alan-medium
  : > "$work/repo/piper/voices/$empty"
  output=$(run)
  check "an empty voice file counts as not downloaded: $empty" "1" "$?"
  check "and nothing runs: $empty" "" "$(cat "$work/docker.log")"
done

fresh
piper_up 'JARVIS_PIPER_VOICE=en_GB-northern_english_male-medium'
voice_files en_GB-alan-medium
output=$(run)
check "the default voice's files don't count for another voice" "1" "$?"
check_has "and the voice it wants is named" "Piper's voice en_GB-northern_english_male-medium isn't in piper/voices yet." "$output"

for value in alan en_GB-alan en_GB-alan-Medium en_gb-alan-medium ../en_GB-alan-medium 'en_GB/alan/medium' 'en_GB-alan-medium.onnx' 'en_GB-al an-medium'; do
  fresh
  piper_up "JARVIS_PIPER_VOICE=$value"
  voice_files en_GB-alan-medium
  output=$(run)
  check "with JARVIS_VOICE=piper, a JARVIS_PIPER_VOICE that isn't a voice name stops it: $value" "1" "$?"
  check "before running anything: $value" "" "$(cat "$work/docker.log")"
  check_has "naming it: $value" "JARVIS_PIPER_VOICE is $value in jarvis/.env, but it must be a Piper voice name, its language, speaker and quality, like en_GB-alan-medium." "$output"
  check "and nothing else is looked for: $value" "0" "$(grep -c "isn't in piper/voices" <<< "$output")"
done

fresh
piper_up
voice_files en_GB-alan-medium
output=$(DOCKER_FAIL="up -d" run)
check "if Piper doesn't come up, the chat still starts" "$voice_run | card=1 group=$(group 1) token=hub-test-token" "$(grep ' run --rm ' "$work/docker.log")"
check_has "and it says where to look" "piper isn't ready, so Jarvis will say his voice is off. If the lines above don't say why, try: docker compose logs --tail 20 piper" "$output"

fresh
output=$(run piper-voice)
status=$?
check "piper-voice downloads the default voice's model, its settings and its card from Hugging Face, over HTTPS only, failing on an error" \
  "curl -fsS -L --proto =https --proto-redir =https -m 600 -o PART/en_GB-alan-medium.onnx $hf/en/en_GB/alan/medium/en_GB-alan-medium.onnx
curl -fsS -L --proto =https --proto-redir =https -m 600 -o PART/en_GB-alan-medium.onnx.json $hf/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json
curl -fsS -L --proto =https --proto-redir =https -m 600 -o PART/MODEL_CARD $hf/en/en_GB/alan/medium/MODEL_CARD" "$(sed -E 's#piper/voices/\.download\.[A-Za-z0-9]{6}#PART#' "$work/curl.log")"
check "and succeeds" "0" "$status"
check "saving the three in piper/voices, with the card named after the voice, and nothing else left there" "en_GB-alan-medium.MODEL_CARD en_GB-alan-medium.onnx en_GB-alan-medium.onnx.json " "$(saved)"
check "the files are the ones downloaded" "downloaded from $hf/en/en_GB/alan/medium/en_GB-alan-medium.onnx" "$(cat "$work/repo/piper/voices/en_GB-alan-medium.onnx")"
check "and the card is the voice's MODEL_CARD" "downloaded from $hf/en/en_GB/alan/medium/MODEL_CARD" "$(cat "$work/repo/piper/voices/en_GB-alan-medium.MODEL_CARD")"
check "it touches no container" "" "$(cat "$work/docker.log")"
check_has "it says what it's doing" "Downloading Piper's voice en_GB-alan-medium from Hugging Face..." "$output"
check_has "and where it went" "Saved en_GB-alan-medium in piper/voices. Its MODEL_CARD there says where its recordings came from and their licence." "$output"

fresh
rm "$work/repo/api/.env"
printf 'JARVIS_PIPER_VOICE=en_GB-northern_english_male-medium\n' > "$work/repo/jarvis/.env"
rm -rf "$work/snd"
run piper-voice > /dev/null
check "piper-voice needs no API token or sound card, and finds the folder for a speaker whose name has underscores" "$hf/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx" "$(head -n 1 "$work/curl.log" | grep -o '[^ ]*$')"
check "and saves it under its own name" "en_GB-northern_english_male-medium.MODEL_CARD en_GB-northern_english_male-medium.onnx en_GB-northern_english_male-medium.onnx.json " "$(saved)"

fresh
printf 'JARVIS_PIPER_VOICE=de_DE-eva_k-x_low\n' > "$work/repo/jarvis/.env"
CURL_RATE=16000 run piper-voice > /dev/null
check "an x_low voice is saved when its settings say 16000 Hz" "de_DE-eva_k-x_low.MODEL_CARD de_DE-eva_k-x_low.onnx de_DE-eva_k-x_low.onnx.json " "$(saved)"
check "from the language's own folder" "$hf/de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx" "$(head -n 1 "$work/curl.log" | grep -o '[^ ]*$')"

for rate in "en_GB-alan-medium 16000 22050" "en_GB-alan-low 22050 16000" "en_US-lessac-high 24000 22050"; do
  read -r name given wanted <<< "$rate"
  fresh
  printf 'JARVIS_PIPER_VOICE=%s\n' "$name" > "$work/repo/jarvis/.env"
  output=$(CURL_RATE=$given run piper-voice)
  check "a voice whose settings give another rate than Jarvis plays it at is refused: $name at $given" "1" "$?"
  check "and nothing is saved: $name at $given" "" "$(saved)"
  check_has "saying why: $name at $given" "$name.onnx.json says its sound is $given Hz, but Jarvis plays a ${name##*-} voice at $wanted Hz, so nothing was saved." "$output"
done

fresh
output=$(CURL_RATE=none run piper-voice)
check "settings that don't give a rate are refused" "1" "$?"
check "and nothing is saved" "" "$(saved)"
check_has "saying so" "en_GB-alan-medium.onnx.json doesn't give its sound's sample rate, so nothing was saved." "$output"

for file in en_GB-alan-medium.onnx en_GB-alan-medium.onnx.json MODEL_CARD; do
  fresh
  output=$(CURL_FAIL_ON="/$file" run piper-voice)
  check "if a download fails, it stops: $file" "1" "$?"
  check "and nothing is saved, not even the files before it: $file" "" "$(saved)"
  check_has "saying which, where from, and what to check: $file" "Couldn't download $file from $hf/en/en_GB/alan/medium. Check the voice's name is right at https://huggingface.co/rhasspy/piper-voices/tree/main, and that the server can reach Hugging Face." "$output"
  check_has "after curl's own reason: $file" "curl: (22) The requested URL returned error: 404" "$output"
  check "and it stops there, without trying the files after it: $file" "0" "$(grep -c -e 'came back empty' -e 'sample rate' <<< "$output")"
  check "or downloading them: $file" "$(grep -n "/$file\$" <<< "$(grep -o '[^ ]*$' "$work/curl.log")" | cut -d: -f1)" "$(grep -c . "$work/curl.log")"
  fresh
  output=$(CURL_EMPTY_ON="/$file" run piper-voice)
  check "if a download comes back empty, it stops: $file" "1" "$?"
  check "and nothing is saved: $file" "" "$(saved)"
  check_has "saying so: $file" "$file came back empty from $hf/en/en_GB/alan/medium, so nothing was saved." "$output"
done

fresh
mkdir -p "$work/repo/piper/voices"
printf 'old\n' > "$work/repo/piper/voices/en_GB-alan-medium.onnx"
printf 'other\n' > "$work/repo/piper/voices/en_GB-alan-low.onnx"
run piper-voice > /dev/null
check "downloading a voice again replaces its old files, and leaves other voices alone" "downloaded from $hf/en/en_GB/alan/medium/en_GB-alan-medium.onnx|other" "$(cat "$work/repo/piper/voices/en_GB-alan-medium.onnx")|$(cat "$work/repo/piper/voices/en_GB-alan-low.onnx")"

fresh
mkdir -p "$work/repo/piper/voices"
printf 'old\n' > "$work/repo/piper/voices/en_GB-alan-medium.onnx"
CURL_FAIL_ON=MODEL_CARD run piper-voice > /dev/null
check "a failed download leaves the old files as they were" "old" "$(cat "$work/repo/piper/voices/en_GB-alan-medium.onnx")"

for value in alan en_GB-alan-Medium ../en_GB-alan-medium 'en_GB/alan/medium' 'en_GB-alan-medium;ls'; do
  fresh
  printf 'JARVIS_PIPER_VOICE=%s\n' "$value" > "$work/repo/jarvis/.env"
  output=$(run piper-voice)
  check "piper-voice refuses a JARVIS_PIPER_VOICE that isn't a voice name: $value" "1" "$?"
  check "and downloads nothing: $value" "" "$(cat "$work/curl.log")"
  check_has "naming it: $value" "JARVIS_PIPER_VOICE is $value in jarvis/.env, but it must be a Piper voice name" "$output"
done

script_pattern=$(grep -o "^piper_voice_pattern='.*'$" "$here/jarvis.sh" | cut -d"'" -f2)
code_pattern=$(grep -o '^export const piperVoicePattern = /.*/;$' "$here/../jarvis/src/config.ts" | sed -E 's#^export const piperVoicePattern = /(.*)/;$#\1#')
check "the script takes exactly the voice names Jarvis's own settings do" "$code_pattern" "$script_pattern"
code_default=$(grep -o '^export const defaultPiperVoice = "[^"]*";$' "$here/../jarvis/src/config.ts" | cut -d'"' -f2)
check "the script's default voice is Jarvis's" "$code_default" "$(grep -o 'name=${name:-[^}]*}' "$here/jarvis.sh" | sed -E 's/^name=\$\{name:-(.*)\}$/\1/')"
check "the script checks rates the way Jarvis plays them" "1" "$(grep -c '^  return /-(x_low|low)\$/.test(voice) ? 16_000 : 22_050;$' "$here/../jarvis/src/piper.ts")"
check "with low and x_low at 16000, everything else at 22050" "    *-x_low | *-low) echo 16000 ;;
    *) echo 22050 ;;" "$(grep -A1 '^    \*-x_low | \*-low) echo 16000 ;;$' "$here/jarvis.sh")"

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
speech=$(awk '/^[^ \t\r#]/ {top = $0} top == "networks:" && /^  speech:$/ {on=1; next} on && (/^[^ \t\r#]/ || /^  ?[^ \t\r#]/) {on=0} on && !/^[ \t\r]*(#|$)/' "$compose_file")
check "and the server has no address on it, so Kokoro can't reach the server's own services, and nothing else is set on it" "    internal: true
    driver_opts:
      com.docker.network.bridge.gateway_mode_ipv4: isolated" "$speech"
check "the compose service has the name the script starts and Jarvis asks" "1" "$(grep -c '^export const kokoroUrl = "http://kokoro:8880";$' "$here/../jarvis/src/kokoro.ts")"
piper=$(awk '/^  piper:$/ {on=1; next} on && /^  [a-z]/ {on=0} on && /^[a-z]/ {on=0} on' "$compose_file")
check "Piper's image is pinned to a version and to its digest" "1" "$(grep -c '^    image: rhasspy/wyoming-piper:[0-9.]*@sha256:[0-9a-f]\{64\}$' <<< "$piper")"
check "Piper publishes no port" "0" "$(grep -c -e 'ports:' -e 'expose:' -e 'network_mode' <<< "$piper")"
check "Piper gets no devices, settings file or extra rights" "0" "$(grep -c -e 'devices:' -e 'privileged' -e 'cap_add' -e 'docker.sock' -e 'env_file' -e 'environment:' <<< "$piper")"
check "Piper's one folder is its voices, read-only, and Docker won't make it if it's missing" "    volumes:
      - type: bind
        source: ./piper/voices
        target: /data
        read_only: true
        bind:
          create_host_path: false" "$(grep -A6 '^    volumes:$' <<< "$piper")"
check "and it has no other" "1" "$(grep -c -e 'source:' -e '^      - [./~]' <<< "$piper")"
check "Piper is on the speech network and no other" "    networks:
      - speech" "$(grep -A2 '^    networks:$' <<< "$piper" | grep -v '^    [a-z_]*:.*[^:]$' | head -n 3 | grep -e 'networks:' -e '^      - ')"
check "Piper only starts when it's named, never with a plain docker compose up" "    profiles:
      - piper" "$(grep -A1 '^    profiles:$' <<< "$piper")"
check "Piper never restarts by itself" "0" "$(grep -c 'restart:' <<< "$piper")"
check "Piper has a memory limit" "1" "$(grep -c '^    mem_limit: [0-9]*[gm]$' <<< "$piper")"
check "Piper is only told its voice, which the script passes in, falling back to Jarvis's default; no web page or debug log, which would show what he says" "    command: [\"--voice\", \"\${PIPER_VOICE:-$code_default}\"]" "$(grep '^    command:' <<< "$piper")"
check "Piper's healthcheck is its image's own, asking for its description, every 2 seconds while it starts, which up --wait relies on" '    healthcheck:
      test: ["CMD", "/usr/src/.venv/bin/python3", "-m", "wyoming_piper.health_check"]
      interval: 1m
      timeout: 5s
      retries: 3
      start_period: 1m
      start_interval: 2s' "$(grep -A6 '^    healthcheck:$' <<< "$piper")"
check "Piper runs as its image's own user, with no extra reach into the server" "0" "$(grep -c -e 'user:' -e 'pid:' -e 'ipc:' -e 'security_opt' -e 'extra_hosts' -e 'group_add' <<< "$piper")"
check "the compose service has the name and the image's port that Jarvis asks" "2" "$(grep -c -e '^export const piperHost = "piper";$' -e '^export const piperPort = 10200;$' "$here/../jarvis/src/piper.ts")"
check "Piper's voices are git-ignored, so the public repo never holds them" "1" "$(grep -c '^piper/voices/$' "$here/../.gitignore")"
others=$(awk '/^  (kokoro|piper):$/ {skip=1; next} skip && /^  [a-z]/ {skip=0} skip && /^[a-z]/ {skip=0} !skip' "$compose_file")
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
check "the sound file names networks only where Jarvis joins speech, so it changes no network's settings" "1" "$(grep -c 'networks' "$sound_file")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
