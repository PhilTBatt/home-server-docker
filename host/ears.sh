#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

if [ $# -ne 1 ] || { [ "$1" != mute ] && [ "$1" != unmute ] && [ "$1" != start ] && [ "$1" != stop ] && [ "$1" != whisper-model ]; }; then
  echo "Usage: bash host/ears.sh mute|unmute|start|stop|whisper-model" >&2
  exit 1
fi

setting() {
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*[=:][[:space:]]*//p" ears/.env 2> /dev/null | tail -n 1 | sed -E "/^\"[^\"]*\"/{s/^\"([^\"]*)\".*$/\1/;b}; /^'[^']*'/{s/^'([^']*)'.*$/\1/;b}; s/ #.*$//; s/[[:space:]]+$//"
}

mic_card() {
  local dir=${SOUND_DIR:-/dev/snd} name target control number
  name=$(setting EARS_SOUND_CARD)
  if [ -z "$name" ]; then
    echo "No EARS_SOUND_CARD in ears/.env. Set it to the microphone's card from ls /dev/snd/by-path, like pci-0000:04:00.6." >&2
    return 1
  fi
  if [[ "$name" == */* ]] || ! target=$(readlink "$dir/by-path/$name"); then
    echo "EARS_SOUND_CARD is $name, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names." >&2
    return 1
  fi
  control=${target##*/}
  if [[ "$control" =~ ^controlC([0-9]+)$ ]] && [ -e "$dir/$control" ]; then
    number=${BASH_REMATCH[1]}
  else
    echo "/dev/snd/by-path/$name doesn't lead to a sound card's mixer." >&2
    return 1
  fi
  if [ ! -e "$dir/pcmC${number}D0c" ]; then
    echo "Sound card $number ($name) has no microphone at /dev/snd/pcmC${number}D0c." >&2
    return 1
  fi
  echo "$number $(stat -c %g "$dir/$control")"
}

whisper_model=base-int8
whisper_files=(config.json model.bin vocabulary.txt tokenizer.json)
whisper_sizes=(2020 79120341 459861 2480466)
whisper_model_sha256=ae13f74db4d23c2746863880e87f15bf780bd2ee0a8b9c7dd967b9343a227081

model_ready() {
  local index
  for index in "${!whisper_files[@]}"; do
    [ "$(stat -c %s "whisper/models/$whisper_model/${whisper_files[$index]}" 2> /dev/null)" = "${whisper_sizes[$index]}" ] || return 1
  done
}

whisper_url() {
  if [ "$1" = tokenizer.json ]; then
    echo "https://huggingface.co/openai/whisper-tiny/resolve/169d4a4341b33bc18d8881c4b69c2e104e1cc0af/tokenizer.json"
  else
    echo "https://huggingface.co/rhasspy/faster-whisper-base-int8/resolve/a9667415b1b62cc5f4bab65ec7a50f2f4035f7f4/$1"
  fi
}

if [ "$1" = whisper-model ]; then
  if [ -d "whisper/models/$whisper_model" ]; then
    if model_ready; then
      echo "Whisper's model is already in whisper/models/$whisper_model. To download it again, remove that folder first."
      exit 0
    fi
    echo "whisper/models/$whisper_model is there but isn't the whole model. Remove that folder, then run this again." >&2
    exit 1
  fi
  mkdir -p whisper/models || exit 1
  part=$(mktemp -d whisper/models/.download.XXXXXX) || exit 1
  trap 'rm -rf "$part"' EXIT
  echo "Downloading Whisper's $whisper_model model from Hugging Face..."
  for index in "${!whisper_files[@]}"; do
    file=${whisper_files[$index]}
    url=$(whisper_url "$file")
    if ! curl -fsS -L --proto =https --proto-redir =https -m 600 -o "$part/$file" "$url"; then
      echo "Couldn't download $file from $url. Check the server can reach Hugging Face." >&2
      exit 1
    fi
    size=$(stat -c %s "$part/$file")
    if [ "$size" != "${whisper_sizes[$index]}" ]; then
      echo "$file came back as $size bytes, not the ${whisper_sizes[$index]} it should be, so nothing was saved." >&2
      exit 1
    fi
  done
  if [ "$(sha256sum "$part/model.bin" | cut -d ' ' -f 1)" != "$whisper_model_sha256" ]; then
    echo "model.bin isn't the file Hugging Face lists for this model, so nothing was saved." >&2
    exit 1
  fi
  chmod 755 "$part" && chmod 644 "$part"/* && mv "$part" "whisper/models/$whisper_model" || exit 1
  echo "Saved Whisper's $whisper_model model in whisper/models/$whisper_model."
  exit 0
fi

if [ "$1" = start ]; then
  if [ ! -d "whisper/models/$whisper_model" ]; then
    echo "Whisper's model isn't in whisper/models yet. Download it once with: bash host/ears.sh whisper-model" >&2
    exit 1
  fi
  if ! model_ready; then
    echo "whisper/models/$whisper_model isn't the whole model. Remove that folder, then run: bash host/ears.sh whisper-model" >&2
    exit 1
  fi
  microphone=$(setting EARS_MICROPHONE)
  if [ "$microphone" = card ]; then
    card=$(mic_card) || exit 1
    read -r number group <<< "$card"
    echo "Starting ears with sound card $number's microphone, and Whisper..."
    MIC_CARD_NUMBER="$number" AUDIO_GROUP_ID="$group" exec docker compose -f docker-compose.yaml -f docker-compose.mic.yaml up -d --build --wait ears
  fi
  echo "Starting ears and Whisper..."
  exec docker compose up -d --build --wait ears
fi

if [ "$1" = stop ]; then
  exec docker compose stop ears whisper
fi

if [ "$1" = mute ]; then
  says=muted
else
  says="unmuted $(date +%s%N)"
fi

part=""
if ! { mkdir -p ears/switch && part=$(mktemp ears/switch/.mute.XXXXXX) && printf '%s\n' "$says" > "$part" && chmod 644 "$part" && mv -f "$part" ears/switch/mute; }; then
  [ -n "$part" ] && rm -f "$part"
  if [ ! -d ears/switch ]; then
    echo "Couldn't make the folder ears/switch, so nothing was written. Ears won't start without it." >&2
    exit 1
  fi
  if [ "$1" = unmute ]; then
    echo "Couldn't write ears/switch/mute, so nothing changed." >&2
    exit 1
  fi
  if rm -f ears/switch/mute 2> /dev/null && [ ! -e ears/switch/mute ]; then
    echo "Couldn't write ears/switch/mute, so it was removed instead. Ears counts a missing switch as muted, and ends any recording within about a second."
    exit 0
  fi
  echo "Couldn't write or remove ears/switch/mute, so ears may still be unmuted. Stop it with: docker compose stop ears" >&2
  exit 1
fi

if [ "$1" = mute ]; then
  echo "Muted. Ears ends any recording within about a second, and records nothing until it's unmuted."
else
  echo "Unmuted. Ears notices within a second. If ears restarts, it comes back muted and needs this again."
fi
