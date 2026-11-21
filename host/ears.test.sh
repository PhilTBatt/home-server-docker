#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
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

fresh() {
  rm -rf "$work/repo"
  mkdir -p "$work/repo/host"
  cp "$here/ears.sh" "$work/repo/host/ears.sh"
}

run() {
  (cd "$work/repo" && bash host/ears.sh "$@" < /dev/null 2>&1)
}

switch="$work/repo/ears/switch/mute"

fresh
output=$(run mute)
status=$?
check "mute writes muted to ears/switch/mute, making the folder" "muted" "$(cat "$switch")"
check "and succeeds" "0" "$status"
check_has "saying what it means" "Muted. Ears ends any recording within about a second, and records nothing until it's unmuted." "$output"
check "the file can be read by ears's own user, and only written by its owner" "644" "$(stat -c %a "$switch")"
check "nothing else is left in the folder" "mute" "$(ls -A "$work/repo/ears/switch")"

fresh
output=$(run unmute)
status=$?
check "unmute writes unmuted and an id" "1" "$(grep -c '^unmuted [0-9]\{19\}$' "$switch")"
check "and succeeds" "0" "$status"
check_has "saying a restart mutes it again" "Unmuted. Ears notices within a second. If ears restarts, it comes back muted and needs this again." "$output"
check "it's one line" "1" "$(wc -l < "$switch")"
first=$(cat "$switch")
sleep 0.01
run unmute > /dev/null
check "each unmute writes a new id, so ears can tell it from one that was there when it started" "different" "$([ "$first" != "$(cat "$switch")" ] && echo different || echo same)"
run mute > /dev/null
check "mute after unmute" "muted" "$(cat "$switch")"
run mute > /dev/null
check "mute twice" "muted" "$(cat "$switch")"
check "nothing else is left in the folder" "mute" "$(ls -A "$work/repo/ears/switch")"

fresh
mkdir -p "$work/repo/ears/switch"
echo "unmuted 1" > "$switch"
ino_before=$(stat -c %i "$switch")
run mute > /dev/null
check "the file is replaced in one step, never rewritten in place, so ears can't read half of it" "replaced" "$([ "$(stat -c %i "$switch")" != "$ino_before" ] && echo replaced || echo "rewritten in place")"

for args in "" "on" "off" "Mute" "mute now" "unmute extra" "--help" "status"; do
  fresh
  read -r -a words <<< "$args"
  output=$(run "${words[@]}")
  check "an unknown or missing argument is refused: '$args'" "1" "$?"
  check "and nothing is written: '$args'" "no folder" "$([ -e "$work/repo/ears" ] && echo folder || echo "no folder")"
  check_has "with the usage: '$args'" "Usage: bash host/ears.sh mute|unmute" "$output"
done

if [ "$(id -u)" != 0 ]; then
  fresh
  mkdir -p "$work/repo/ears/switch"
  echo muted > "$switch"
  chmod 555 "$work/repo/ears/switch"
  output=$(run unmute)
  check "if the folder can't be written, unmute says so and fails" "1" "$?"
  check "and the file is as it was" "muted" "$(cat "$switch")"
  check_has "saying nothing changed" "nothing changed" "$output"
  echo "unmuted 5" > "$switch"
  output=$(run mute)
  check "if the folder can't be written, mute fails too, since the file can't be removed either" "1" "$?"
  check_has "saying ears may still be unmuted, and how to stop it" "Couldn't write or remove ears/switch/mute, so ears may still be unmuted. Stop it with: docker compose stop ears" "$output"
  chmod 755 "$work/repo/ears/switch"
  fresh
  mkdir -p "$work/repo/ears"
  chmod 555 "$work/repo/ears"
  output=$(run mute)
  check "if the switch's folder can't be made, mute fails" "1" "$?"
  check_has "saying so, and that ears won't start without it" "Couldn't make the folder ears/switch, so nothing was written. Ears won't start without it." "$output"
  check "rather than saying the switch was removed" "0" "$(grep -c "removed instead" <<< "$output")"
  chmod 755 "$work/repo/ears"
fi

