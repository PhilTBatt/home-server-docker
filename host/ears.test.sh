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
check "in the main file ears gets no devices and no extra rights: a microphone only comes with docker-compose.mic.yaml" "0" "$(grep -c -e 'devices:' -e 'privileged' -e 'cap_add' -e 'docker.sock' -e 'group_add' -e 'user:' -e 'pid:' -e 'ipc:' -e 'extra_hosts' <<< "$ears")"
check "ears runs with a tiny init that reaps the recorder's leftovers, a read-only filesystem, no Linux capabilities, and no way to gain privileges, with nothing else under security_opt or cap_drop" "    init: true
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    mem_limit: 256m" "$(grep -A6 '^    init:' <<< "$ears")"
check "and none of the four is set a second time" "4" "$(grep -c -e '^    security_opt:' -e '^    cap_drop:' -e '^    read_only:' -e '^    init:' <<< "$ears")"
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
check "the switch, the voiceprint's folder, ears's settings and its build are git-ignored" "ears/node_modules/ ears/dist/ ears/switch/ ears/voice/ " "$(grep '^ears/' "$here/../.gitignore" | tr '\n' ' ')"
check "and so is Whisper's model" "whisper/models/" "$(grep '^whisper/' "$here/../.gitignore")"
check "and .env files are too" "1" "$(grep -c '^\.env$' "$here/../.gitignore")"
check "the image runs as node, not root" "USER node" "$(grep '^USER' "$here/../ears/Dockerfile")"
check "the image doesn't get the test files" "1" "$(grep -c '^\*\*/\*\.test\.ts$' "$here/../ears/.dockerignore")"
check "and installs only alsa-utils, for arecord and amixer, in the image it runs from, not the one it's built in" "RUN apt-get update && apt-get install -y --no-install-recommends alsa-utils && rm -rf /var/lib/apt/lists/*|2" "$(grep -e 'apk' -e 'apt-get' "$here/../ears/Dockerfile")|$(awk '/^FROM/ { stage++ } /alsa-utils/ { print stage }' "$here/../ears/Dockerfile")"
check "ears runs with one package, onnxruntime-node, for the speech detector, and builds and tests with two more" '  "dependencies": {
    "onnxruntime-node": "^1.31.1"
  },
  "devDependencies": {
    "@types/node": "^26.6.6",
    "typescript": "^7.0.2"
  }' "$(sed -n '/"dependencies"/,$p' "$here/../ears/package.json" | head -n 7)"

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
check "it has a 1 GiB memory limit, twice what it was measured using" "    mem_limit: 1g" "$(grep '^    mem_limit:' <<< "$whisper")"
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
check "the voice file gives ears only the voiceprint's folder, read-only, and more memory for the voice model" 'services:
  ears:
    volumes:
      - type: bind
        source: ./ears/voice
        target: /voice
        read_only: true
        bind:
          create_host_path: false
    mem_limit: 384m' "$(cat "$here/../docker-compose.voice.yaml")"
check "and the main file gives ears no voiceprint" "0" "$(grep -c 'ears/voice' "$here/../docker-compose.yaml")"

mkdir -p "$work/bin"
cat > "$work/bin/docker" <<'FAKE'
#!/bin/bash
echo "docker $* | MIC_CARD_NUMBER=${MIC_CARD_NUMBER:-} AUDIO_GROUP_ID=${AUDIO_GROUP_ID:-}" >> "$DOCKER_LOG"
if [ -n "${WAKE_THRESHOLD+set}" ]; then echo "WAKE_THRESHOLD=$WAKE_THRESHOLD for: docker $*" >> "$DOCKER_LOG.wake"; fi
if [ "$1 $2" = "compose ps" ] && [ -n "${FAKE_EARS_ID:-}" ]; then echo "$FAKE_EARS_ID"; fi
if [ "$1 $2" = "compose logs" ] && [ -n "${FAKE_EARS_LOG:-}" ]; then cat "$FAKE_EARS_LOG"; exit "${FAKE_LOGS_EXIT:-0}"; fi
if [ "$1 $2" = "compose exec" ] && [ -n "${FAKE_TALK+set}" ]; then [ -n "$FAKE_TALK" ] && echo "$FAKE_TALK"; exit "${FAKE_TALK_EXIT:-0}"; fi
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

for voice in observe require; do
  fresh
  fake_card
  fake_model
  mkdir -p "$work/repo/ears/voice"
  : > "$work/repo/ears/voice/voiceprint.json"
  printf 'EARS_TOKEN=x\nEARS_MICROPHONE=card\nEARS_SOUND_CARD=pci-0000:04:00.6\nEARS_VOICE_ID=%s\n' "$voice" > "$work/repo/ears/.env"
  output=$(SOUND_DIR="$snd" with_fakes start)
  check "with voice ID set to $voice and a voiceprint made, start adds the voice file after the mic file" "0|docker compose -f docker-compose.yaml -f docker-compose.mic.yaml -f docker-compose.voice.yaml up -d --build --wait ears | MIC_CARD_NUMBER=1 AUDIO_GROUP_ID=$(stat -c %g "$snd/controlC1")" "$?|$(cat "$DOCKER_LOG")"
  check_has "saying so ($voice)" "Starting ears with sound card 1's microphone, and Whisper, with your voiceprint..." "$output"
  fresh
  fake_model
  mkdir -p "$work/repo/ears/voice"
  : > "$work/repo/ears/voice/voiceprint.json"
  printf 'EARS_TOKEN=x\nEARS_MICROPHONE=pretend\nEARS_WAKE=on\nEARS_VOICE_ID=%s\n' "$voice" > "$work/repo/ears/.env"
  output=$(with_fakes start)
  check "without a card microphone, voice ID set to $voice adds the voice file to the main one" "0|docker compose -f docker-compose.yaml -f docker-compose.voice.yaml up -d --build --wait ears openwakeword | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$?|$(cat "$DOCKER_LOG")"
  check_has "saying so ($voice, no card)" "Starting ears, Whisper and openWakeWord at threshold 0.5, with your voiceprint..." "$output"
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_VOICE_ID=%s\n' "$voice" > "$work/repo/ears/.env"
  output=$(with_fakes start 2>&1)
  check "voice ID set to $voice with no voiceprint stops start, saying how to make one, before Docker is asked anything" "1|EARS_VOICE_ID is $voice in ears/.env, but there's no voiceprint yet. Make one with: bash host/ears.sh voice-enrol|0" "$?|$output|$(wc -l < "$DOCKER_LOG" 2> /dev/null || echo 0)"
done
for voice in on yes REQUIRE; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_VOICE_ID=%s\n' "$voice" > "$work/repo/ears/.env"
  output=$(with_fakes start 2>&1)
  check "voice ID set to anything else ($voice) stops start, saying what it must be" "1|EARS_VOICE_ID is $voice in ears/.env, but it must be off, observe or require.|0" "$?|$output|$(wc -l < "$DOCKER_LOG" 2> /dev/null || echo 0)"
done
for voice in off ""; do
  fresh
  fake_model
  mkdir -p "$work/repo/ears"
  printf 'EARS_TOKEN=x\nEARS_VOICE_ID=%s\n' "$voice" > "$work/repo/ears/.env"
  output=$(with_fakes start)
  check "voice ID off ('$voice') starts ears as before, with no voice file and no voiceprint needed" "0|docker compose up -d --build --wait ears | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$?|$(cat "$DOCKER_LOG")"
done

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

