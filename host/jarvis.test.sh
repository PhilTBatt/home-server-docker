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
  (cd "$work/repo" && PATH="$work/bin:$PATH" DOCKER_LOG="$work/docker.log" SOUND_DIR="$work/snd" CLAUDE_CONFIG_DIR="$work/claude" bash host/jarvis.sh "$@" < /dev/null 2>&1)
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

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