fresh
mkdir -p "$work/bin"
printf '#!/bin/bash\nexit 1\n' > "$work/bin/mv"
chmod +x "$work/bin/mv"
mkdir -p "$work/repo/ears/switch"
echo muted > "$switch"
output=$(cd "$work/repo" && PATH="$work/bin:$PATH" bash host/ears.sh unmute 2>&1)
check "if the file can't be put in place, it fails" "1" "$?"
check "and leaves no half-written file behind, and the switch as it was" "mute|muted" "$(ls -A "$work/repo/ears/switch" | tr '\n' ' ' | sed 's/ $//')|$(cat "$switch")"
check_has "saying nothing changed" "Couldn't write ears/switch/mute, so nothing changed." "$output"
echo "unmuted 5" > "$switch"
output=$(cd "$work/repo" && PATH="$work/bin:$PATH" bash host/ears.sh mute 2>&1)
check "if a mute can't be written, as on a full disk, the switch is removed instead, which counts as muted" "0|gone|" "$?|$([ -e "$switch" ] && echo there || echo gone)|$(ls -A "$work/repo/ears/switch")"
check_has "saying so" "Couldn't write ears/switch/mute, so it was removed instead. Ears counts a missing switch as muted" "$output"
printf '#!/bin/bash\nexit 1\n' > "$work/bin/rm"
chmod +x "$work/bin/rm"
echo "unmuted 6" > "$switch"
output=$(cd "$work/repo" && PATH="$work/bin:$PATH" bash host/ears.sh mute 2>&1)
check "if a mute can be neither written nor removed, it fails" "1" "$?"
check "and the switch is as it was" "unmuted 6" "$(cat "$switch")"
check_has "saying ears may still be unmuted, and how to stop it" "Couldn't write or remove ears/switch/mute, so ears may still be unmuted. Stop it with: docker compose stop ears" "$output"
command rm -f "$work/repo/ears/switch/".mute.*
rm -rf "$work/bin"

fresh
cd "$work" || exit 1
output=$(bash "$work/repo/host/ears.sh" mute 2>&1)
check "it works from any folder, writing into the repo it's in" "muted" "$(cat "$switch")"
cd "$here" || exit 1

compose_file="$here/../docker-compose.yaml"
ears=$(awk '/^  ears:$/ {on=1; next} on && /^  [a-z]/ {on=0} on && /^[a-z]/ {on=0} on' <(sed -n '/^services:$/,/^networks:$/p' "$compose_file"))
check "ears is built from its own folder" "    build: ./ears" "$(grep '^    build:' <<< "$ears")"
check "ears publishes no port" "0" "$(grep -c -e 'ports:' -e 'expose:' -e 'network_mode' <<< "$ears")"
check "in the main file ears gets no devices and no extra rights: a microphone only comes with docker-compose.mic.yaml" "0" "$(grep -c -e 'devices:' -e 'privileged' -e 'cap_add' -e 'docker.sock' -e 'group_add' -e 'user:' -e 'pid:' -e 'ipc:' -e 'security_opt' -e 'extra_hosts' <<< "$ears")"
check "its settings and token come from its own git-ignored file" "    env_file:
      - ./ears/.env" "$(grep -A1 '^    env_file:$' <<< "$ears")"
check "its one folder is the switch, read-only, and Docker won't make it if it's missing" "    volumes:
      - type: bind
        source: ./ears/switch
        target: /switch
        read_only: true
        bind:
          create_host_path: false" "$(grep -A6 '^    volumes:$' <<< "$ears")"
check "and it has no other" "1" "$(grep -c -e 'source:' -e '^      - [./~][^ ]*:' <<< "$ears")"
check "ears is on its own network and no other" "    networks:
      - ears" "$(grep -A2 '^    networks:$' <<< "$ears" | grep -e 'networks:' -e '^      - ')"
check "ears only starts when it's named" "    profiles:
      - ears" "$(grep -A1 '^    profiles:$' <<< "$ears")"
check "ears never restarts by itself" "0" "$(grep -c 'restart:' <<< "$ears")"
check "ears has a memory limit" "1" "$(grep -c '^    mem_limit: [0-9]*m$' <<< "$ears")"
check "its healthcheck asks its own health with its own helper, which reads the token itself, so it's never on a command line, and prints only the state's word, so Docker never keeps the text" '    healthcheck:
      test: ["CMD", "node", "/app/dist/ask.js", "health"]
      interval: 1m
      timeout: 5s
      retries: 3
      start_period: 30s
      start_interval: 2s' "$(grep -A6 '^    healthcheck:$' <<< "$ears")"