report_log="$work/ears-log.txt"
cat > "$report_log" <<'LOG'
Ears is ready and muted, with sound card 1's microphone (Capture set to 100%). Unmute it with bash host/ears.sh unmute.
The wake word is on: ears listens for it whenever it's unmuted and a Jarvis chat with JARVIS_EARS=wake is open. A recording after it ends when the speech detector hears no speech for 2.5 seconds after you speak.
Unmuted.
The microphone is open.
Heard the wake word. The room's background is 258, so speech is anything above 774.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 6.8 seconds: the speech detector heard no speech for 2.5 seconds after you spoke.
Speech in it: first heard after 1.3 seconds, 2.1 seconds of speech, longest pause between words 0.9 seconds.
Turned into text in 0.8 seconds.
Recording started to hear a follow-up.
Recording stopped after 5.1 seconds: the speech detector heard no speech within 5 seconds, so it wasn't sent to Whisper.
Heard the wake word. The room's background is 300, so speech is anything above 900.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 5.8 seconds: nothing loud enough to be speech came within 5 seconds, so it wasn't sent to Whisper.
Heard the wake word. The room's background is 300, so speech is anything above 900.
Recording started by the wake word.
Recording stopped after 2 seconds: no Jarvis chat took it within 2 seconds.
Speech in it: first heard after 0.9 seconds, 0.5 seconds of speech, longest pause between words 0 seconds.
Heard the wake word, but too late to trust (2909 ms behind), so it was ignored.
Heard the wake word, but too late to trust (no time given), so it was ignored.
Heard the wake word, but too late to trust (its time is 995999 ms ahead of the sound sent), so it was ignored.
Heard the wake word while it wasn't being listened for, so it was ignored.
Heard the wake word. The room's background is 250, so speech is anything above 750.
Couldn't record after the wake word: ears is already recording.
Heard the wake word. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 7 seconds: the speech detector heard no speech for 2.5 seconds after you spoke.
Speech in it: first heard after 0.9 seconds, 2.9 seconds of speech, longest pause between words 0.3 seconds.
Couldn't turn it into text: Whisper sent no text.
Recording started to hear a follow-up.
Recording stopped after 4 seconds: the speech detector heard no speech for 2.5 seconds after you spoke.
Speech in it: first heard after 1 second, 0.4 seconds of speech, longest pause between words 0 seconds.
Turned into text in 0.9 seconds.
Recording started to hear a follow-up.
Recording stopped after 1.2 seconds: asked to cancel.
Speech in it: first heard after 0.6 seconds, 0.4 seconds of speech, longest pause between words 0.2 seconds.
Heard the wake word. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 2.4 seconds: muted.
Speech in it: first heard after 0.9 seconds, 1.2 seconds of speech, longest pause between words 0.3 seconds.
Muted.
The microphone is closed: ears is muted.
Unmuted.
The microphone is open.
Heard the wake word. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording failed after 1.1 seconds: the microphone stopped (arecord exited with code 1).
Heard the wake word. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 4 seconds: the switch was flipped while it was recording, so a mute may have come and gone.
Recording started.
Recording stopped after 3 seconds: asked to stop.
Turned into text in 1 second.
Recording started.
Recording stopped after 1 second: asked to cancel.
Recording started.
Recording stopped after 4 seconds: asked to stop.
Not turned into text: it was cancelled before it was turned into text.
Recording started.
Recording stopped after 30 seconds: it reached the 30-second limit.
Not turned into text: it was muted before it was turned into text.
The talk button was pressed. The room's background is 200, so speech is anything above 600.
Recording started by the talk button.
A Jarvis chat took the talk-button recording.
Recording stopped after 3.5 seconds: it went quiet for 2.5 seconds after you spoke.
Speech in it: first heard after 0.7 seconds, 0.3 seconds of speech, longest pause between words 0.1 seconds.
Turned into text in 0.6 seconds.
The talk button was pressed. The room's background is 200, so speech is anything above 600.
Recording started by the talk button.
Recording stopped after 2 seconds: no Jarvis chat took it within 2 seconds.
The talk button was pressed. The room's background is 210, so speech is anything above 630.
Recording started by the talk button.
A Jarvis chat took the talk-button recording.
Recording stopped after 2.2 seconds: asked to stop.
Speech in it: first heard after 1.1 seconds, 0.9 seconds of speech, longest pause between words 0.3 seconds.
Turned into text in 0.7 seconds.
The talk button was pressed. The room's background is 210, so speech is anything above 630.
Recording failed to start: the recorder couldn't start: spawn arecord ENOENT.
Couldn't record after the talk button: ears failed (the recorder couldn't start: spawn arecord ENOENT).
The talk button was pressed. The room's background is 220, so speech is anything above 660.
Recording started by the talk button.
A Jarvis chat took the talk-button recording.
Recording stopped after 5.8 seconds: nothing loud enough to be speech came within 5 seconds, so it wasn't sent to Whisper.
The microphone is closed: no Jarvis chat is listening for the wake word.
LOG
expected_report='- "Hey Jarvis" heard: 8. Ignored: 3 as too late to trust (or with no usable time), 1 that came after ears stopped listening.
- Wake recordings: 7, and 1 that failed to start. A chat took 6, and no chat took 1 in time. Of them: no speech in time, so not sent to Whisper (a false wake, or nothing said after it), 1; cancelled, muted or failed, 3; turned into text, 1; not turned into text after all, 1.
- Follow-up windows: 3. Of them: no speech in time, 1; cancelled, muted or failed, 1; turned into text, 1; not turned into text after all, 0.
- Talk-button recordings: 4, and 1 that failed to start. A chat took 3, and no chat took 1 in time. Of them: no speech in time, so not sent to Whisper, 1; cancelled, muted or failed, 0; turned into text, 2; not turned into text after all, 0.
- Other recordings (/talk, or ask.js start): 4. Of them: cancelled, muted or failed, 1; turned into text, 1; not turned into text after all, 2.
- Speech in wake recordings, from 2 with speech (leaving out any cut short): first heard after a median of 1.1 s (0.9 to 1.3 s); a median of 2.5 s of speech; longest pause between words a median of 0.6 s, at most 0.9 s.
- Speech in follow-up windows, from 1 with speech (leaving out any cut short): first heard after a median of 1.0 s (1.0 to 1.0 s); a median of 0.4 s of speech; longest pause between words a median of 0.0 s, at most 0.0 s.
- Speech in talk-button recordings, from 2 with speech (leaving out any cut short): first heard after a median of 0.9 s (0.7 to 1.1 s); a median of 0.6 s of speech; longest pause between words a median of 0.2 s, at most 0.3 s.'
fresh
output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" with_fakes wake-report)
check "wake-report counts what ears's log says about the wake word, its recordings and follow-ups, in the whole log" "0|In ears's whole log, which goes back to when its container was last made:
$expected_report" "$?|$output"
check "it only asks Docker whether ears has a container and for its log, plain" "docker compose ps -a --quiet ears | MIC_CARD_NUMBER= AUDIO_GROUP_ID=
docker compose logs --no-log-prefix ears | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$(cat "$DOCKER_LOG")"
check "and writes no switch" "no folder" "$([ -e "$work/repo/ears/switch" ] && echo folder || echo "no folder")"
output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" with_fakes wake-report 6)
check "given hours, it reads only that far back" "0|In the last 6 hours of ears's log:" "$?|$(head -1 <<< "$output")"
check "with --since" "docker compose logs --no-log-prefix --since 6h ears | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$(sed -n 2p "$DOCKER_LOG")"
for hours in 0 721 06 1.5 -3 six 1000 "6h" "" " 6"; do
  output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" with_fakes wake-report "$hours")
  check "hours that aren't a whole number from 1 to 720 are refused before Docker: '$hours'" "1|The hours must be a whole number from 1 to 720, like 6, not \"$hours\".|" "$?|$output|$(cat "$DOCKER_LOG")"
