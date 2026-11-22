# 0014. Jarvis plays sound through aplay, with only his card's mixer and speakers

- Date: 2026-11-18
- Status: accepted, with the sound file also putting him on the `speech` network (0020); since 21 Nov `aplay` and `amixer` get only `PATH` from Jarvis's environment

## Context
Jarvis is going to speak. A speech engine hands back raw sound (signed 16-bit, mono, at the engine's own rate), and something inside his container has to open the laptop's sound card and feed it those bytes. His container had no sound devices and runs on the stock `node:26-alpine`, which has no sound tools. Three things needed deciding: what plays the sound, how the devices reach his container while a voice-off Jarvis stays exactly as he was, and how the right card is found when card numbers can change between boots.

## Options considered
What plays the sound:
- `aplay`, from `alsa-utils`, started as a child process with the raw sound written into its input: chosen. It's how Wyoming's satellite plays sound in its own example. No library goes into Jarvis's packages, stopping is ending a process, and tests can swap in a pretend player.
- A sound library inside Node: not chosen. `speaker` hadn't had an npm release in over two years. `audify` ships ready-built binaries, but none were confirmed for Alpine, and without one it needs CMake and a C++ compiler in the image.
- A sound server, PipeWire: not chosen for now. It can mix sounds and cancel echo in software, but it's an always-on daemon normally run for a logged-in user, needing host packages or a third-party container. It's the one to switch to if mixing or echo cancellation is wanted.
- Another command-line player (`ffplay`, `sox`): not chosen. Bigger, for nothing that's needed.

How the devices reach him:
- A second compose file, `docker-compose.sound.yaml`, that only `host/jarvis.sh` adds: chosen. Without it his service is unchanged.
- A second service in `docker-compose.yaml`: not chosen. Two definitions of Jarvis to keep in step.
- Passing the devices to his one service: not chosen. Every chat would get the speakers, voice on or off.

How the card is found:
- Its name under `/dev/snd/by-path`, set as `JARVIS_SOUND_CARD` in `jarvis/.env`: chosen. The name stays the same across boots, and `host/jarvis.sh` follows it to that boot's card number.
- Card 1, written into the compose file: not chosen. It breaks if the cards swap numbers.
- The card's `CARD=` name: not chosen. Both cards on this server are called `Generic`, so the second one's `Generic_1` depends on the order they're found in.
- Pinning the card order with a driver option on the host: not chosen. A host change and a reboot.

## Decision
Jarvis plays sound by starting `aplay -q -t raw -f S16_LE -c 1 -r <rate> -D plughw:<card>,0` and writing raw sound into it. He gets his own image for it, `home-hub-jarvis`, from `jarvis/Dockerfile`: `node:26-alpine` plus `alsa-utils`. `host/jarvis.sh` builds it before each run that needs sound, then adds `docker-compose.sound.yaml`, which swaps in that image and passes in only the chosen card's mixer (`controlC<n>`) and speakers (`pcmC<n>D0p`), read and write, plus the group that owns them. The sound test is the first thing to use it: `bash host/jarvis.sh sound-test`.

## Confidence and the case against
High for now (Claude's estimate). The case against:
- Only one program can play through the card at a time (Claude's understanding, not tested here). A chime from another service while Jarvis is talking would fail or wait, where a sound server would mix them.
- Interrupting Jarvis while he speaks needs echo cancellation. A sound server like PipeWire has that built in, while with `aplay` it would mean microphone hardware that cancels echo itself, or an echo-cancelling library in Jarvis's own code, which is more to build.
- The player is one small module and everything else hands it bytes, so switching later should change only that module.

## Consequences
- Without the sound file, Jarvis's container is exactly as before: the stock image and no devices. `docker compose run --rm jarvis` typed by hand never has sound; use `host/jarvis.sh`.
- He never gets a microphone (capture) device. A test on the server showed recording fails without one, and the sound test refuses to run if one is ever passed in.
- The `rw` on each device leaves out `m`, the right to make device nodes, for those two. Docker's default rules still let a container make device nodes in general (seen on Claude's workspace's Docker, not checked on the server), but Jarvis runs as `node`, which can't, and the only devices he may read or write are those two.
- A test on the server showed the speakers can't be opened without the card's mixer node, so the mixer comes with the speakers anyway. It reaches every control on the card, the input ones included, but recording needs a capture device.
- The image is rebuilt from its cache on every run that needs sound, so a change to `jarvis/Dockerfile` takes effect the next time, and `host/hub-update.sh` has nothing to do for it. A newer `node:26-alpine` only reaches it after `docker pull node:26-alpine`.
- `JARVIS_SOUND_CARD` is specific to this laptop and has to be set again on a new server.
- This is the image name record 0006 gave its ripgrep fallback. If that's ever needed, ripgrep goes into the same `jarvis/Dockerfile`.
- No standing RAM: `aplay` runs only while something plays. The image is a few MB bigger than the stock one (Claude's estimate; `docker image ls home-hub-jarvis` shows it).
