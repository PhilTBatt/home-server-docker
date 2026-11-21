# 0042. A wake recording can end on Silero's speech detector

- Date: 2026-11-21
- Status: accepted; the 1.5 seconds without speech that ends a recording can be set from 1 to 5 seconds with `EARS_WAKE_PAUSE` (see 0039's Status line)

## Context
A recording after "Hey Jarvis" ends once it's been quiet for 1.5 seconds after I speak (record 0039). Quiet means under three times the room's level. Anything loud enough keeps it going, even if it isn't a voice: a fan that changes speed, music, the kettle, a door. A quiet voice from across the room can drop under the line and end it early. A voice-activity detector judges whether sound is speech at all. The voice plan named Silero's for this step. I hadn't tried the loudness check yet, so the need isn't proven, and I wanted both ways behind a switch to compare, as with the other choices.

## Options considered
The detector:
- Silero VAD v6.2.3 (MIT licence, a 2.3 MB ONNX model, maintained, its last release in September 2026): chosen. It takes 32 ms of 16 kHz sound at a time, with the 4 ms before it and its own state carried along, and gives a chance of speech. In tests on the machine this was built on, a tenth of a second took about a millisecond; the server's CPU wasn't measured.
- A detector already running: none. openWakeWord's library in its 2.1.0 image (`pyopen-wakeword` 1.1.0) ships only wake-word models.

Where it runs:
- Inside ears, through Microsoft's `onnxruntime-node` (MIT): chosen. It's one process fewer to run, start and keep healthy, and it only loads when it's switched on. Measured with this model: ears used 59 MiB with it loaded and 36 MiB without, in a rehearsal on Docker. Its ready-made Linux files need glibc, which Alpine doesn't have, so ears's image moves to Node's Debian slim image (`node:26-trixie-slim`).
- Inside ears, on Alpine, through `onnxruntime-web`'s WebAssembly build, which needs no native files: not chosen. The same model used about 350 to 400 MB in Node 22 here, more than ears's 256 MB limit.
- Its own container, beside Whisper and openWakeWord: not chosen. About 100 MB, and one more thing to start, stop and maintain. Ears would stream every wake recording to it.

Getting the model:
- Downloaded while ears's image builds, from a fixed commit of Silero's repo on GitHub, checked by size and SHA-256 (`fetch-model.ts`): chosen. It's ears's own image, the file is small, and the build already needs npm.
- In this repo: not chosen. Its licence would allow it, but it's a binary that never changes.
- A host script that downloads it into a mounted folder, as for Whisper's model: not chosen. One more step and one more mount, for 2.3 MB.

How it ends a recording:
- Each tenth of a second counts as speech when any 32 ms piece in it has a chance of 0.5 or more (Silero's own default threshold), and everything else stays as it was: the first 0.8 seconds ignored, 1.5 seconds without speech after I've spoken, 5 seconds with none at all (dropped without going to Whisper), and 30 seconds at most: chosen. Only what counts as speech changes, so the two can be compared fairly.
- Silero's own tools also keep speech going, once it has started, until the chance drops under 0.35 (0.15 under the threshold): not chosen, so one line decides speech throughout, as with loudness. If recordings end while I'm still talking quietly, that's the next thing to try.
- If the detector fails during a recording, or falls more than a second behind, ears logs it once and that recording carries on with the loudness check, worded as loudness. If it can't load at start, ears doesn't start, and says to set `EARS_WAKE_END=loudness`.

The switch and the comparison:
- `EARS_WAKE_END=loudness` (the default) or `silero` in `ears/.env`. Ears's last recording says which way of ending was on for it (`ender`), even when Enter or the 30 seconds ended it, so each setting's questions are compared whole; the answer log keeps it in `heard`, and `npm run compare` splits wake questions' recording times by it once both appear. The microphone check shows what each one heard, half a second to a mark: chosen.

## Decision
With `EARS_WAKE_END=silero`, a wake recording ends when Silero's speech detector, running inside ears, hears no speech for 1.5 seconds after I've spoken. Loudness stays the default, and ears's image moves to Debian slim for it.

## Confidence and the case against
Medium. The model was tested on its own recordings of speech, on silence, noise and a steady tone, and against the real `onnxruntime-node`. It hasn't heard my voice, my room or my TV. The case against: the need isn't proven, and the TV's dialogue is speech too, so it won't help with false wakes from the TV, only with noise that isn't a voice. It adds a native dependency, about 115 MB to download when installing the packages (most of it other platforms' files, which the image throws away), and moves ears off Alpine, which changes the base of an image that works.

## Consequences
- Ears's image is built on `node:26-trixie-slim`, gets `alsa-utils` from Debian, and needs GitHub and npm to build.
- Ears has its first runtime package. `ears/.npmrc` stops its install step fetching NVIDIA CUDA files from nuget.org.
- Microsoft's builds of onnxruntime send usage telemetry over HTTPS by default on Linux, per its privacy notice. `ORT_DISABLE_TELEMETRY=1`, set in ears's image and by `silero.ts` before the runtime loads, switches it off, and ears's network has no internet anyway.
- The tests never load the runtime, so they still run on `node:26-alpine`. A test with the real model runs only when `EARS_SILERO_TEST_MODEL` names one.
- `docker compose run --rm --no-deps ears node dist/silero-check-run.js` checks the model loads and runs on the server.