done
: > "$work/empty-log.txt"
output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$work/empty-log.txt" with_fakes wake-report)
check "an empty log reports nothing heard" "0|In ears's whole log, which goes back to when its container was last made:
- \"Hey Jarvis\" heard: 0. Ignored: 0 as too late to trust (or with no usable time), 0 that came after ears stopped listening." "$?|$(head -2 <<< "$output")"
check "and says no speech has been measured yet" "- Speech in wake recordings: none measured yet.
- Speech in follow-up windows: none measured yet.
- Speech in talk-button recordings: none measured yet." "$(tail -3 <<< "$output")"
cat > "$work/words-log.txt" << 'LOG'
Heard the wake word. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 2.4 seconds: it went quiet for 0.7 seconds after you spoke.
Speech in it: first heard after 0.9 seconds, 0.8 seconds of speech, longest pause between words 0.1 seconds.
Judged by your words: finished, by the rules (1 look).
Turned into text in 0 seconds: the text made while you paused was used.
Heard the wake word. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 6 seconds: it went quiet for 3.5 seconds after you spoke.
Speech in it: first heard after 0.9 seconds, 1.6 seconds of speech, longest pause between words 0.6 seconds.
Judged by your words: more to come, by a Jarvis chat (2 looks).
Turned into text in 0 seconds: the text made while you paused was used.
Recording started to hear a follow-up.
Recording stopped after 4 seconds: it went quiet for 2.5 seconds after you spoke.
Speech in it: first heard after 0.5 seconds, 1 second of speech, longest pause between words 0 seconds.
Judged by your words: unsure, by the rules (1 look).
Turned into text in 0 seconds: the text made while you paused was used.
The talk button was pressed. The room's background is 200, so speech is anything above 600.
Recording started by the talk button.
A Jarvis chat took the talk-button recording.
Recording stopped after 2.2 seconds: asked to stop.
Speech in it: first heard after 1.1 seconds, 0.9 seconds of speech, longest pause between words 0.3 seconds.
Your words weren't looked at: it ended before a pause long enough to look.
Turned into text in 0.7 seconds.
Heard the wake word. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 3 seconds: it went quiet for 2.5 seconds after you spoke.
Speech in it: first heard after 0.4 seconds, 0.2 seconds of speech, longest pause between words 0 seconds.
Your words weren't judged in time (1 look).
Turned into text in 1.4 seconds.
Heard the wake word. The room's background is 200, so speech is anything above 600.
It came while Jarvis was speaking, so it cuts in.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 5.8 seconds: nothing loud enough to be speech came within 5 seconds, so it wasn't sent to Whisper.
Heard speech while Jarvis was speaking. The room's background is 200, so speech is anything above 600.
Recording started by the wake word.
A Jarvis chat took the wake-word recording.
Recording stopped after 2.9 seconds: it went quiet for 2.5 seconds after you spoke.
Speech in it: first heard after 0 seconds, 0.4 seconds of speech, longest pause between words 0 seconds.
Voice: Speech was heard for only 0.4 seconds, under the 1 second a voice needs to be compared fairly.
Turned into text in 0.5 seconds.
LOG
cat > "$work/voice-log.txt" << 'LOG'
Voice: Score against the voiceprint: 0.84. At the threshold of 0.5, that counts as the voiceprint's voice.
Voice: Score against the voiceprint: 0.61. At the threshold of 0.5, that counts as the voiceprint's voice.
Voice: Score against the voiceprint: 0.90. At the threshold of 0.5, that counts as the voiceprint's voice.
Voice: Score against the voiceprint: 0.12. At the threshold of 0.5, that counts as a different voice.
Not turned into text: the voice in it didn't match the voiceprint.
Voice: Score against the voiceprint: 0.30. At the threshold of 0.5, that counts as a different voice.
Not turned into text: the voice in it didn't match the voiceprint.
Voice: Score against the voiceprint: -0.07. At the threshold of 0.5, that counts as a different voice.
Not turned into text: the voice in it didn't match the voiceprint.
Voice: No speech was heard, so there was nothing to compare.
Not turned into text: the speech in it was too quiet to check against the voiceprint, and voice ID is required.
Voice: Speech was heard for only 0.6 seconds, under the 1 second a voice needs to be compared fairly.
Voice: No speech was heard, so there was nothing to compare.
Voice: couldn't be checked (the model broke).
Not turned into text: the voice in it couldn't be checked against the voiceprint, and voice ID is required.
LOG
output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$work/voice-log.txt" with_fakes wake-report)
check "with voice ID on, a last line counts how voices were judged, with the range of scores each way, and how many recordings it stopped" "0|- Voice ID: counted as your voice, 3 (scores 0.61 to 0.90, median 0.84); as a different voice, 3 (scores -0.07 to 0.30, median 0.12); too little speech to judge, 3; couldn't be checked, 1. Not turned into text because of the voice: 5." "$?|$(tail -1 <<< "$output")"
output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$work/words-log.txt" with_fakes wake-report)
check "with the word check on, a last line counts how recordings were judged and how often the text made at a pause was used" "0|- Judged by your words: finished, 1; more to come, 1; unsure, 1; not judged, 2. A Jarvis chat gave the answer for 1 of them. The text made at a pause was used for 3, so Whisper wasn't asked again.|4" "$?|$(tail -1 <<< "$output")|$(grep -o 'turned into text, [0-9]*' <<< "$output" | head -1 | grep -o '[0-9]*')"
check "and a line before it counts the times he was cut in on, by the wake word and by speech" "- Cut-ins while Jarvis was speaking: 1 by the wake word, 1 by speech (those start a wake recording with no wake word heard).|- \"Hey Jarvis\" heard: 4. Ignored: 0 as too late to trust (or with no usable time), 0 that came after ears stopped listening." "$(tail -2 <<< "$output" | head -1)|$(sed -n 2p <<< "$output")"
check "and a log with none of those lines has none of the three" "0|0|0" "$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" with_fakes wake-report | grep -c 'Cut-ins')|$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" with_fakes wake-report | grep -c 'Judged by your words')|$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" with_fakes wake-report | grep -c 'Voice ID')"
output=$(FAKE_EARS_LOG="$report_log" with_fakes wake-report)
check "with no ears container, it says to start ears, and doesn't ask for a log" "1|Ears has no log yet. Start it with bash host/ears.sh start.|1" "$?|$output|$(wc -l < "$DOCKER_LOG")"
output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" DOCKER_EXIT=1 with_fakes wake-report)
check "if Docker can't be asked about ears, it says so and how to see why, and doesn't ask for a log" "1|Couldn't ask Docker about ears, so there's no report. docker compose ps -a ears shows why.|1" "$?|$output|$(wc -l < "$DOCKER_LOG")"
output=$(FAKE_EARS_ID=abc123 FAKE_EARS_LOG="$report_log" FAKE_LOGS_EXIT=1 with_fakes wake-report)
check "if the log can't be read, it says so and how to see why, and reports nothing" "1|Couldn't read ears's log, so there's no report. docker compose logs ears shows why." "$?|$output"

listening="Listening, and a Jarvis chat has taken it. Speak after his chime: ears sends it when you stop talking, or press again once you've spoken to send it now."
fresh
output=$(FAKE_EARS_ID=abc123 FAKE_TALK="$listening" with_fakes talk)
check "talk asks ears's own helper to start listening, and passes on what it says" "0|$listening" "$?|$output"
check "it checks ears is running, then runs the helper in it, with no microphone settings" "docker compose ps --status running --quiet ears | MIC_CARD_NUMBER= AUDIO_GROUP_ID=
docker compose exec -T ears node dist/ask.js talk | MIC_CARD_NUMBER= AUDIO_GROUP_ID=" "$(cat "$DOCKER_LOG")"
check "and writes no switch" "no folder" "$([ -e "$work/repo/ears/switch" ] && echo folder || echo "no folder")"
output=$(FAKE_TALK="$listening" with_fakes talk)
check "with ears not running, it says so and how to start it, and asks nothing of ears" "1|Ears isn't running, so nothing is listening. Start it with bash host/ears.sh start.|1" "$?|$output|$(wc -l < "$DOCKER_LOG")"
output=$(FAKE_EARS_ID=abc123 DOCKER_EXIT=1 FAKE_TALK="$listening" with_fakes talk)
check "if Docker can't be asked about ears, it says so and how to see why" "1|Couldn't ask Docker about ears, so nothing is listening. docker compose ps ears shows why.|1" "$?|$output|$(wc -l < "$DOCKER_LOG")"
output=$(FAKE_EARS_ID=abc123 FAKE_TALK="Usage: node dist/ask.js state|start|stop|health" FAKE_TALK_EXIT=1 with_fakes talk)
check "an ears built before the talk button is told to rebuild" "1|This ears doesn't know the talk button yet, so start it again with bash host/ears.sh start, which rebuilds it." "$?|$output"
output=$(FAKE_EARS_ID=abc123 FAKE_TALK="WARN[0000] a warning from Docker
Usage: node dist/ask.js state|start|stop|health" FAKE_TALK_EXIT=1 with_fakes talk)
check "even after a warning from Docker" "1|This ears doesn't know the talk button yet, so start it again with bash host/ears.sh start, which rebuilds it." "$?|$output"
output=$(FAKE_EARS_ID=abc123 FAKE_TALK="Not listening: ears is muted, so unmute it with bash host/ears.sh unmute." FAKE_TALK_EXIT=1 with_fakes talk)
check "a refusal is passed on, and fails" "1|Not listening: ears is muted, so unmute it with bash host/ears.sh unmute." "$?|$output"
output=$(FAKE_EARS_ID=abc123 FAKE_TALK="" FAKE_TALK_EXIT=137 with_fakes talk)
check "a helper that says nothing and fails is reported, with its exit code" "137|Docker couldn't run the talk command in ears." "$?|$output"
fresh
output=$(FAKE_EARS_ID=abc123 FAKE_TALK="$listening" with_fakes talk now)
check "talk takes nothing after it" "1|0" "$?|$(wc -l < "$DOCKER_LOG")"
check_has "and shows the usage, which lists talk" "Usage: bash host/ears.sh mute|unmute|start|stop|talk|whisper-model" "$output"

for name in fillersBefore fillersAfter; do
  check "ears and Jarvis hear the same filler words around a code word: $name" "$(grep "^export const $name = " "$here/../ears/src/ears.ts")" "$(grep "^export const $name = " "$here/../jarvis/src/code-words.ts")"
done
check "Jarvis knows ears's reason for muting itself word for word" "1" "$(grep -cF "\"$(sed -n 's/^export const stoppedListening = "\(.*\)";$/\1/p' "$here/../ears/src/ears.ts")\"" "$here/../jarvis/src/code-words.ts")"