check "the port is the one ears listens on" "1" "$(grep -c '^export const earsPort = 8090;$' "$here/../ears/src/server.ts")"
check "and the switch is where ears reads it" "1" "$(grep -c '^export const switchFile = "/switch/mute";$' "$here/../ears/src/mute.ts")"
networks=$(sed -n '/^networks:$/,$p' "$compose_file")
check "the ears network has no way out, and the server has no address on it" "  ears:
    internal: true
    driver_opts:
      com.docker.network.bridge.gateway_mode_ipv4: isolated" "$(grep -A3 '^  ears:$' <<< "$networks")"
check "and nothing else is set on it" "0" "$(grep -A4 '^  ears:$' <<< "$networks" | tail -n +5 | grep -c '^    ')"
others=$(awk '/^  ears:$/ {skip=1; next} skip && /^  [a-z]/ {skip=0} skip && /^[a-z]/ {skip=0} !skip' <(sed -n '/^services:$/,/^networks:$/p' "$compose_file"))
check "only Whisper and openWakeWord join ears on its network" "  whisper:
  openwakeword:" "$(awk '/^  [a-z]/ {name=$0; net=0} /^    networks:$/ {net=1; next} /^    [a-z]/ {net=0} net && /^      - ears$/ {print name}' <<< "$others")"
check "the sound file doesn't put Jarvis on it" "0" "$(grep -c 'ears' "$here/../docker-compose.sound.yaml")"
check "the switch, ears's settings and its build are git-ignored" "ears/node_modules/ ears/dist/ ears/switch/ " "$(grep '^ears/' "$here/../.gitignore" | tr '\n' ' ')"
check "and so is Whisper's model" "whisper/models/" "$(grep '^whisper/' "$here/../.gitignore")"
check "and .env files are too" "1" "$(grep -c '^\.env$' "$here/../.gitignore")"
check "the image runs as node, not root" "USER node" "$(grep '^USER' "$here/../ears/Dockerfile")"
check "the image doesn't get the test files" "1" "$(grep -c '^\*\*/\*\.test\.ts$' "$here/../ears/.dockerignore")"
check "and installs only alsa-utils, for arecord and amixer, in the image it runs from, not the one it's built in" "RUN apk add --no-cache alsa-utils|10" "$(grep -e 'apk' -e 'apt' -e 'omit=dev' "$here/../ears/Dockerfile")|$(grep -n 'alsa-utils' "$here/../ears/Dockerfile" | cut -d: -f1)"
check "ears has no packages it runs with, only the two to build and test it" "0" "$(grep -c '"dependencies"' "$here/../ears/package.json")"

check "ears waits for Whisper to be healthy, which also starts it" "    depends_on:
      whisper:
        condition: service_healthy" "$(grep -A2 '^    depends_on:$' <<< "$ears")"
whisper=$(awk '/^  whisper:$/ {on=1; next} on && /^  [a-z]/ {on=0} on && /^[a-z]/ {on=0} on' <(sed -n '/^services:$/,/^networks:$/p' "$compose_file"))
check "Whisper is pinned by version and digest" "    image: rhasspy/wyoming-whisper:3.8.1@sha256:ba6fcb6056ebe237d15a325381763a80af2fc8fcedaa04f6a714a7375eb20d80" "$(grep '^    image:' <<< "$whisper")"
check "it only starts with ears" "    profiles:
      - ears" "$(grep -A1 '^    profiles:$' <<< "$whisper")"
check "it runs as a user with no account on the server, not root and not mine" '    user: "10300:10300"' "$(grep '^    user:' <<< "$whisper")"
check "and with Docker's init as its first process, so a stop reaches it" '    init: true' "$(grep '^    init:' <<< "$whisper")"
check "it loads the model from its folder, in English, never downloading" '    command: ["--model", "/models/base-int8", "--stt-library", "faster-whisper", "--language", "en", "--local-files-only"]' "$(grep '^    command:' <<< "$whisper")"
check "Python loads the file that quietens its transcript line, and Hugging Face's library stays offline" '    environment:
      PYTHONPATH: /quiet
      HF_HUB_OFFLINE: "1"' "$(grep -A2 '^    environment:$' <<< "$whisper")"
check "its model and that file are mounted read-only, and Docker won't make them if they're missing" "    volumes:
      - type: bind
        source: ./whisper/models
        target: /models
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: ./whisper/sitecustomize.py
        target: /quiet/sitecustomize.py
        read_only: true
        bind:
          create_host_path: false" "$(grep -A12 '^    volumes:$' <<< "$whisper")"
