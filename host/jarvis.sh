#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

setting() {
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*[=:][[:space:]]*//p" "${2:-jarvis/.env}" 2> /dev/null | tail -n 1 | sed -E "/^\"[^\"]*\"/{s/^\"([^\"]*)\".*$/\1/;b}; /^'[^']*'/{s/^'([^']*)'.*$/\1/;b}; s/ #.*$//; s/[[:space:]]+$//"
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

piper_voice_pattern='^[a-z]{2,3}_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$'

piper_voice() {
  local name
  name=$(setting JARVIS_PIPER_VOICE)
  name=${name:-en_GB-alan-medium}
  if [[ ! "$name" =~ $piper_voice_pattern ]]; then
    echo "JARVIS_PIPER_VOICE is $name in jarvis/.env, but it must be a Piper voice name, its language, speaker and quality, like en_GB-alan-medium." >&2
    return 1
  fi
  echo "$name"
}

piper_rate() {
  case "$1" in
    *-x_low | *-low) echo 16000 ;;
    *) echo 22050 ;;
  esac
}

if [ $# -gt 1 ] || { [ $# -eq 1 ] && [ "$1" != sound-test ] && [ "$1" != piper-voice ]; }; then
  echo "Usage: bash host/jarvis.sh [sound-test | piper-voice]" >&2
  exit 1
fi

if [ "$1" = piper-voice ]; then
  name=$(piper_voice) || exit 1
  language=${name%%-*}
  quality=${name##*-}
  speaker=${name#"$language"-}
  speaker=${speaker%-"$quality"}
  url="https://huggingface.co/rhasspy/piper-voices/resolve/main/${language%%_*}/$language/$speaker/$quality"
  mkdir -p piper/voices || exit 1
  part=$(mktemp -d piper/voices/.download.XXXXXX) || exit 1
  trap 'rm -rf "$part"' EXIT
  echo "Downloading Piper's voice $name from Hugging Face..."
  for file in "$name.onnx" "$name.onnx.json" MODEL_CARD; do
    if ! curl -fsS -L --proto =https --proto-redir =https -m 600 -o "$part/$file" "$url/$file"; then
      echo "Couldn't download $file from $url. Check the voice's name is right at https://huggingface.co/rhasspy/piper-voices/tree/main, and that the server can reach Hugging Face." >&2
      exit 1
    fi
    if [ ! -s "$part/$file" ]; then
      echo "$file came back empty from $url, so nothing was saved." >&2
      exit 1
    fi
  done
  rate=$(grep -o '"sample_rate": *[0-9]*' "$part/$name.onnx.json" | grep -o '[0-9]*$')
  if [ -z "$rate" ]; then
    echo "$name.onnx.json doesn't give its sound's sample rate, so nothing was saved." >&2
    exit 1
  fi
  if [ "$rate" != "$(piper_rate "$name")" ]; then
    echo "$name.onnx.json says its sound is $rate Hz, but Jarvis plays a $quality voice at $(piper_rate "$name") Hz, so nothing was saved." >&2
    exit 1
  fi
  mv -f "$part/$name.onnx" "$part/$name.onnx.json" piper/voices/ && mv -f "$part/MODEL_CARD" "piper/voices/$name.MODEL_CARD" || exit 1
  echo "Saved $name in piper/voices. Its MODEL_CARD there says where its recordings came from and their licence."
  exit 0
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
if [ "$voice" != off ] && [ "$voice" != kokoro ] && [ "$voice" != piper ]; then
  echo "JARVIS_VOICE is $voice in jarvis/.env, but it must be off, kokoro or piper." >&2
  exit 1
fi

piper_name=""
if [ "$voice" = piper ]; then
  piper_name=$(piper_voice) || exit 1
  if [ ! -s "piper/voices/$piper_name.onnx" ] || [ ! -s "piper/voices/$piper_name.onnx.json" ]; then
    echo "Piper's voice $piper_name isn't in piper/voices yet. Download it once with: bash host/jarvis.sh piper-voice" >&2
    exit 1
  fi
fi

ears=$(setting JARVIS_EARS)
ears=${ears:-off}
if [ "$ears" != off ] && [ "$ears" != push ] && [ "$ears" != wake ]; then
  echo "JARVIS_EARS is $ears in jarvis/.env, but it must be off, push or wake." >&2
  exit 1
fi

ears_token=""
if [ "$ears" != off ]; then
  ears_token=$(setting EARS_TOKEN ears/.env)
  if [ -z "$ears_token" ]; then
    echo "JARVIS_EARS is $ears, but there's no EARS_TOKEN in ears/.env. The README's ears section says how to make one." >&2
    exit 1
  fi
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
  if [ "$ears" != off ]; then
    API_TOKEN="$token" EARS_TOKEN="$ears_token" exec docker compose -f docker-compose.yaml -f docker-compose.talk.yaml run --rm -e API_TOKEN -e EARS_TOKEN "${mounts[@]}" jarvis
  fi
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
PIPER_VOICE="$piper_name" docker compose up -d "${keep[@]}" --wait --wait-timeout 120 "$voice" || echo "$voice isn't ready, so Jarvis will say his voice is off. If the lines above don't say why, try: docker compose logs --tail 20 $voice" >&2
trap - INT

if [ "$ears" != off ]; then
  SOUND_CARD_NUMBER="$number" AUDIO_GROUP_ID="$group" API_TOKEN="$token" EARS_TOKEN="$ears_token" docker compose -f docker-compose.yaml -f docker-compose.sound.yaml -f docker-compose.talk.yaml run --rm -e API_TOKEN -e EARS_TOKEN "${mounts[@]}" jarvis
else
  SOUND_CARD_NUMBER="$number" AUDIO_GROUP_ID="$group" API_TOKEN="$token" docker compose -f docker-compose.yaml -f docker-compose.sound.yaml run --rm -e API_TOKEN "${mounts[@]}" jarvis
fi
exit $?