mkdir -p "$work/micbin"
cat > "$work/micbin/docker" <<'FAKE'
#!/bin/bash
if [ "$1 $2" = "compose ps" ]; then
  echo "docker $*" >> "$MIC_LOG"
  [ -n "${FAKE_PS:-}" ] && echo "$FAKE_PS"
  exit 0
fi
if [ "$1 $2" = "compose exec" ]; then
  echo "docker $*" >> "$MIC_LOG"
  [ "${FAKE_HEALTH-200 muted}" = fails ] && exit 1
  echo "${FAKE_HEALTH-200 muted}"
  exit 0
fi
if [ "$1 $2" = "build -q" ]; then
  echo "docker $*" >> "$MIC_LOG"
  if [ "${FAKE_BUILD_FAIL:-}" = "${*: -1}" ]; then echo "pretend build failure" >&2; exit 1; fi
  echo "sha256:0123"
  exit 0
fi
if [ "$1" = run ] && [[ " $* " == *" dist/voice-enrol-run.js "* ]]; then
  echo "enrol: docker $* | EARS_MIC_LEVEL=${EARS_MIC_LEVEL-unset} EARS_MIC_CONTROL=${EARS_MIC_CONTROL-unset} EARS_MIC_BOOST=${EARS_MIC_BOOST-unset} EARS_MIC_BOOST_CONTROL=${EARS_MIC_BOOST_CONTROL-unset} EARS_VOICE_ID_THRESHOLD=${EARS_VOICE_ID_THRESHOLD-unset} EARS_TOKEN=${EARS_TOKEN-unset}" >> "$MIC_LOG"
  echo "Sentence 1 of 5. Read it at your normal speed when it says Go:" >&2
  if [ -n "${FAKE_ENROL_FAIL:-}" ]; then echo "$FAKE_ENROL_FAIL" >&2; exit 1; fi
  if [ -n "${FAKE_ENROL_INT:-}" ]; then
    trap 'exit 130' INT
    : > "$STARTED"
    for _ in $(seq 1 100); do sleep 0.05; done
    exit 0
  fi
  if [ -n "${FAKE_ENROL_SAYS+set}" ]; then [ -n "$FAKE_ENROL_SAYS" ] && printf '%s\n' "$FAKE_ENROL_SAYS"; exit 0; fi
  printf 'voiceprint follows\n%s\n' "$(cat "$VOICEPRINT")"
  exit 0
fi
if [ "$1" = run ] && [[ " $* " == *" dist/voice-check-run.js "* ]]; then
  echo "check: docker $* | EARS_MIC_LEVEL=${EARS_MIC_LEVEL-unset} EARS_VOICE_ID_THRESHOLD=${EARS_VOICE_ID_THRESHOLD-unset} EARS_VOICE_CHECK_WAIT=${EARS_VOICE_CHECK_WAIT-unset} EARS_TOKEN=${EARS_TOKEN-unset}" >> "$MIC_LOG"
  echo "Score against the voiceprint: 0.73. At the threshold of 0.5, that counts as the voiceprint's voice."
  exit "${FAKE_CHECK_EXIT:-0}"
fi
if [ "$1" = run ] && [[ " $* " == *" home-hub-ears "* ]]; then
  echo "recorder: docker $* | EARS_MIC_LEVEL=${EARS_MIC_LEVEL-unset} EARS_MIC_CONTROL=${EARS_MIC_CONTROL-unset} EARS_MIC_BOOST=${EARS_MIC_BOOST-unset} EARS_MIC_BOOST_CONTROL=${EARS_MIC_BOOST_CONTROL-unset} EARS_WAKE_END=${EARS_WAKE_END-unset} EARS_WAKE_PAUSE=${EARS_WAKE_PAUSE-unset} EARS_MIC_TEST_WAIT=${EARS_MIC_TEST_WAIT-unset} EARS_TOKEN=${EARS_TOKEN-unset}" >> "$MIC_LOG"
  echo "The room's background is 41, so speech is anything above 300." >&2
  if [ -n "${FAKE_RECORDER_FAIL:-}" ]; then echo "$FAKE_RECORDER_FAIL" >&2; exit 1; fi
  if [ -n "${FAKE_RECORDER_SILENT:-}" ]; then exit 0; fi
  if [ -n "${FAKE_RECORDER_SAYS:-}" ]; then echo "$FAKE_RECORDER_SAYS"; exit 0; fi
  if [ -n "${FAKE_RECORDER_INT:-}" ]; then
    if [ "$FAKE_RECORDER_INT" = sends ]; then trap 'printf "sound follows\n"; cat "$SOUND"; exit 0' INT; else trap 'exit 130' INT; fi
    : > "$STARTED"
    for _ in $(seq 1 100); do sleep 0.05; done
    exit 0
  fi
  printf 'sound follows\n'
  if [ -n "${FAKE_RECORDER_BIG:-}" ]; then
    (printf '%320000s' '') 2> /dev/null
    code=$?
    echo "recorder ended $code" >> "$MIC_LOG"
    exit "$code"
  fi
  cat "$SOUND"
  exit 0
fi
if [ "$1" = run ] && [[ " $* " == *" home-hub-jarvis "* ]]; then
  echo "player: docker $*" >> "$MIC_LOG"
  if [ "${FAKE_PLAYER_FAIL:-}" = early ]; then echo "aplay: main:850: audio open error: Device or resource busy" >&2; exit 1; fi
  cat > "$PLAYED"
  if [ -n "${FAKE_PLAYER_INT:-}" ]; then
    [ "$FAKE_PLAYER_INT" = die ] || trap 'exit "$FAKE_PLAYER_INT"' INT
    : > "$STARTED"
    for _ in $(seq 1 100); do sleep 0.05; done
    exit 0
  fi
  if [ -n "${FAKE_PLAYER_FAIL:-}" ]; then echo "aplay: main:850: audio open error: Device or resource busy" >&2; exit 1; fi
  exit 0
fi
echo "unexpected: docker $*" >> "$MIC_LOG"
exit 9
FAKE
chmod +x "$work/micbin/docker"
export MIC_LOG="$work/mic.log" PLAYED="$work/played" SOUND="$work/sound" STARTED="$work/started"
export VOICEPRINT="$work/voiceprint"
printf '{"model":"wespeaker_en_voxceleb_CAM++","clips":5,"made":"2026-11-20T10:00:00.000Z","vector":[%s]}' "$(printf '0.044194,%.0s' $(seq 1 511))0.044194" > "$VOICEPRINT"
printf 'ab\000\001\n\377sound follows\n' > "$SOUND"
head -c 3200 /dev/zero >> "$SOUND"

mic_cards() {
  rm -rf "${snd:?}"
  mkdir -p "$snd/by-path"
  : > "$snd/controlC1"
  : > "$snd/pcmC1D0c"
  : > "$snd/pcmC1D0p"
  ln -s ../controlC1 "$snd/by-path/pci-0000:04:00.6"
  : > "$snd/controlC0"
  : > "$snd/pcmC0D3p"
  ln -s ../controlC0 "$snd/by-path/pci-0000:04:00.1"
  : > "$snd/controlC2"
  : > "$snd/pcmC2D0c"
  ln -s ../controlC2 "$snd/by-path/usb-0000:00:14.0-1"
}