check "and it has no other" "2" "$(grep -c -e 'source:' -e '^      - [./~][^ ]*:' <<< "$whisper")"
check "its /tmp, where it writes each recording while it works, is in memory, never on disk" "    tmpfs:
      - /tmp" "$(grep -A1 '^    tmpfs:$' <<< "$whisper")"
check "it publishes no port, gets no devices and no extra rights" "0" "$(grep -c -e 'ports:' -e 'expose:' -e 'network_mode' -e 'devices:' -e 'privileged' -e 'cap_add' -e 'docker.sock' -e 'group_add' -e 'pid:' -e 'ipc:' -e 'security_opt' -e 'extra_hosts' -e 'restart:' <<< "$whisper")"
check "it has a memory limit" "1" "$(grep -c '^    mem_limit: [0-9]*[mg]$' <<< "$whisper")"
check "it's on the ears network and no other" "    networks:
      - ears" "$(grep -A2 '^    networks:$' <<< "$whisper" | grep -e 'networks:' -e '^      - ')"
check "its healthcheck asks it to describe itself, with its own check" '    healthcheck:
      test: ["CMD", "/usr/src/.venv/bin/python3", "-m", "wyoming_faster_whisper.health_check"]' "$(grep -A1 '^    healthcheck:$' <<< "$whisper")"
check "the quietening file only lifts that one logger to warnings" 'import logging

logging.getLogger("wyoming_faster_whisper.dispatch_handler").setLevel(logging.WARNING)' "$(cat "$here/../whisper/sitecustomize.py")"
check "ears asks Whisper by the service's name on Wyoming's usual port" "export const whisperHost = \"whisper\";
export const whisperPort = 10300;" "$(grep -e '^export const whisperHost' -e '^export const whisperPort' "$here/../ears/src/whisper.ts")"
wake=$(awk '/^  openwakeword:$/ {on=1; next} on && /^  [a-z]/ {on=0} on && /^[a-z]/ {on=0} on' <(sed -n '/^services:$/,/^networks:$/p' "$compose_file"))
check "openWakeWord is pinned by version and digest" "    image: rhasspy/wyoming-openwakeword:2.1.0@sha256:52cb1168731a1849fc28cf339c935fde58746bbabc94226668a40ef6ddf5d42b" "$(grep '^    image:' <<< "$wake")"
check "it only starts when it's named, which host/ears.sh does when EARS_WAKE is on" "    profiles:
      - wake" "$(grep -A1 '^    profiles:$' <<< "$wake")"
check "it runs as a user with no account on the server, not root and not mine" '    user: "10400:10400"' "$(grep '^    user:' <<< "$wake")"
check "and with Docker's init as its first process, so a stop reaches it" '    init: true' "$(grep '^    init:' <<< "$wake")"
check "its threshold comes from the script, and is openWakeWord's own 0.5 if it's run another way" '    command: ["--threshold", "${WAKE_THRESHOLD:-0.5}"]' "$(grep '^    command:' <<< "$wake")"
check "its one file is its health check, mounted read-only, and Docker won't make it if it's missing" "    volumes:
      - type: bind
        source: ./openwakeword/health.py
        target: /health/health.py
        read_only: true
        bind:
          create_host_path: false" "$(grep -A6 '^    volumes:$' <<< "$wake")"
check "and it has no other" "1" "$(grep -c -e 'source:' -e '^      - [./~][^ ]*:' <<< "$wake")"
check "its /tmp is in memory" "    tmpfs:
      - /tmp" "$(grep -A1 '^    tmpfs:$' <<< "$wake")"
check "it publishes no port, gets no devices and no extra rights, and never restarts by itself" "0" "$(grep -c -e 'ports:' -e 'expose:' -e 'network_mode' -e 'devices:' -e 'privileged' -e 'cap_add' -e 'docker.sock' -e 'group_add' -e 'pid:' -e 'ipc:' -e 'security_opt' -e 'extra_hosts' -e 'restart:' -e 'environment:' -e 'env_file:' <<< "$wake")"
check "it has a 256 MB memory limit" "    mem_limit: 256m" "$(grep '^    mem_limit:' <<< "$wake")"
check "it's on the ears network and no other" "    networks:
      - ears" "$(grep -A2 '^    networks:$' <<< "$wake" | grep -e 'networks:' -e '^      - ')"
