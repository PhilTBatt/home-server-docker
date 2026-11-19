#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

setting() {
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*[=:][[:space:]]*//p" jarvis/.env 2> /dev/null | tail -n 1 | sed -E "/^\"[^\"]*\"/{s/^\"([^\"]*)\".*$/\1/;b}; /^'[^']*'/{s/^'([^']*)'.*$/\1/;b}; s/ #.*$//; s/[[:space:]]+$//"
}

sound_card() {
  local dir=${SOUND_DIR:-/dev/snd} name target control number
  name=$(setting JARVIS_SOUND_CARD)
  if [ -z "$name" ]; then
    echo "No JARVIS_SOUND_CARD in jarvis/.env. Set it to the speakers' name from ls /dev/snd/by-path, like pci-0000:04:00.6." >&2
    return 1
  fi
  if [[ "$name" == */* ]] || ! target=$(readlink "$dir/by-path/$name"); then
    echo "JARVIS_SOUND_CARD is $name, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names." >&2
    return 1
  fi
  control=${target##*/}
  if [[ "$control" =~ ^controlC([0-9]+)$ ]] && [ -e "$dir/$control" ]; then
    number=${BASH_REMATCH[1]}
  else
    echo "/dev/snd/by-path/$name doesn't lead to a sound card's mixer." >&2
    return 1
  fi
  if [ ! -e "$dir/pcmC${number}D0p" ]; then
    echo "Sound card $number ($name) has no speakers at /dev/snd/pcmC${number}D0p." >&2
    return 1
  fi
  echo "$number $(stat -c %g "$dir/$control")"
}

if [ $# -gt 1 ] || { [ $# -eq 1 ] && [ "$1" != sound-test ]; }; then
  echo "Usage: bash host/jarvis.sh [sound-test]" >&2
  exit 1
fi

if [ "$1" = sound-test ]; then
  card=$(sound_card) || exit 1
  read -r number group <<< "$card"
  echo "Getting Jarvis's sound image ready..."
  docker build -q -t home-hub-jarvis jarvis > /dev/null || exit 1
  SOUND_CARD_NUMBER="$number" AUDIO_GROUP_ID="$group" exec docker compose -f docker-compose.yaml -f docker-compose.sound.yaml run --rm jarvis npm run sound-test
fi

voice=$(setting JARVIS_VOICE)
voice=${voice:-off}
if [ "$voice" != off ] && [ "$voice" != kokoro ]; then
  echo "JARVIS_VOICE is $voice in jarvis/.env, but it must be off or kokoro." >&2
  exit 1
fi

token=$(grep '^API_TOKEN=' api/.env | cut -d= -f2)
if [ -z "$token" ]; then
  echo "No API_TOKEN found in api/.env." >&2
  exit 1
fi

projects="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
mounts=()
for session in docker:. brain:../hub-memory; do
  repo=$(cd "${session#*:}" 2>/dev/null && pwd -P) || continue
  notes="$projects/$(printf '%s' "$repo" | tr -c 'a-zA-Z0-9' '-')/memory"
  if [ -d "$notes" ]; then
    mounts+=(-v "$notes:/notes/${session%%:*}:ro")
  fi
done

if [ "$voice" = off ]; then
  API_TOKEN="$token" exec docker compose run --rm -e API_TOKEN "${mounts[@]}" jarvis
fi

card=$(sound_card) || exit 1
read -r number group <<< "$card"
echo "Getting Jarvis's sound image ready..."
docker build -q -t home-hub-jarvis jarvis > /dev/null || exit 1

started=""
stop_engine() {
  [ -n "$started" ] || return
  echo "Stopping $voice..."
  docker compose stop "$voice" > /dev/null 2>&1 || echo "Couldn't stop $voice. Stop it with: docker compose stop $voice" >&2
}
trap stop_engine EXIT
trap 'exit 130' INT

keep=()
if [ -z "$(docker compose ps --status running --quiet "$voice" 2> /dev/null)" ]; then
  started=yes
  echo "Starting $voice, Jarvis's speech engine..."
else
  keep=(--no-recreate)
  echo "$voice is already running, so this script will leave it as it is and won't stop it afterwards."
fi
docker compose up -d "${keep[@]}" --wait --wait-timeout 120 "$voice" || echo "$voice isn't ready, so Jarvis will say his voice is off. If the lines above don't say why, try: docker compose logs --tail 20 $voice" >&2
trap - INT

SOUND_CARD_NUMBER="$number" AUDIO_GROUP_ID="$group" API_TOKEN="$token" docker compose -f docker-compose.yaml -f docker-compose.sound.yaml run --rm -e API_TOKEN "${mounts[@]}" jarvis
exit $?