mic_setup() {
  fresh
  mic_cards
  mkdir -p "$work/repo/ears" "$work/repo/jarvis"
  printf 'EARS_TOKEN=a-secret-token\nEARS_MICROPHONE=card\nEARS_SOUND_CARD=pci-0000:04:00.6\n' > "$work/repo/ears/.env"
  printf 'ANTHROPIC_API_KEY=another-secret\nJARVIS_SOUND_CARD=pci-0000:04:00.6\n' > "$work/repo/jarvis/.env"
}

mic_test() {
  : > "$MIC_LOG"
  rm -f "$PLAYED"
  rm -rf "${work:?}/tmp"
  mkdir -p "$work/tmp"
  local line
  line=$(printf '%q ' bash host/ears.sh "$@")
  (cd "$work/repo" && SOUND_DIR="$snd" TMPDIR="$work/tmp" PATH="$work/micbin:$PATH" script -qec "$line" /dev/null < /dev/null > "$work/out" 2>&1)
  mic_status=$?
  mic_output=$(tr -d '\r' < "$work/out")
}

mic_test_ctrl_c() {
  : > "$MIC_LOG"
  rm -f "$PLAYED" "$STARTED"
  rm -rf "${work:?}/tmp"
  mkdir -p "$work/tmp"
  (cd "$work/repo" && { for _ in $(seq 1 100); do [ -e "$STARTED" ] && break; sleep 0.05; done; sleep 0.2; printf '\003'; sleep 1; } | SOUND_DIR="$snd" TMPDIR="$work/tmp" PATH="$work/micbin:$PATH" script -qec "bash host/ears.sh mic-test" /dev/null > "$work/out" 2>&1)
  mic_status=$?
  mic_output=$(tr -d '\r' < "$work/out")
}

hardened="docker run --rm --init --log-driver none --network none --cap-drop ALL --security-opt no-new-privileges"

mic_setup
output=$(cd "$work/repo" && PATH="$work/micbin:$PATH" SOUND_DIR="$snd" bash host/ears.sh mic-test < /dev/null 2>&1)
check "mic-test without a terminal is refused, before Docker" "1|" "$?|$(cat "$MIC_LOG" 2> /dev/null)"
check_has "saying it only runs from a terminal someone types in" "mic-test records the room, so it only runs from a terminal someone is typing in, not from a script or an AI tool." "$output"

mic_setup
: > "$MIC_LOG"
(cd "$work/repo" && SOUND_DIR="$snd" PATH="$work/micbin:$PATH" script -qec "bash host/ears.sh mic-test < /dev/null" /dev/null < /dev/null > "$work/out" 2>&1)
check "mic-test with its output on a terminal but its input from elsewhere is refused too, before Docker" "1|" "$?|$(cat "$MIC_LOG")"
check_has "saying why" "mic-test records the room, so it only runs from a terminal someone is typing in" "$(tr -d '\r' < "$work/out")"

mic_setup
card_group=$(stat -c %g "$snd/controlC1")
mic_test mic-test
check "mic-test in a terminal records, then plays back, and succeeds" "0" "$mic_status"
check "it builds both images, then looks whether ears is running just before it records, then runs the recorder with only the microphone and its mixer, then the player with only the speakers and the mixer" "docker build -q -t home-hub-ears ears
docker build -q -t home-hub-jarvis jarvis
docker compose ps --status running --quiet ears
recorder: $hardened --group-add $card_group --device /dev/snd/controlC1:/dev/snd/controlC1:rw --device /dev/snd/pcmC1D0c:/dev/snd/pcmC1D0c:rw -e EARS_MIC_LEVEL -e EARS_MIC_CONTROL -e EARS_MIC_BOOST -e EARS_MIC_BOOST_CONTROL -e EARS_WAKE_END -e EARS_WAKE_PAUSE -e EARS_MIC_TEST_WAIT home-hub-ears node dist/mic-test-run.js | EARS_MIC_LEVEL= EARS_MIC_CONTROL= EARS_MIC_BOOST= EARS_MIC_BOOST_CONTROL= EARS_WAKE_END= EARS_WAKE_PAUSE= EARS_MIC_TEST_WAIT=0 EARS_TOKEN=unset
player: $hardened -i --user node --group-add $card_group --device /dev/snd/controlC1:/dev/snd/controlC1:rw --device /dev/snd/pcmC1D0p:/dev/snd/pcmC1D0p:rw home-hub-jarvis sh -c amixer -q -c 1 sset Master 80% unmute && exec aplay -q -t raw -f S16_LE -r 16000 -c 1 -D plughw:1,0" "$(cat "$MIC_LOG")"
check "the player gets exactly the sound after the line that says it follows, byte for byte, with no line of its own" "same" "$(cmp -s "$SOUND" "$PLAYED" && echo same || echo different)"
check "the recorder never gets a speaker, and the player never gets a microphone" "0 0" "$(grep '^recorder:' "$MIC_LOG" | grep -c 'D0p') $(grep '^player:' "$MIC_LOG" | grep -c 'D0c')"
check "neither container gets the network or keeps a log, and no token or key is passed" "0 0" "$(grep -E '^(recorder|player):' "$MIC_LOG" | grep -v -e '--network none' -e '--log-driver none' | wc -l) $(grep -c -e 'a-secret-token' -e 'another-secret' "$MIC_LOG")"
check "nothing is written to a temporary folder or the repo" "|ears/.env jarvis/.env" "$(ls -A "$work/tmp")|$(cd "$work/repo" && find . -type f ! -path './host/*' | sed 's|^\./||' | sort | tr '\n' ' ' | sed 's/ $//')"
check_has "saying it's getting the images ready" "Getting ears's and Jarvis's images ready..." "$mic_output"
check_has "passing on what the check says" "The room's background is 41, so speech is anything above 300." "$mic_output"
check "saying where it'll play it back before it records, so nothing it prints can come between the report's lines" "When it's done, it plays the recording back on sound card 1's speakers.|1" "$(grep "plays the recording back" <<< "$mic_output")|$(awk '/plays the recording back/ { at = NR } /The room.s background is/ { print (at > 0 && at < NR) ? 1 : 0 }' <<< "$mic_output")"
check_has "and that it's done" "Done. Run it again from somewhere else to compare." "$mic_output"

mic_setup
printf 'EARS_TOKEN=a-secret-token\nEARS_MICROPHONE=card\nEARS_SOUND_CARD=usb-0000:00:14.0-1\nEARS_MIC_LEVEL=100\nEARS_MIC_CONTROL=Mic\nEARS_MIC_BOOST=2\nEARS_MIC_BOOST_CONTROL="Mic Boost"\nEARS_WAKE_END=silero\nEARS_WAKE_PAUSE=2.5\n' > "$work/repo/ears/.env"
printf 'JARVIS_SOUND_CARD=pci-0000:04:00.6\nJARVIS_VOLUME=55\n' > "$work/repo/jarvis/.env"
mic_test mic-test 07
check "a USB microphone on its own card is recorded from that card, with ears's microphone settings, how a wake recording ends and the wait passed by name, and played on the speakers' card at Jarvis's volume" "0|recorder: $hardened --group-add $(stat -c %g "$snd/controlC2") --device /dev/snd/controlC2:/dev/snd/controlC2:rw --device /dev/snd/pcmC2D0c:/dev/snd/pcmC2D0c:rw -e EARS_MIC_LEVEL -e EARS_MIC_CONTROL -e EARS_MIC_BOOST -e EARS_MIC_BOOST_CONTROL -e EARS_WAKE_END -e EARS_WAKE_PAUSE -e EARS_MIC_TEST_WAIT home-hub-ears node dist/mic-test-run.js | EARS_MIC_LEVEL=100 EARS_MIC_CONTROL=Mic EARS_MIC_BOOST=2 EARS_MIC_BOOST_CONTROL=Mic Boost EARS_WAKE_END=silero EARS_WAKE_PAUSE=2.5 EARS_MIC_TEST_WAIT=7 EARS_TOKEN=unset|player: $hardened -i --user node --group-add $(stat -c %g "$snd/controlC1") --device /dev/snd/controlC1:/dev/snd/controlC1:rw --device /dev/snd/pcmC1D0p:/dev/snd/pcmC1D0p:rw home-hub-jarvis sh -c amixer -q -c 1 sset Master 55% unmute && exec aplay -q -t raw -f S16_LE -r 16000 -c 1 -D plughw:1,0" "$mic_status|$(grep '^recorder:' "$MIC_LOG")|$(grep '^player:' "$MIC_LOG")"