check "its healthcheck runs that file with the image's own Python" '    healthcheck:
      test: ["CMD", "/usr/src/.venv/bin/python3", "/health/health.py"]' "$(grep -A1 '^    healthcheck:$' <<< "$wake")"
check "the health check asks the server to describe itself on its own port, and passes only if it has hey_jarvis" "1|1|1" "$(grep -c 'AsyncTcpClient("127.0.0.1", 10400)' "$here/../openwakeword/health.py")|$(grep -c 'return 0 if "hey_jarvis" in names else 1' "$here/../openwakeword/health.py")|$(grep -c 'asyncio.wait_for(check(), 5)' "$here/../openwakeword/health.py")"
check "ears asks openWakeWord by the service's name on Wyoming's usual wake port, for hey_jarvis" 'export const wakeWord = "hey_jarvis";
export const wakeHost = "openwakeword";
export const wakePort = 10400;' "$(grep -e '^export const wakeWord' -e '^export const wakeHost' -e '^export const wakePort' "$here/../ears/src/listener.ts")"
mic_file="$here/../docker-compose.mic.yaml"
check "the mic file gives ears only the named card's mixer and microphone, and the audio group" 'services:
  ears:
    devices:
      - /dev/snd/controlC${MIC_CARD_NUMBER:?start it with bash host/ears.sh start}:/dev/snd/controlC${MIC_CARD_NUMBER:?}:rw
      - /dev/snd/pcmC${MIC_CARD_NUMBER:?}D0c:/dev/snd/pcmC${MIC_CARD_NUMBER:?}D0c:rw
    group_add:
      - "${AUDIO_GROUP_ID:?start it with bash host/ears.sh start}"' "$(cat "$mic_file")"
check "never a speaker" "0" "$(grep -c 'D[0-9]*p' "$mic_file")"

mkdir -p "$work/bin"
cat > "$work/bin/docker" <<'FAKE'
#!/bin/bash
echo "docker $* | MIC_CARD_NUMBER=${MIC_CARD_NUMBER:-} AUDIO_GROUP_ID=${AUDIO_GROUP_ID:-}" >> "$DOCKER_LOG"
if [ -n "${WAKE_THRESHOLD+set}" ]; then echo "WAKE_THRESHOLD=$WAKE_THRESHOLD for: docker $*" >> "$DOCKER_LOG.wake"; fi
exit "${DOCKER_EXIT:-0}"
FAKE
cat > "$work/bin/curl" <<'FAKE'
#!/bin/bash
echo "curl $*" >> "$CURL_LOG"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [ "${args[$i]}" = -o ]; then out=${args[$((i + 1))]}; fi
done
url=${args[$((${#args[@]} - 1))]}
if [ -n "${CURL_FAIL_ON:-}" ] && [[ "$url" == *"$CURL_FAIL_ON" ]]; then
  echo "curl: (22) The requested URL returned error: 404" >&2
  exit 22
fi
case "$url" in
  */config.json) size=2020 ;;
  */model.bin) size=79120341 ;;
  */vocabulary.txt) size=459861 ;;
  */tokenizer.json) size=2480466 ;;
  *) size=1 ;;
esac
if [ -n "${CURL_SHORT_ON:-}" ] && [[ "$url" == *"$CURL_SHORT_ON" ]]; then size=$((size - 1)); fi
: > "$out"
truncate -s "$size" "$out"
FAKE
cat > "$work/bin/sha256sum" <<'FAKE'
#!/bin/bash
if [ -n "${SHA_WRONG:-}" ]; then echo "0000  $1"; else echo "ae13f74db4d23c2746863880e87f15bf780bd2ee0a8b9c7dd967b9343a227081  $1"; fi
FAKE
chmod +x "$work/bin/docker" "$work/bin/curl" "$work/bin/sha256sum"
export DOCKER_LOG="$work/docker.log" CURL_LOG="$work/curl.log"

with_fakes() {
  : > "$DOCKER_LOG"
  : > "$DOCKER_LOG.wake"
  : > "$CURL_LOG"
  (cd "$work/repo" && PATH="$work/bin:$PATH" bash host/ears.sh "$@" < /dev/null 2>&1)
}

model="$work/repo/whisper/models/base-int8"

