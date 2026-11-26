#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

if [ $# -eq 0 ] || [ $# -gt 2 ] || { [ $# -eq 2 ] && [ "$1" != mic-test ] && [ "$1" != wake-report ] && [ "$1" != voice-check ]; } || { [ "$1" != mute ] && [ "$1" != unmute ] && [ "$1" != start ] && [ "$1" != stop ] && [ "$1" != talk ] && [ "$1" != whisper-model ] && [ "$1" != mic-test ] && [ "$1" != wake-report ] && [ "$1" != voice-enrol ] && [ "$1" != voice-check ]; }; then
  echo "Usage: bash host/ears.sh mute|unmute|start|stop|talk|whisper-model|voice-enrol, bash host/ears.sh mic-test [seconds to wait], bash host/ears.sh voice-check [seconds to wait], or bash host/ears.sh wake-report [hours]" >&2
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

ears_muted() {
  local state
  if [ -n "$(docker compose ps --status running --quiet ears 2> /dev/null)" ]; then
    state=$(docker compose exec -T ears node dist/ask.js health 2> /dev/null)
    if [[ ! "$state" =~ ^200\ [a-z]+$ ]]; then
      echo "Ears is running but didn't say whether it's muted, so it may be using the microphone. If it has only just started, wait a few seconds and run this again; otherwise stop it with bash host/ears.sh stop, run this again, then start it." >&2
      return 1
    fi
    if [ "$state" != "200 muted" ]; then
      echo "Ears is running and ${state#200 }, not muted, so it may be using the microphone. Mute it with bash host/ears.sh mute, wait a second, run this again, then unmute it." >&2
      return 1
    fi
  fi
}

voiceprint_line='^\{"model":"wespeaker_en_voxceleb_CAM\+\+","clips":[0-9]{1,2},"made":"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z","vector":\[-?[0-9][-0-9.e,]*\]\}$'

save_voiceprint() {
  local ready line extra part
  IFS= read -r ready || return 3
  if [ "$ready" != "voiceprint follows" ]; then
    echo "The enrolment sent something other than a voiceprint, so nothing was saved." >&2
    return 1
  fi
  if ! IFS= read -r line || IFS= read -r extra || [ -n "$extra" ] || [ "${#line}" -gt 20000 ] || [[ ! "$line" =~ $voiceprint_line ]]; then
    echo "The voiceprint didn't come through whole, so nothing was saved." >&2
    return 1
  fi
  if ! { mkdir -p ears/voice && chmod 700 ears/voice && part=$(umask 077 && mktemp ears/voice/.voiceprint.XXXXXX) && printf '%s\n' "$line" > "$part" && chmod 600 "$part" && mv -f "$part" ears/voice/voiceprint.json; }; then
    [ -n "$part" ] && rm -f "$part"
    echo "Couldn't write ears/voice/voiceprint.json, so nothing was saved." >&2
    return 1
  fi
}

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

if [ "$1" = talk ]; then
  if ! running=$(docker compose ps --status running --quiet ears 2> /dev/null); then
    echo "Couldn't ask Docker about ears, so nothing is listening. docker compose ps ears shows why." >&2
    exit 1
  fi
  if [ -z "$running" ]; then
    echo "Ears isn't running, so nothing is listening. Start it with bash host/ears.sh start." >&2
    exit 1
  fi
  said=$(docker compose exec -T ears node dist/ask.js talk 2>&1)
  code=$?
  if [[ "$said" == *"Usage: node dist/ask.js"* ]]; then
    echo "This ears doesn't know the talk button yet, so start it again with bash host/ears.sh start, which rebuilds it." >&2
    exit 1
  fi
  if [ "$code" -ne 0 ]; then
    [ -z "$said" ] && said="Docker couldn't run the talk command in ears."
    echo "$said" >&2
    exit "$code"
  fi
  echo "$said"
  exit 0
fi

if [ "$1" = wake-report ]; then
  hours=${2-}
  if [ $# -eq 2 ] && { [[ ! "$hours" =~ ^[1-9][0-9]{0,2}$ ]] || [ "$hours" -gt 720 ]; }; then
    echo "The hours must be a whole number from 1 to 720, like 6, not \"$hours\"." >&2
    exit 1
  fi
  if ! container=$(docker compose ps -a --quiet ears 2> /dev/null); then
    echo "Couldn't ask Docker about ears, so there's no report. docker compose ps -a ears shows why." >&2
    exit 1
  fi
  if [ -z "$container" ]; then
    echo "Ears has no log yet. Start it with bash host/ears.sh start." >&2
    exit 1
  fi
  since=()
  span="In ears's whole log, which goes back to when its container was last made"
  if [ -n "$hours" ]; then
    since=(--since "${hours}h")
    span="In the last $hours hours of ears's log"
  fi
  if ! log=$(docker compose logs --no-log-prefix "${since[@]}" ears 2> /dev/null); then
    echo "Couldn't read ears's log, so there's no report. docker compose logs ears shows why." >&2
    exit 1
  fi
  awk -v span="$span" '
    /^Recording started by the wake word\.$/ { kind = "wake"; started[kind]++ }
    /^Recording started to hear a follow-up\.$/ { kind = "follow"; started[kind]++ }
    /^Recording started by the talk button\.$/ { kind = "button"; started[kind]++ }
    /^Couldn.t record after the talk button: / { unpressed++ }
    /^A Jarvis chat took the talk-button recording\.$/ { pressTaken++ }
    /^Recording started\.$/ { kind = "other"; started[kind]++ }
    /^Heard the wake word\. / { heard++ }
    /^Heard the wake word, but too late to trust/ { late++ }
    /^Heard the wake word while it wasn.t being listened for/ { unlistened++ }
    /^Couldn.t record after the wake word: / { unstarted++ }
    /^A Jarvis chat took the wake-word recording\.$/ { taken++ }
    /^Recording (stopped|failed) after / && kind != "" {
      cut = 0
      if (/, so it wasn.t sent to Whisper\.$/) quiet[kind]++
      else if (/: no Jarvis chat took it within /) { untaken[kind]++; cut = 1 }
      else if (/^Recording failed after / || /: asked to cancel\.$/ || /: muted\.$/ || /: the switch was flipped while it was recording/) { off[kind]++; cut = 1 }
    }
    /^Speech in it: first heard after [0-9.]+ seconds?, [0-9.]+ seconds? of speech, longest pause between words [0-9.]+ seconds?\.$/ && kind != "" && !cut {
      measured[kind]++
      first[kind, measured[kind]] = $7 + 0
      amount[kind, measured[kind]] = $9 + 0
      pause[kind, measured[kind]] = $17 + 0
    }
    /^Turned into text in / && kind != "" { text[kind]++ }
    /^(Not turned into text|Couldn.t turn it into text): / && kind != "" { untext[kind]++ }
    /^Voice: Score against the voiceprint: -?[0-9.]+\. .* counts as the voiceprint.s voice\.$/ { yours++; score["yours", yours] = $6 + 0 }
    /^Voice: Score against the voiceprint: -?[0-9.]+\. .* counts as a different voice\.$/ { others++; score["others", others] = $6 + 0 }
    /^Voice: (Speech was heard for only|No speech was heard)/ { unjudgedVoice++ }
    /^Voice: couldn.t be checked/ { uncheckedVoice++ }
    /^Not turned into text: the (voice|speech) in it / { blockedVoice++ }
    /^It came while Jarvis was speaking, so it cuts in\.$/ { cutWake++ }
    /^Heard speech while Jarvis was speaking\. / { cutSpeech++ }
    /^Judged by your words: finished, / { finished++ }
    /^Judged by your words: more to come, / { more++ }
    /^Judged by your words: unsure, / { unsure++ }
    /^Judged by your words: .*, by a Jarvis chat \(/ { chat++ }
    /^Your words weren.t (judged in time|looked at)/ { unjudged++ }
    /^Turned into text in 0 seconds: the text made while you paused was used\.$/ { reused++ }
    function sort(k, which, count,   i, j, value) {
      for (i = 1; i <= count; i++) {
        value = which == "first" ? first[k, i] : which == "amount" ? amount[k, i] : pause[k, i]
        for (j = i - 1; j >= 1 && list[j] > value; j--) list[j + 1] = list[j]
        list[j + 1] = value
      }
    }
    function median(count) {
      return count % 2 == 1 ? list[(count + 1) / 2] : (list[count / 2] + list[count / 2 + 1]) / 2
    }
    function speech(k, name,   count, line) {
      count = measured[k] + 0
      if (count == 0) return sprintf("- Speech in %s: none measured yet.", name)
      sort(k, "first", count)
      line = sprintf("- Speech in %s, from %d with speech (leaving out any cut short): first heard after a median of %.1f s (%.1f to %.1f s)", name, count, median(count), list[1], list[count])
      sort(k, "amount", count)
      line = line sprintf("; a median of %.1f s of speech", median(count))
      sort(k, "pause", count)
      return line sprintf("; longest pause between words a median of %.1f s, at most %.1f s.", median(count), list[count])
    }
    function scores(which, count,   i, j, value) {
      if (count == 0) return ""
      for (i = 1; i <= count; i++) {
        value = score[which, i]
        for (j = i - 1; j >= 1 && list[j] > value; j--) list[j + 1] = list[j]
        list[j + 1] = value
      }
      return sprintf(" (scores %.2f to %.2f, median %.2f)", list[1], list[count], median(count))
    }
    function outcomes(k) {
      return sprintf("cancelled, muted or failed, %d; turned into text, %d; not turned into text after all, %d.", off[k], text[k], untext[k])
    }
    END {
      print span ":"
      printf "- \"Hey Jarvis\" heard: %d. Ignored: %d as too late to trust (or with no usable time), %d that came after ears stopped listening.\n", heard, late, unlistened
      printf "- Wake recordings: %d, and %d that failed to start. A chat took %d, and no chat took %d in time. Of them: no speech in time, so not sent to Whisper (a false wake, or nothing said after it), %d; %s\n", started["wake"], unstarted, taken, untaken["wake"], quiet["wake"], outcomes("wake")
      printf "- Follow-up windows: %d. Of them: no speech in time, %d; %s\n", started["follow"], quiet["follow"], outcomes("follow")
      printf "- Talk-button recordings: %d, and %d that failed to start. A chat took %d, and no chat took %d in time. Of them: no speech in time, so not sent to Whisper, %d; %s\n", started["button"], unpressed, pressTaken, untaken["button"], quiet["button"], outcomes("button")
      printf "- Other recordings (/talk, or ask.js start): %d. Of them: %s\n", started["other"], outcomes("other")
      print speech("wake", "wake recordings")
      print speech("follow", "follow-up windows")
      print speech("button", "talk-button recordings")
      if (yours + others + unjudgedVoice + uncheckedVoice > 0) printf "- Voice ID: counted as your voice, %d%s; as a different voice, %d%s; too little speech to judge, %d; couldn\047t be checked, %d. Not turned into text because of the voice: %d.\n", yours, scores("yours", yours), others, scores("others", others), unjudgedVoice, uncheckedVoice, blockedVoice
      if (cutWake + cutSpeech > 0) printf "- Cut-ins while Jarvis was speaking: %d by the wake word, %d by speech (those start a wake recording with no wake word heard).\n", cutWake, cutSpeech
      if (finished + more + unsure + unjudged > 0) printf "- Judged by your words: finished, %d; more to come, %d; unsure, %d; not judged, %d. A Jarvis chat gave the answer for %d of them. The text made at a pause was used for %d, so Whisper wasn\047t asked again.\n", finished, more, unsure, unjudged, chat, reused
    }' <<< "$log"
  exit 0
fi

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
  echo "Getting ears's and Jarvis's images ready..."
  docker build -q -t home-hub-ears ears > /dev/null || exit 1
  docker build -q -t home-hub-jarvis jarvis > /dev/null || exit 1
  ears_muted || exit 1
  echo "When it's done, it plays the recording back on sound card $speakers's speakers."
  export EARS_MIC_LEVEL EARS_MIC_CONTROL EARS_MIC_BOOST EARS_MIC_BOOST_CONTROL EARS_WAKE_END EARS_WAKE_PAUSE EARS_MIC_TEST_WAIT
  EARS_MIC_LEVEL=$(setting EARS_MIC_LEVEL)
  EARS_MIC_CONTROL=$(setting EARS_MIC_CONTROL)
  EARS_MIC_BOOST=$(setting EARS_MIC_BOOST)
  EARS_MIC_BOOST_CONTROL=$(setting EARS_MIC_BOOST_CONTROL)
  EARS_WAKE_END=$(setting EARS_WAKE_END)
  EARS_WAKE_PAUSE=$(setting EARS_WAKE_PAUSE)
  EARS_MIC_TEST_WAIT=$((10#$wait_for))
  interrupted=
  trap 'interrupted=1' INT
  docker run "${hardened[@]}" --group-add "$group" --device "/dev/snd/controlC$number:/dev/snd/controlC$number:rw" --device "/dev/snd/pcmC${number}D0c:/dev/snd/pcmC${number}D0c:rw" -e EARS_MIC_LEVEL -e EARS_MIC_CONTROL -e EARS_MIC_BOOST -e EARS_MIC_BOOST_CONTROL -e EARS_WAKE_END -e EARS_WAKE_PAUSE -e EARS_MIC_TEST_WAIT home-hub-ears node dist/mic-test-run.js | play_back
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

if [ "$1" = voice-enrol ] || [ "$1" = voice-check ]; then
  if [ ! -t 0 ]; then
    echo "$1 records the room, so it only runs from a terminal someone is typing in, not from a script or an AI tool." >&2
    exit 1
  fi
  wait_for=${2:-0}
  if [[ ! "$wait_for" =~ ^[0-9]{1,2}$ ]] || [ "$((10#$wait_for))" -gt 60 ]; then
    echo "The wait is $wait_for, but it must be a whole number of seconds from 0 to 60, like 10 to give you time to get where you'll talk from." >&2
    exit 1
  fi
  if [ "$1" = voice-check ] && [ ! -f ears/voice/voiceprint.json ]; then
    echo "There's no voiceprint yet: make one with bash host/ears.sh voice-enrol" >&2
    exit 1
  fi
  card=$(mic_card) || exit 1
  read -r number group <<< "$card"
  echo "Getting ears's image ready..."
  docker build -q -t home-hub-ears ears > /dev/null || exit 1
  ears_muted || exit 1
  export EARS_MIC_LEVEL EARS_MIC_CONTROL EARS_MIC_BOOST EARS_MIC_BOOST_CONTROL EARS_VOICE_ID_THRESHOLD EARS_VOICE_CHECK_WAIT
  EARS_MIC_LEVEL=$(setting EARS_MIC_LEVEL)
  EARS_MIC_CONTROL=$(setting EARS_MIC_CONTROL)
  EARS_MIC_BOOST=$(setting EARS_MIC_BOOST)
  EARS_MIC_BOOST_CONTROL=$(setting EARS_MIC_BOOST_CONTROL)
  EARS_VOICE_ID_THRESHOLD=$(setting EARS_VOICE_ID_THRESHOLD)
  EARS_VOICE_CHECK_WAIT=$((10#$wait_for))
  microphone=(--group-add "$group" --device "/dev/snd/controlC$number:/dev/snd/controlC$number:rw" --device "/dev/snd/pcmC${number}D0c:/dev/snd/pcmC${number}D0c:rw" -e EARS_MIC_LEVEL -e EARS_MIC_CONTROL -e EARS_MIC_BOOST -e EARS_MIC_BOOST_CONTROL -e EARS_VOICE_ID_THRESHOLD)
  if [ "$1" = voice-check ]; then
    exec docker run "${hardened[@]}" --user "$(id -u):$(id -g)" "${microphone[@]}" -e EARS_VOICE_CHECK_WAIT --mount "type=bind,source=$PWD/ears/voice,target=/voice,readonly" home-hub-ears node dist/voice-check-run.js
  fi
  had=
  [ -f ears/voice/voiceprint.json ] && had=1
  interrupted=
  trap 'interrupted=1' INT
  docker run "${hardened[@]}" "${microphone[@]}" home-hub-ears node dist/voice-enrol-run.js | save_voiceprint
  codes=("${PIPESTATUS[@]}")
  if [ -n "$interrupted" ]; then
    trap - INT
    kill -INT "$$"
  fi
  if [ "${codes[0]}" -ne 0 ]; then
    exit "${codes[0]}"
  fi
  if [ "${codes[1]}" -eq 3 ]; then
    echo "The enrolment ended without sending a voiceprint, so nothing was saved." >&2
    exit 1
  fi
  if [ "${codes[1]}" -ne 0 ]; then
    exit "${codes[1]}"
  fi
  if [ -n "$had" ]; then
    echo "Saved your new voiceprint in ears/voice/voiceprint.json, in place of the old one. Only you can read it, and git ignores it."
  else
    echo "Saved your voiceprint in ears/voice/voiceprint.json. Only you can read it, and git ignores it."
  fi
  echo "Try it with bash host/ears.sh voice-check."
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
  voice=$(setting EARS_VOICE_ID)
  voice_file=()
  if [ "$voice" = observe ] || [ "$voice" = require ]; then
    if [ ! -f ears/voice/voiceprint.json ]; then
      echo "EARS_VOICE_ID is $voice in ears/.env, but there's no voiceprint yet. Make one with: bash host/ears.sh voice-enrol" >&2
      exit 1
    fi
    voice_file=(-f docker-compose.voice.yaml)
    with_card="$with_card, with your voiceprint"
    without_card="$without_card, with your voiceprint"
  elif [ -n "$voice" ] && [ "$voice" != off ]; then
    echo "EARS_VOICE_ID is $voice in ears/.env, but it must be off, observe or require." >&2
    exit 1
  fi
  if [ "$microphone" = card ]; then
    card=$(mic_card) || exit 1
    read -r number group <<< "$card"
    echo "Starting ears with sound card $number's microphone, $with_card..."
    MIC_CARD_NUMBER="$number" AUDIO_GROUP_ID="$group" exec docker compose -f docker-compose.yaml -f docker-compose.mic.yaml "${voice_file[@]}" up -d --build --wait "${services[@]}"
  fi
  echo "Starting ears$without_card..."
  if [ ${#voice_file[@]} -gt 0 ]; then
    exec docker compose -f docker-compose.yaml "${voice_file[@]}" up -d --build --wait "${services[@]}"
  fi
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