for case in "0|0% mute" "007|7% unmute" "100|100% unmute" "|80% unmute"; do
  mic_setup
  printf 'JARVIS_SOUND_CARD=pci-0000:04:00.6\nJARVIS_VOLUME=%s\n' "${case%%|*}" > "$work/repo/jarvis/.env"
  mic_test mic-test
  check "JARVIS_VOLUME '${case%%|*}' plays it back at ${case#*|}" "0|1" "$mic_status|$(grep -c "sset Master ${case#*|} &&" "$MIC_LOG")"
done

for volume in 101 -1 loud 5.5 50%; do
  mic_setup
  printf 'JARVIS_SOUND_CARD=pci-0000:04:00.6\nJARVIS_VOLUME=%s\n' "$volume" > "$work/repo/jarvis/.env"
  mic_test mic-test
  check "JARVIS_VOLUME '$volume' stops mic-test before Docker" "1|" "$mic_status|$(cat "$MIC_LOG")"
  check_has "saying what it must be: '$volume'" "JARVIS_VOLUME is $volume in jarvis/.env, but it must be a whole number from 0 to 100, like 80." "$mic_output"
done

for wait_for in x 61 -1 1.5 100 060 5s; do
  mic_setup
  mic_test mic-test "$wait_for"
  check "a wait of '$wait_for' stops mic-test before Docker" "1|" "$mic_status|$(cat "$MIC_LOG")"
  check_has "saying what it must be: '$wait_for'" "The wait is $wait_for, but it must be a whole number of seconds from 0 to 60, like 10 to give you time to move away from the server." "$mic_output"
done

for wait_for in 0 60 10; do
  mic_setup
  mic_test mic-test "$wait_for"
  check "a wait of $wait_for is passed on" "0|1" "$mic_status|$(grep -c "EARS_MIC_TEST_WAIT=$wait_for EARS_TOKEN" "$MIC_LOG")"
done

for case in "ears|EARS_SOUND_CARD=|No EARS_SOUND_CARD in ears/.env. Set it to the microphone's card from ls /dev/snd/by-path, like pci-0000:04:00.6." "ears|EARS_SOUND_CARD=pci-0000:04:00.1|Sound card 0 (pci-0000:04:00.1) has no microphone at /dev/snd/pcmC0D0c." "jarvis|JARVIS_SOUND_CARD=|No JARVIS_SOUND_CARD in jarvis/.env. Set it to the speakers' name from ls /dev/snd/by-path, like pci-0000:04:00.6." "jarvis|JARVIS_SOUND_CARD=usb-0000:00:14.0-1|Sound card 2 (usb-0000:00:14.0-1) has no speakers at /dev/snd/pcmC2D0p." "jarvis|JARVIS_SOUND_CARD=nowhere|JARVIS_SOUND_CARD is nowhere, which isn't in /dev/snd/by-path. ls /dev/snd/by-path lists the names."; do
  IFS='|' read -r which line said <<< "$case"
  mic_setup
  if [ "$which" = ears ]; then printf 'EARS_TOKEN=x\n%s\n' "$line" > "$work/repo/ears/.env"; else printf '%s\n' "$line" > "$work/repo/jarvis/.env"; fi
  mic_test mic-test
  check "a card that can't be used stops mic-test before Docker: $line" "1|" "$mic_status|$(cat "$MIC_LOG")"
  check_has "saying why: $line" "$said" "$mic_output"
done

mic_setup
rm "$work/repo/jarvis/.env"
mic_test mic-test
check "with no jarvis/.env there are no speakers named, so mic-test stops before Docker" "1|" "$mic_status|$(cat "$MIC_LOG")"
check_has "saying which setting it needs" "No JARVIS_SOUND_CARD in jarvis/.env." "$mic_output"

for state in idle recording working failed; do
  mic_setup
  mkdir -p "$work/repo/ears/switch"
  echo "unmuted 1763690000000000000" > "$work/repo/ears/switch/mute"
  FAKE_PS=abc123 FAKE_HEALTH="200 $state" mic_test mic-test
  check "with ears running and $state, mic-test asks ears after building and stops, without touching the switch" "1|docker compose ps --status running --quiet ears|docker compose exec -T ears node dist/ask.js health|unmuted 1763690000000000000" "$mic_status|$(sed -n 3p "$MIC_LOG")|$(sed -n 4p "$MIC_LOG")|$(cat "$work/repo/ears/switch/mute")"
  check_has "saying what ears said and to mute it first" "Ears is running and $state, not muted, so it may be using the microphone. Mute it with bash host/ears.sh mute, wait a second, run this again, then unmute it." "$mic_output"
done

for health in fails "" "404 {}" "401 muted" "200 (no state)"; do
  mic_setup
  FAKE_PS=abc123 FAKE_HEALTH="$health" mic_test mic-test
  check "with ears running and no clear answer ('$health'), mic-test stops, saying only that" "1|0|0" "$mic_status|$(grep -c '^recorder' "$MIC_LOG")|$(grep -c 'not muted' <<< "$mic_output")"
  check_has "saying ears didn't say" "Ears is running but didn't say whether it's muted, so it may be using the microphone. If it has only just started, wait a few seconds and run this again; otherwise stop it with bash host/ears.sh stop, run this again, then start it." "$mic_output"
done

mic_setup
mkdir -p "$work/repo/ears/switch"
echo "unmuted 1763690000000000000" > "$work/repo/ears/switch/mute"
FAKE_PS=abc123 FAKE_HEALTH="200 muted" mic_test mic-test
check "with ears running and muted, mic-test runs whatever the switch file says, as after a restart that left it saying unmuted" "0|1" "$mic_status|$(grep -c '^recorder' "$MIC_LOG")"

mic_setup
FAKE_HEALTH="200 idle" mic_test mic-test
check "with ears not running, mic-test doesn't ask it anything" "0|0" "$mic_status|$(grep -c 'compose exec' "$MIC_LOG")"

for image in ears jarvis; do
  mic_setup
  FAKE_BUILD_FAIL=$image mic_test mic-test
  check "an image that won't build ($image) stops mic-test before anything runs" "1|0" "$mic_status|$(grep -c -e '^recorder' -e '^player' "$MIC_LOG")"
done

mic_setup
FAKE_RECORDER_FAIL="The microphone is busy: something else has it open." mic_test mic-test
check "a recorder that fails makes mic-test fail with its code, and nothing is played" "1|0" "$mic_status|$(grep -c '^player:' "$MIC_LOG")"
check_has "with what the recorder said" "The microphone is busy: something else has it open." "$mic_output"
check "and nothing about it sending no sound or playing it back" "0" "$(grep -c -e 'ended without sending' -e "couldn't be played back" <<< "$mic_output")"
check "and no done line" "0" "$(grep -c 'Done.' <<< "$mic_output")"

mic_setup
FAKE_RECORDER_SILENT=1 mic_test mic-test
check "a recorder that ends well but sends nothing fails mic-test, and nothing is played" "1|0" "$mic_status|$(grep -c '^player:' "$MIC_LOG")"
check_has "saying so" "The check ended without sending any sound, so nothing was played." "$mic_output"

mic_setup
FAKE_RECORDER_SAYS="something else" mic_test mic-test
check "a recorder that sends anything but the sound line fails mic-test, and nothing is played" "1|0" "$mic_status|$(grep -c '^player:' "$MIC_LOG")"
check_has "saying so" "The check sent something other than sound, so nothing was played." "$mic_output"
check "and nothing about playing it back" "0" "$(grep -c "couldn't be played back" <<< "$mic_output")"

mic_setup
FAKE_PLAYER_FAIL=1 mic_test mic-test
check "a player that fails makes mic-test fail" "1" "$mic_status"
check_has "with what aplay said" "aplay: main:850: audio open error: Device or resource busy" "$mic_output"
check_has "and what to do" "The recording worked, but it couldn't be played back. If aplay says the device is busy, something else is playing, like Jarvis speaking: wait for it to finish and run this again." "$mic_output"
check "and no done line" "0" "$(grep -c 'Done.' <<< "$mic_output")"

mic_setup
FAKE_RECORDER_BIG=1 FAKE_PLAYER_FAIL=early mic_test mic-test
check "a player that fails before taking any sound fails mic-test with its own code, though the recorder then fails on the closed pipe" "1|failed" "$mic_status|$(grep '^recorder ended' "$MIC_LOG" | grep -qv 'ended 0$' && echo failed)"
check_has "and still says what to do" "The recording worked, but it couldn't be played back. If aplay says the device is busy, something else is playing, like Jarvis speaking: wait for it to finish and run this again." "$mic_output"

for code in 0 1 die; do
  mic_setup
  FAKE_PLAYER_INT=$code mic_test_ctrl_c
  check "Ctrl+C while it plays back ends mic-test as Ctrl+C does, with nothing about a busy device and no done line, whatever the player then does ($code)" "130|same|0|0" "$mic_status|$(cmp -s "$SOUND" "$PLAYED" && echo same || echo different)|$(grep -c "couldn't be played back" <<< "$mic_output")|$(grep -c 'Done.' <<< "$mic_output")"
done

mic_setup
FAKE_RECORDER_INT=1 mic_test_ctrl_c
check "Ctrl+C while it records ends mic-test as Ctrl+C does, playing nothing and saying nothing about sound that didn't come" "130|1|0|0" "$mic_status|$(grep -c '^recorder:' "$MIC_LOG")|$(grep -c '^player:' "$MIC_LOG")|$(grep -c -e 'ended without sending' -e "couldn't be played back" <<< "$mic_output")"

mic_setup
FAKE_RECORDER_INT=sends mic_test_ctrl_c
check "Ctrl+C before the sound comes plays nothing, even if the sound still comes after it" "130|0" "$mic_status|$(grep -c '^player:' "$MIC_LOG")"

mic_setup
: > "$MIC_LOG"
rm -f "$STARTED"
(cd "$work/repo" && SOUND_DIR="$snd" TMPDIR="$work/tmp" PATH="$work/micbin:$PATH" FAKE_PLAYER_INT=0 script -qec "bash -c 'bash host/ears.sh mic-test; echo after it'" /dev/null < <(for _ in $(seq 1 100); do [ -e "$STARTED" ] && break; sleep 0.05; done; sleep 0.2; printf '\003'; sleep 1) > "$work/out" 2>&1)
check "and a script that ran it is stopped by the same Ctrl+C while it plays back, as by any other command's" "1|0" "$(grep -c '^player:' "$MIC_LOG")|$(grep -c 'after it' "$work/out")"

for args in "mic-test 5 6" "mute 5" "start 5" "whisper-model x" "wake-report 5 6" "voice-enrol 5" "voice-check 5 6"; do
  mic_setup
  read -r -a words <<< "$args"
  mic_test "${words[@]}"
  check "too many arguments are refused before anything runs: '$args'" "1|" "$mic_status|$(cat "$MIC_LOG")"
  check_has "with the usage: '$args'" "Usage: bash host/ears.sh mute|unmute|start|stop|talk|whisper-model|voice-enrol, bash host/ears.sh mic-test [seconds to wait], bash host/ears.sh voice-check [seconds to wait], or bash host/ears.sh wake-report [hours]" "$mic_output"
done

voice_dir="$work/repo/ears/voice"
saved="$voice_dir/voiceprint.json"

mic_setup
output=$(cd "$work/repo" && PATH="$work/micbin:$PATH" SOUND_DIR="$snd" bash host/ears.sh voice-enrol < /dev/null 2>&1)
check "voice-enrol without a terminal is refused, before Docker, and writes nothing" "1||no folder" "$?|$(cat "$MIC_LOG" 2> /dev/null)|$([ -e "$voice_dir" ] && echo folder || echo "no folder")"
check_has "saying it only runs from a terminal someone types in" "voice-enrol records the room, so it only runs from a terminal someone is typing in, not from a script or an AI tool." "$output"
output=$(cd "$work/repo" && PATH="$work/micbin:$PATH" SOUND_DIR="$snd" bash host/ears.sh voice-check < /dev/null 2>&1)
check "voice-check without a terminal is refused too" "1|" "$?|$(cat "$MIC_LOG" 2> /dev/null)"
check_has "saying why" "voice-check records the room, so it only runs from a terminal someone is typing in" "$output"

mic_setup
printf 'EARS_TOKEN=a-secret-token\nEARS_MICROPHONE=card\nEARS_SOUND_CARD=usb-0000:00:14.0-1\nEARS_MIC_LEVEL=100\nEARS_MIC_CONTROL=Mic\nEARS_MIC_BOOST=2\nEARS_MIC_BOOST_CONTROL="Mic Boost"\nEARS_VOICE_ID_THRESHOLD=0.45\n' > "$work/repo/ears/.env"
mic_test voice-enrol
check "voice-enrol builds ears's image, checks ears isn't listening, then records in a throwaway container with only the microphone and its mixer, no network and no log, and ears's microphone settings and threshold passed by name" "0|docker build -q -t home-hub-ears ears
docker compose ps --status running --quiet ears
enrol: $hardened --group-add $(stat -c %g "$snd/controlC2") --device /dev/snd/controlC2:/dev/snd/controlC2:rw --device /dev/snd/pcmC2D0c:/dev/snd/pcmC2D0c:rw -e EARS_MIC_LEVEL -e EARS_MIC_CONTROL -e EARS_MIC_BOOST -e EARS_MIC_BOOST_CONTROL -e EARS_VOICE_ID_THRESHOLD home-hub-ears node dist/voice-enrol-run.js | EARS_MIC_LEVEL=100 EARS_MIC_CONTROL=Mic EARS_MIC_BOOST=2 EARS_MIC_BOOST_CONTROL=Mic Boost EARS_VOICE_ID_THRESHOLD=0.45 EARS_TOKEN=unset" "$mic_status|$(cat "$MIC_LOG")"
check "it saves exactly the voiceprint the enrolment sent, as one line" "same" "$(cmp -s <(cat "$VOICEPRINT"; echo) "$saved" && echo same || echo different)"
check "in a folder and a file only their owner can open" "700 600" "$(stat -c %a "$voice_dir") $(stat -c %a "$saved")"
check "with nothing else left in the folder" "voiceprint.json" "$(ls -A "$voice_dir")"
check "the enrolment gets no folder from the server and no token" "0|0" "$(grep '^enrol:' "$MIC_LOG" | grep -c -e '--mount' -e ' -v ' -e 'source=')|$(grep -c 'a-secret-token' "$MIC_LOG")"
check_has "passing on what the enrolment says" "Sentence 1 of 5. Read it at your normal speed when it says Go:" "$mic_output"
check_has "and saying where it saved it, and that it's private" "Saved your voiceprint in ears/voice/voiceprint.json. Only you can read it, and git ignores it." "$mic_output"
check_has "and how to try it" "Try it with bash host/ears.sh voice-check." "$mic_output"
check "and never prints the voiceprint" "0" "$(grep -c '0.044194' <<< "$mic_output")"

mic_test voice-enrol
check_has "a second enrolment replaces the first, saying so" "Saved your new voiceprint in ears/voice/voiceprint.json, in place of the old one." "$mic_output"
check "still with nothing else in the folder" "0|voiceprint.json" "$mic_status|$(ls -A "$voice_dir")"

for case in "FAKE_ENROL_FAIL=Clip 3 sounds like a different voice|1|Clip 3 sounds like a different voice" "FAKE_ENROL_SAYS=|1|The enrolment ended without sending a voiceprint, so nothing was saved." "FAKE_ENROL_SAYS=something else|1|The enrolment sent something other than a voiceprint, so nothing was saved." "FAKE_ENROL_SAYS=voiceprint follows|1|The voiceprint didn't come through whole, so nothing was saved." "FAKE_ENROL_SAYS=voiceprint follows
{\"model\":\"other\",\"clips\":5,\"made\":\"2026-11-20T10:00:00.000Z\",\"vector\":[0.1]}|1|The voiceprint didn't come through whole, so nothing was saved." "FAKE_ENROL_SAYS=voiceprint follows
$(cat "$VOICEPRINT")
more|1|The voiceprint didn't come through whole, so nothing was saved." "FAKE_ENROL_SAYS=voiceprint follows
$(cat "$VOICEPRINT")
|1|The voiceprint didn't come through whole, so nothing was saved." "FAKE_ENROL_SAYS=voiceprint follows
{\"model\":\"wespeaker_en_voxceleb_CAM++\",\"clips\":5,\"made\":\"2026-11-20T10:00:00.000Z\",\"vector\":[\$(reboot)]}|1|The voiceprint didn't come through whole, so nothing was saved."; do
  IFS='|' read -r -d '' fake code said <<< "$case" || true
  said=${said%$'\n'}
  mic_setup
  mkdir -p "$voice_dir"
  echo "old voiceprint" > "$saved"
  (export "${fake%%=*}=${fake#*=}"; mic_test voice-enrol; printf '%s\n%s\n' "$mic_status" "$mic_output" > "$work/enrol-result")
  mic_status=$(head -n 1 "$work/enrol-result")
  mic_output=$(tail -n +2 "$work/enrol-result")
  check "an enrolment that fails or sends anything but one whole voiceprint saves nothing and keeps the old one: ${fake:0:60}" "$code|old voiceprint|voiceprint.json" "$mic_status|$(cat "$saved")|$(ls -A "$voice_dir")"
  check_has "saying why: ${fake:0:60}" "$said" "$mic_output"
  check "and no saved line: ${fake:0:60}" "0" "$(grep -c '^Saved your' <<< "$mic_output")"
done

mic_setup
FAKE_ENROL_FAIL="The voice model couldn't run: it broke." mic_test voice-enrol
check "an enrolment that fails ends with its own code and words, saying nothing about a missing voiceprint" "1|1|0" "$mic_status|$(grep -c "The voice model couldn't run: it broke." <<< "$mic_output")|$(grep -c 'ended without sending' <<< "$mic_output")"

mic_setup
: > "$MIC_LOG"
rm -f "$STARTED"
(cd "$work/repo" && { for _ in $(seq 1 100); do [ -e "$STARTED" ] && break; sleep 0.05; done; sleep 0.2; printf '\003'; sleep 1; } | SOUND_DIR="$snd" TMPDIR="$work/tmp" PATH="$work/micbin:$PATH" FAKE_ENROL_INT=1 script -qec "bash host/ears.sh voice-enrol" /dev/null > "$work/out" 2>&1)
check "Ctrl+C during the enrolment ends it as Ctrl+C does, saving nothing and saying nothing about it" "130|no voiceprint|0" "$?|$([ -e "$saved" ] && echo voiceprint || echo "no voiceprint")|$(grep -c -e 'nothing was saved' -e 'Saved your' "$work/out")"

mic_setup
: > "$MIC_LOG"
rm -f "$STARTED"
(cd "$work/repo" && SOUND_DIR="$snd" TMPDIR="$work/tmp" PATH="$work/micbin:$PATH" FAKE_ENROL_INT=1 script -qec "bash -c 'bash host/ears.sh voice-enrol; echo after it'" /dev/null < <(for _ in $(seq 1 100); do [ -e "$STARTED" ] && break; sleep 0.05; done; sleep 0.2; printf '\003'; sleep 1) > "$work/out" 2>&1)
check "and a script that ran it is stopped by the same Ctrl+C, as by any other command's" "0" "$(grep -c 'after it' "$work/out")"

for state in idle recording; do
  mic_setup
  FAKE_PS=abc123 FAKE_HEALTH="200 $state" mic_test voice-enrol
  check "with ears running and $state, voice-enrol stops before recording" "1|0" "$mic_status|$(grep -c '^enrol' "$MIC_LOG")"
  check_has "saying to mute it first" "Ears is running and $state, not muted, so it may be using the microphone. Mute it with bash host/ears.sh mute" "$mic_output"
done

mic_setup
FAKE_BUILD_FAIL=ears mic_test voice-enrol
check "an image that won't build stops voice-enrol before anything runs" "1|0" "$mic_status|$(grep -c '^enrol' "$MIC_LOG")"

mic_setup
printf 'EARS_TOKEN=x\nEARS_SOUND_CARD=pci-0000:04:00.1\n' > "$work/repo/ears/.env"
mic_test voice-enrol
check "a card with no microphone stops voice-enrol before Docker" "1|" "$mic_status|$(cat "$MIC_LOG")"

mic_setup
mic_test voice-check
check "voice-check with no voiceprint stops before Docker, saying how to make one" "1||There's no voiceprint yet: make one with bash host/ears.sh voice-enrol" "$mic_status|$(cat "$MIC_LOG")|$mic_output"

mic_setup
printf 'EARS_TOKEN=a-secret-token\nEARS_SOUND_CARD=pci-0000:04:00.6\nEARS_MIC_LEVEL=70\nEARS_VOICE_ID_THRESHOLD=0.55\n' > "$work/repo/ears/.env"
mkdir -p "$voice_dir"
cp "$VOICEPRINT" "$saved"
chmod 700 "$voice_dir"
chmod 600 "$saved"
mic_test voice-check 08
check "voice-check runs as you, so it can read your voiceprint, with only the microphone, its mixer and the voiceprint's folder read-only, the threshold and the wait passed by name" "0|check: $hardened --user $(id -u):$(id -g) --group-add $card_group --device /dev/snd/controlC1:/dev/snd/controlC1:rw --device /dev/snd/pcmC1D0c:/dev/snd/pcmC1D0c:rw -e EARS_MIC_LEVEL -e EARS_MIC_CONTROL -e EARS_MIC_BOOST -e EARS_MIC_BOOST_CONTROL -e EARS_VOICE_ID_THRESHOLD -e EARS_VOICE_CHECK_WAIT --mount type=bind,source=$work/repo/ears/voice,target=/voice,readonly home-hub-ears node dist/voice-check-run.js | EARS_MIC_LEVEL=70 EARS_VOICE_ID_THRESHOLD=0.55 EARS_VOICE_CHECK_WAIT=8 EARS_TOKEN=unset" "$mic_status|$(grep '^check:' "$MIC_LOG")"
check_has "and passes on the score" "Score against the voiceprint: 0.73." "$mic_output"
check "and leaves the voiceprint as it was" "same|600" "$(cmp -s "$VOICEPRINT" "$saved" && echo same || echo different)|$(stat -c %a "$saved")"

mic_setup
mkdir -p "$voice_dir"
cp "$VOICEPRINT" "$saved"
FAKE_CHECK_EXIT=1 mic_test voice-check
check "a check that fails fails voice-check with its code" "1" "$mic_status"

for wait_for in x 61 1.5; do
  mic_setup
  mic_test voice-check "$wait_for"
  check "a wait of '$wait_for' stops voice-check before Docker" "1|" "$mic_status|$(cat "$MIC_LOG")"
  check_has "saying what it must be: '$wait_for'" "The wait is $wait_for, but it must be a whole number of seconds from 0 to 60" "$mic_output"
done

dockerfile="$here/../ears/Dockerfile"
check "ears's image is built and run on Node 26's slim Debian image, which onnxruntime's ready-made files need" "2" "$(grep -c '^FROM node:26-trixie-slim' "$dockerfile")"
check "it builds with npm ci, after copying in the .npmrc that keeps it from fetching onnxruntime's CUDA files, and keeps only this machine's onnxruntime files" "1|after|1|1" "$(grep -c '^RUN npm ci$' "$dockerfile")|$(awk '/^COPY .*\.npmrc/ { copied = NR } /^RUN npm ci$/ { print (copied > 0 && copied < NR) ? "after" : "before" }' "$dockerfile")|$(grep -c 'npm prune --omit=dev' "$dockerfile")|$(grep -c 'rm -rf win32 darwin && find linux -mindepth 1 -maxdepth 1 ! -name \"\$(node -p process.arch)\" -exec rm -rf {} +' "$dockerfile")"
check "the speech detector's model is downloaded and checked while the image builds, and copied in beside the code" "1|1" "$(grep -c 'node dist/fetch-model-run.js /app/models/silero_vad.onnx' "$dockerfile")|$(grep -c '^COPY --from=build /app/models ./models$' "$dockerfile")"
check "and so is the voice model, by name, into the same folder" "1" "$(grep -c 'node dist/fetch-model-run.js /app/models/voice-id.onnx voice' "$dockerfile")"
check "with onnxruntime's telemetry to Microsoft switched off in the image it runs from" "ENV ORT_DISABLE_TELEMETRY=1|2" "$(grep 'TELEMETRY' "$dockerfile")|$(awk '/^FROM/ { stage++ } /ORT_DISABLE_TELEMETRY/ { print stage }' "$dockerfile")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