fresh
output=$(with_fakes whisper-model)
check "whisper-model downloads the model, and succeeds" "0" "$?"
check "the four files, from their pinned versions, over HTTPS only" "curl -fsS -L --proto =https --proto-redir =https -m 600 -o whisper/models/.download.XXXXXX/config.json https://huggingface.co/rhasspy/faster-whisper-base-int8/resolve/a9667415b1b62cc5f4bab65ec7a50f2f4035f7f4/config.json
curl -fsS -L --proto =https --proto-redir =https -m 600 -o whisper/models/.download.XXXXXX/model.bin https://huggingface.co/rhasspy/faster-whisper-base-int8/resolve/a9667415b1b62cc5f4bab65ec7a50f2f4035f7f4/model.bin
curl -fsS -L --proto =https --proto-redir =https -m 600 -o whisper/models/.download.XXXXXX/vocabulary.txt https://huggingface.co/rhasspy/faster-whisper-base-int8/resolve/a9667415b1b62cc5f4bab65ec7a50f2f4035f7f4/vocabulary.txt
curl -fsS -L --proto =https --proto-redir =https -m 600 -o whisper/models/.download.XXXXXX/tokenizer.json https://huggingface.co/openai/whisper-tiny/resolve/169d4a4341b33bc18d8881c4b69c2e104e1cc0af/tokenizer.json" "$(sed -E 's/\.download\.[A-Za-z0-9]{6}/.download.XXXXXX/' "$CURL_LOG")"
check "saved together in whisper/models/base-int8" "config.json model.bin tokenizer.json vocabulary.txt" "$(ls "$model" | tr '\n' ' ' | sed 's/ $//')"
check "readable by Whisper's own user" "755 644 644 644 644" "$(stat -c %a "$model" "$model"/* | tr '\n' ' ' | sed 's/ $//')"
check "with nothing half-downloaded left behind" "base-int8" "$(ls -A "$work/repo/whisper/models")"
check_has "saying where" "Saved Whisper's base-int8 model in whisper/models/base-int8." "$output"
output=$(with_fakes whisper-model)
check "a second time it downloads nothing and says it's already there" "0||Whisper's model is already in whisper/models/base-int8. To download it again, remove that folder first." "$?|$(cat "$CURL_LOG")|$output"

for broken in "CURL_FAIL_ON=model.bin|Couldn't download model.bin from https://huggingface.co/rhasspy/faster-whisper-base-int8/resolve/a9667415b1b62cc5f4bab65ec7a50f2f4035f7f4/model.bin. Check the server can reach Hugging Face." "CURL_SHORT_ON=tokenizer.json|tokenizer.json came back as 2480465 bytes, not the 2480466 it should be, so nothing was saved." "SHA_WRONG=1|model.bin isn't the file Hugging Face lists for this model, so nothing was saved."; do
  fresh
  output=$(export "${broken%%|*}"; with_fakes whisper-model)
  check "a bad download fails: ${broken%%|*}" "1" "$?"
  check_has "saying why: ${broken%%|*}" "${broken#*|}" "$output"
  check "and leaves nothing: ${broken%%|*}" "" "$(ls -A "$work/repo/whisper/models")"
done

fake_model() {
  mkdir -p "$model"
  truncate -s 2020 "$model/config.json"
  truncate -s 79120341 "$model/model.bin"
  truncate -s 459861 "$model/vocabulary.txt"
  truncate -s 2480466 "$model/tokenizer.json"
}

fresh
output=$(with_fakes start)
check "start without Whisper's model refuses, starting nothing" "1|" "$?|$(cat "$DOCKER_LOG")"
check_has "and says how to get it" "Whisper's model isn't in whisper/models yet. Download it once with: bash host/ears.sh whisper-model" "$output"

for half in "" "tokenizer.json" "model.bin=1"; do
  fresh
  if [ -n "$half" ]; then
    fake_model
    if [[ "$half" == *=* ]]; then truncate -s "${half#*=}" "$model/${half%%=*}"; else rm "$model/$half"; fi
  else
    mkdir -p "$model"
  fi
  output=$(with_fakes start)
  check "start with only part of the model refuses, starting nothing: '$half'" "1|" "$?|$(cat "$DOCKER_LOG")"
  check_has "saying what to do: '$half'" "whisper/models/base-int8 isn't the whole model. Remove that folder, then run: bash host/ears.sh whisper-model" "$output"
  output=$(with_fakes whisper-model)
  check "whisper-model won't call part of the model done, and downloads nothing: '$half'" "1|" "$?|$(cat "$CURL_LOG")"
  check_has "saying what to do: '$half'" "whisper/models/base-int8 is there but isn't the whole model. Remove that folder, then run this again." "$output"
