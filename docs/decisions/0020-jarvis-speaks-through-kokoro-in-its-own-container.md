# 0020. Jarvis's first voice is Kokoro, in its own container on a network with no internet

- Date: 2026-11-18
- Status: accepted, with his answers spoken and Kokoro's logging turned down by 0023, and the speech network closed to the server itself by 0024

## Context
Jarvis is going to speak. Record 0014 covers playing raw sound; something still has to turn his words into that sound. The speech model is far bigger than anything in his own container and takes a few seconds to load, and this server has 8 GB of memory, with about 2.5 GiB of it free when this was measured. Five things needed deciding: which speech engine comes first, how Jarvis talks to it, what it can reach, when it runs, and how it's pinned and limited.

## Options considered
Which engine first:
- Kokoro, through the Kokoro-FastAPI project's CPU image, with Piper to follow behind the same setting: chosen. The reading done beforehand rates its voice as the more natural of the two, and it answers a plain web request. Tried on this server on 18 Nov 2026 (version 0.10.0, voice `bm_george`): about 3 seconds to start, 1.15 GiB of memory idle and 1.24 GiB after speaking, and roughly 0.3 seconds plus 0.37 seconds for each second of speech.
- Piper first: not chosen. The same reading has it faster and far smaller but flatter-sounding. It hasn't been run on this server yet, and it speaks the Wyoming protocol, which needs a client written first. It comes second, as the speed baseline.
- A cloud voice: not now. It costs per month, and what Jarvis says would leave the house.
- Speech inside Jarvis's own process: not chosen. The library looked at (sherpa-onnx) had just dropped the part that works out how words are said, and isn't listed for Alpine.

How Jarvis talks to it:
- One web request for each piece of text, to Kokoro's `POST /v1/audio/speech`, asking for raw PCM and the whole reply at once: chosen. The sound comes back as 16-bit mono at 24,000 Hz, ready for `aplay`. A piece that fails comes back as an error, never as half a sentence.
- Kokoro's own streaming: not chosen for now. It streams in packs of sentences, so for one sentence at a time the wait is the same, and a failure part-way would cut a sentence off mid-word.
- A proxy in front of Kokoro so that every speech engine speaks Wyoming: not chosen. One more container, from a small third-party project, on the path to something that already has a web API.

What it can reach:
- A network of its own, `speech`, marked internal, with no published port: chosen. An internal network has no route out, so Kokoro can't reach the internet or the LAN. Jarvis joins it only through `docker-compose.sound.yaml`.
- Jarvis's `jarvis` network: not chosen. Kokoro would reach the API and the internet for no reason.
- A published port: not chosen. Kokoro's API has no login.

When it runs:
- `host/jarvis.sh` starts it before a chat with the voice on, and stops it when the chat ends, unless it was already running: chosen. Its memory is only used while Jarvis is, and `JARVIS_VOICE` is the one switch.
- Started and stopped by hand: not chosen. Two commands to talk to Jarvis, and easy to leave running.
- Always on: not chosen for now. That's about half of this server's free memory, all day.

How it's pinned and limited:
- The image named by its version and its digest, with a 2 GiB memory limit and a healthcheck: chosen. The digest means the image can't change without a change to this file, and 2 GiB is the ceiling the trial ran under.
- `latest`, like most services here: not chosen. A third-party image holding a model shouldn't change on a pull.
- No memory limit: not chosen. A runaway speech engine could starve the rest of the server.

## Decision
`docker-compose.yaml` gets a `kokoro` service: the Kokoro-FastAPI CPU image pinned by version and digest, in the `kokoro` profile, on the internal `speech` network only, with a healthcheck on its `/health` route and a 2 GiB memory limit. `JARVIS_VOICE=kokoro` in `jarvis/.env` turns Jarvis's voice on, and `JARVIS_KOKORO_VOICE` picks the voice. `host/jarvis.sh` then builds his sound image, starts Kokoro, and runs the chat with `docker-compose.sound.yaml`, which also puts him on `speech`. As he starts, Jarvis sets the speaker level (record 0015), checks that Kokoro answers, and says one fixed sentence. Speaking his answers comes next.

## Confidence and the case against
Medium (Claude's estimate). The case against:
- Kokoro takes about a second before the first sound of a short sentence, on top of Claude's own time, when quick replies matter most. Piper is the answer to compare it with.
- While it runs, Kokoro takes about half of this server's free memory, which squeezes what else can run beside it.
- The script owns Kokoro's lifetime, so with two chats open, the one that started Kokoro stops it under the other. A Kokoro the script found already running is waited for, never recreated, and not stopped by that script, whoever started it.
- The image is 4.87 GB on disk.

## Consequences
- With `JARVIS_VOICE` off or missing, Jarvis runs as he did: no image is built, no sound file is added and Kokoro isn't started. Three things do differ. His settings line gains `JARVIS_VOICE`, `JARVIS_KOKORO_VOICE` and `JARVIS_VOLUME`. A wrong `JARVIS_KOKORO_VOICE` or `JARVIS_VOLUME` now stops him even with the voice off, like his other settings. And `host/jarvis.sh` refuses a `JARVIS_VOICE` it doesn't know.
- If his voice can't start (no sound devices, the level can't be set, Kokoro doesn't answer, or the sentence can't be made or played within 45 seconds), Jarvis says why once and the chat carries on in text. A microphone device in his container is the exception: it stops him starting at all. The script has two stops of its own, before any chat: a missing or wrong `JARVIS_SOUND_CARD`, and a sound image that won't build.
- Kokoro's image carries its model and voices, so it's expected to need nothing from the internet once it's pulled. That's from reading its code: when this was written it hadn't yet been run on a network without internet. `HF_HUB_DISABLE_TELEMETRY=1` skips the requests it otherwise makes to Hugging Face as it starts, `DEFAULT_VOICE` makes its own warm-up use Jarvis's default voice, and `ENABLE_WEB_PLAYER=false` turns off its web page.
- Kokoro's API has no login, so anything on `speech` can use it. Today that's only Jarvis. Anything else joining `speech` is security-sensitive.
- Internal doesn't mean sealed. Docker still gives the network's bridge an address on the server, and a container on the network can reach anything on the server itself that listens on that address or on every address, as SSH normally does. In a test with Docker 29, away from this server, it couldn't reach another container's published port that way, or the server's other addresses. Docker's `isolated` gateway mode gives the bridge no address and closes this; it isn't used yet, because it needs Docker Engine 28 or newer and the server's version wasn't checked.
- The sound test joins `speech` too, and creates the network if it isn't there, because it uses the same sound file. It never uses it.
- `JARVIS_VOICE`'s values are known in two places, Jarvis's settings and `host/jarvis.sh`. A test in `host/jarvis.test.sh` keeps them in step.
- Kokoro is in a profile, so `docker compose up -d` and `host/hub-update.sh` never start or update it. A newer version means changing its `image:` line, tag and digest together.
- The sentence at start-up adds a few seconds before the first prompt.
- Licences: Kokoro-FastAPI and the Kokoro model's weights are both Apache-2.0. Nothing from either is copied into this repo.
