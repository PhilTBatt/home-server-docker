#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

sound_card() {
  local dir=${SOUND_DIR:-/dev/snd} name target control number
  name=$(grep '^JARVIS_SOUND_CARD=' jarvis/.env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d "[:space:]\"'")
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

API_TOKEN="$token" exec docker compose run --rm -e API_TOKEN "${mounts[@]}" jarvis