done

for setting in "" "EARS_MICROPHONE=pretend" "EARS_MICROPHONE=  " "EARS_MICROPHONE=card_not"; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\n%s\n' "$setting" > "$work/repo/ears/.env"
  output=$(with_fakes start)
  check "without a card microphone ($setting), start starts ears and Whisper with no devices" "0|docker compose up -d --build --wait ears | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$?|$(cat "$DOCKER_LOG")"
  check_has "saying so ($setting)" "Starting ears and Whisper..." "$output"
done

snd="$work/snd"
fake_card() {
  rm -rf "${snd:?}"
  mkdir -p "$snd/by-path"
  : > "$snd/controlC1"
  : > "$snd/pcmC1D0c"
  : > "$snd/pcmC1D0p"
  ln -s ../controlC1 "$snd/by-path/pci-0000:04:00.6"
  : > "$snd/controlC0"
  ln -s ../controlC0 "$snd/by-path/pci-0000:04:00.1"
  ln -s ../pcmC1D0c "$snd/by-path/odd"
}

fresh
fake_card
fake_model
mkdir -p "$work/repo/ears"
printf 'EARS_TOKEN=x\nEARS_MICROPHONE=card\nEARS_SOUND_CARD=pci-0000:04:00.6\n' > "$work/repo/ears/.env"
output=$(SOUND_DIR="$snd" with_fakes start)
check "with the card microphone, start adds the mic file, with the card's number and its group" "0|docker compose -f docker-compose.yaml -f docker-compose.mic.yaml up -d --build --wait ears | MIC_CARD_NUMBER=1 AUDIO_GROUP_ID=$(stat -c %g "$snd/controlC1")" "$?|$(cat "$DOCKER_LOG")"
check_has "saying which card" "Starting ears with sound card 1's microphone, and Whisper..." "$output"
output=$(SOUND_DIR="$snd" DOCKER_EXIT=7 with_fakes start)
check "Docker failing makes start fail" "7" "$?"

for case in "|No EARS_SOUND_CARD in ears/.env. Set it to the microphone's card from ls /dev/snd/by-path, like pci-0000:04:00.6." "pci-0000:09:00.0|EARS_SOUND_CARD is pci-0000:09:00.0, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names." "../controlC1|EARS_SOUND_CARD is ../controlC1, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names." "../by-path/pci-0000:04:00.6|EARS_SOUND_CARD is ../by-path/pci-0000:04:00.6, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names." "pci-0000:04:00.1|Sound card 0 (pci-0000:04:00.1) has no microphone at /dev/snd/pcmC0D0c." "odd|/dev/snd/by-path/odd doesn't lead to a sound card's mixer."; do
  fresh
  fake_card
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_MICROPHONE=card\nEARS_SOUND_CARD=%s\n' "${case%%|*}" > "$work/repo/ears/.env"
  output=$(SOUND_DIR="$snd" with_fakes start)
  check "a card that can't be used stops start before Docker: '${case%%|*}'" "1|" "$?|$(cat "$DOCKER_LOG")"
  check_has "saying why: '${case%%|*}'" "${case#*|}" "$output"
done

for setting in "EARS_MICROPHONE=pretend
EARS_WAKE=on" "EARS_MICROPHONE=pretend
EARS_WAKE=on
EARS_WAKE_THRESHOLD=" "EARS_MICROPHONE=pretend
EARS_WAKE= on  # listen for Hey Jarvis"; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\n%s\n' "$setting" > "$work/repo/ears/.env"
  output=$(with_fakes start)
  check "with the wake word on ($(tr '\n' ' ' <<< "$setting")), start starts openWakeWord too" "0|docker compose up -d --build --wait ears openwakeword | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$?|$(cat "$DOCKER_LOG")"
  check "at openWakeWord's own threshold, passed to Docker by name ($(tr '\n' ' ' <<< "$setting"))" "WAKE_THRESHOLD=0.5 for: docker compose up -d --build --wait ears openwakeword" "$(cat "$DOCKER_LOG.wake")"
  check_has "saying so ($(tr '\n' ' ' <<< "$setting"))" "Starting ears, Whisper and openWakeWord at threshold 0.5..." "$output"
