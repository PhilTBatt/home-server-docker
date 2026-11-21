#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

if [ $# -eq 0 ] || [ $# -gt 2 ] || { [ $# -eq 2 ] && [ "$1" != mic-test ]; } || { [ "$1" != mute ] && [ "$1" != unmute ] && [ "$1" != start ] && [ "$1" != stop ] && [ "$1" != whisper-model ] && [ "$1" != mic-test ]; }; then
  echo "Usage: bash host/ears.sh mute|unmute|start|stop|whisper-model, or bash host/ears.sh mic-test [seconds to wait]" >&2
  exit 1
fi

setting() {
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*[=:][[:space:]]*//p" "${2:-ears/.env}" 2> /dev/null | tail -n 1 | sed -E "/^\"[^\"]*\"/{s/^\"([^\"]*)\".*$/\1/;b}; /^'[^']*'/{s/^'([^']*)'.*$/\1/;b}; s/ #.*$//; s/[[:space:]]+$//"
}

card_of() {
  local dir=${SOUND_DIR:-/dev/snd} name target control number
  name=$(setting "$1" "$2")
  if [ -z "$name" ]; then
    echo "No $1 in $2. Set it to $4 from ls /dev/snd/by-path, like pci-0000:04:00.6." >&2
    return 1
  fi
  if [[ "$name" == */* ]] || ! target=$(readlink "$dir/by-path/$name"); then
    echo "$1 is $name, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names." >&2
    return 1
  fi
  control=${target##*/}
  if [[ "$control" =~ ^controlC([0-9]+)$ ]] && [ -e "$dir/$control" ]; then
    number=${BASH_REMATCH[1]}
  else
    echo "/dev/snd/by-path/$name doesn't lead to a sound card's mixer." >&2
    return 1
  fi
  if [ ! -e "$dir/pcmC${number}D0$3" ]; then
    echo "Sound card $number ($name) has no $5 at /dev/snd/pcmC${number}D0$3." >&2
    return 1
  fi
  echo "$number $(stat -c %g "$dir/$control")"
}

mic_card() {
  card_of EARS_SOUND_CARD ears/.env c "the microphone's card" microphone
}

hardened=(--rm --init --log-driver none --network none --cap-drop ALL --security-opt no-new-privileges)

play_back() {
  local ready interrupted=
  trap 'interrupted=1' INT
  IFS= read -r ready || return 3
  [ -z "$interrupted" ] || return 130
  if [ "$ready" != "sound follows" ]; then
    echo "The check sent something other than sound, so nothing was played." >&2
    return 1
  fi
  docker run "${hardened[@]}" -i --user node --group-add "$speakers_group" --device "/dev/snd/controlC$speakers:/dev/snd/controlC$speakers:rw" --device "/dev/snd/pcmC${speakers}D0p:/dev/snd/pcmC${speakers}D0p:rw" home-hub-jarvis sh -c "amixer -q -c $speakers sset Master $volume% $switch_to && exec aplay -q -t raw -f S16_LE -r 16000 -c 1 -D plughw:$speakers,0" || {
    local code=$?
    if [ -z "$interrupted" ]; then
      echo "The recording worked, but it couldn't be played back. If aplay says the device is busy, something else is playing, like Jarvis speaking: wait for it to finish and run this again." >&2
    fi
    return "$code"
  }
}

if [ "$1" = mic-test ]; then
  if [ ! -t 0 ]; then
    echo "mic-test records the room, so it only runs from a terminal someone is typing in, not from a script or an AI tool." >&2
    exit 1
  fi
  wait_for=${2:-0}
  if [[ ! "$wait_for" =~ ^[0-9]{1,2}$ ]] || [ "$((10#$wait_for))" -gt 60 ]; then
    echo "The wait is $wait_for, but it must be a whole number of seconds from 0 to 60, like 10 to give you time to move away from the server." >&2
    exit 1
  fi
  card=$(mic_card) || exit 1
  read -r number group <<< "$card"
  card=$(card_of JARVIS_SOUND_CARD jarvis/.env p "the speakers' name" speakers) || exit 1
  read -r speakers speakers_group <<< "$card"
  volume=$(setting JARVIS_VOLUME jarvis/.env)
  volume=${volume:-80}
  if [[ ! "$volume" =~ ^[0-9]{1,3}$ ]] || [ "$((10#$volume))" -gt 100 ]; then
    echo "JARVIS_VOLUME is $volume in jarvis/.env, but it must be a whole number from 0 to 100, like 80." >&2
    exit 1
  fi
  volume=$((10#$volume))
  switch_to=unmute
  [ "$volume" -eq 0 ] && switch_to=mute
  if [ -n "$(docker compose ps --status running --quiet ears 2> /dev/null)" ] && grep -q '^unmuted' ears/switch/mute 2> /dev/null; then
    echo "Ears is running and unmuted, so it may be using the microphone. Mute it first with bash host/ears.sh mute, run this again, then unmute it." >&2
    exit 1
  fi
  echo "Getting ears's and Jarvis's images ready..."
  docker build -q -t home-hub-ears ears > /dev/null || exit 1
  docker build -q -t home-hub-jarvis jarvis > /dev/null || exit 1
  echo "When it's done, it plays the recording back on sound card $speakers's speakers."
  export EARS_MIC_LEVEL EARS_MIC_CONTROL EARS_MIC_BOOST EARS_MIC_BOOST_CONTROL EARS_WAKE_END EARS_MIC_TEST_WAIT
  EARS_MIC_LEVEL=$(setting EARS_MIC_LEVEL)
  EARS_MIC_CONTROL=$(setting EARS_MIC_CONTROL)
  EARS_MIC_BOOST=$(setting EARS_MIC_BOOST)
  EARS_MIC_BOOST_CONTROL=$(setting EARS_MIC_BOOST_CONTROL)
  EARS_WAKE_END=$(setting EARS_WAKE_END)
  EARS_MIC_TEST_WAIT=$((10#$wait_for))
  interrupted=
  trap 'interrupted=1' INT
  docker run "${hardened[@]}" --group-add "$group" --device "/dev/snd/controlC$number:/dev/snd/controlC$number:rw" --device "/dev/snd/pcmC${number}D0c:/dev/snd/pcmC${number}D0c:rw" -e EARS_MIC_LEVEL -e EARS_MIC_CONTROL -e EARS_MIC_BOOST -e EARS_MIC_BOOST_CONTROL -e EARS_WAKE_END -e EARS_MIC_TEST_WAIT home-hub-ears node dist/mic-test-run.js | play_back
  codes=("${PIPESTATUS[@]}")
  if [ -n "$interrupted" ]; then
    trap - INT
    kill -INT "$$"
  fi
  if [ "${codes[1]}" -ne 0 ] && [ "${codes[1]}" -ne 3 ]; then
    exit "${codes[1]}"
  fi
  if [ "${codes[0]}" -ne 0 ]; then
    exit "${codes[0]}"
  fi
  if [ "${codes[1]}" -eq 3 ]; then
    echo "The check ended without sending any sound, so nothing was played." >&2
    exit 1
  fi
  echo "Done. Run it again from somewhere else to compare."
  exit 0
fi

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
  wake=$(setting EARS_WAKE)
  services=(ears)
  with_card="and Whisper"
  without_card=" and Whisper"
  if [ "$wake" = on ]; then
    if [ -z "$microphone" ]; then
      echo "EARS_WAKE is on, but EARS_MICROPHONE isn't set in ears/.env, so there's nothing to listen with. Set EARS_MICROPHONE=card, or pretend to try it out." >&2
      exit 1
    fi
    threshold=$(setting EARS_WAKE_THRESHOLD)
    threshold=${threshold:-0.5}
    if [[ ! "$threshold" =~ ^0\.[0-9]{1,3}$ ]] || [[ "$threshold" =~ ^0\.0+$ ]]; then
      echo "EARS_WAKE_THRESHOLD is $threshold in ears/.env, but it must be a number above 0 and below 1, with up to 3 decimal places, like 0.5 or 0.65." >&2
      exit 1
    fi
    export WAKE_THRESHOLD="$threshold"
    services+=(openwakeword)
    with_card="Whisper, and openWakeWord at threshold $threshold"
    without_card=", Whisper and openWakeWord at threshold $threshold"
  elif [ -n "$wake" ] && [ "$wake" != off ]; then
    echo "EARS_WAKE is $wake in ears/.env, but it must be on or off." >&2
    exit 1
  fi
  if [ "$microphone" = card ]; then
    card=$(mic_card) || exit 1
    read -r number group <<< "$card"
    echo "Starting ears with sound card $number's microphone, $with_card..."
    MIC_CARD_NUMBER="$number" AUDIO_GROUP_ID="$group" exec docker compose -f docker-compose.yaml -f docker-compose.mic.yaml up -d --build --wait "${services[@]}"
  fi
  echo "Starting ears$without_card..."
  exec docker compose up -d --build --wait "${services[@]}"
fi

if [ "$1" = stop ]; then
  exec docker compose stop ears whisper openwakeword
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