done

for threshold in 0.65 0.999 0.1 0.01 "0.7  # fewer false wakes"; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_MICROPHONE=pretend\nEARS_WAKE=on\nEARS_WAKE_THRESHOLD=%s\n' "$threshold" > "$work/repo/ears/.env"
  with_fakes start > /dev/null
  check "a threshold from 0.001 to 0.999 is passed on: $threshold" "WAKE_THRESHOLD=${threshold%% *} for: docker compose up -d --build --wait ears openwakeword" "$(cat "$DOCKER_LOG.wake")"
done

for threshold in 1 0 0.0 0.000 .5 0.5x 0.1234 -0.5 1.0 50% "0. 5" 0,5; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_MICROPHONE=pretend\nEARS_WAKE=on\nEARS_WAKE_THRESHOLD=%s\n' "$threshold" > "$work/repo/ears/.env"
  output=$(with_fakes start)
  check "a threshold that isn't between 0 and 1 stops start before Docker: '$threshold'" "1|" "$?|$(cat "$DOCKER_LOG")"
  check_has "saying what it must be: '$threshold'" "EARS_WAKE_THRESHOLD is $threshold in ears/.env, but it must be a number above 0 and below 1, with up to 3 decimal places, like 0.5 or 0.65." "$output"
done

fresh
fake_card
fake_model
mkdir -p "$work/repo/ears"
printf 'EARS_TOKEN=x\nEARS_MICROPHONE=card\nEARS_SOUND_CARD=pci-0000:04:00.6\nEARS_WAKE=on\nEARS_WAKE_THRESHOLD=0.6\n' > "$work/repo/ears/.env"
output=$(SOUND_DIR="$snd" with_fakes start)
check "with the card microphone and the wake word, start adds the mic file and starts openWakeWord too" "0|docker compose -f docker-compose.yaml -f docker-compose.mic.yaml up -d --build --wait ears openwakeword | MIC_CARD_NUMBER=1 AUDIO_GROUP_ID=$(stat -c %g "$snd/controlC1")|WAKE_THRESHOLD=0.6 for: docker compose -f docker-compose.yaml -f docker-compose.mic.yaml up -d --build --wait ears openwakeword" "$?|$(cat "$DOCKER_LOG")|$(cat "$DOCKER_LOG.wake")"
check_has "saying both" "Starting ears with sound card 1's microphone, Whisper, and openWakeWord at threshold 0.6..." "$output"

for setting in "EARS_WAKE=off" "EARS_WAKE=" ""; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_MICROPHONE=pretend\n%s\nEARS_WAKE_THRESHOLD=7\n' "$setting" > "$work/repo/ears/.env"
  output=$(with_fakes start)
  check "with the wake word off ('$setting'), openWakeWord isn't started and the threshold isn't looked at" "0|docker compose up -d --build --wait ears | MIC_CARD_NUMBER= AUDIO_GROUP_ID=|" "$?|$(cat "$DOCKER_LOG")|$(cat "$DOCKER_LOG.wake")"
done

for wake in On yes 1 true; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_MICROPHONE=pretend\nEARS_WAKE=%s\n' "$wake" > "$work/repo/ears/.env"
  output=$(with_fakes start)
  check "EARS_WAKE=$wake stops start before Docker" "1|" "$?|$(cat "$DOCKER_LOG")"
  check_has "saying what it must be: $wake" "EARS_WAKE is $wake in ears/.env, but it must be on or off." "$output"
done

fresh
fake_model
mkdir -p "$work/repo/ears"
printf 'EARS_TOKEN=x\nEARS_WAKE=on\n' > "$work/repo/ears/.env"
output=$(with_fakes start)
check "the wake word with no microphone stops start before Docker" "1|" "$?|$(cat "$DOCKER_LOG")"
check_has "saying why" "EARS_WAKE is on, but EARS_MICROPHONE isn't set in ears/.env, so there's nothing to listen with. Set EARS_MICROPHONE=card, or pretend to try it out." "$output"

fresh
output=$(with_fakes stop)
check "stop stops ears, Whisper and openWakeWord" "0|docker compose stop ears whisper openwakeword | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$?|$(cat "$DOCKER_LOG")"
check "start, stop and whisper-model write no switch" "no folder" "$([ -e "$work/repo/ears/switch" ] && echo folder || echo "no folder")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
