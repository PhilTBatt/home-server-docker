# 0039. Ears listens for "Hey Jarvis" while a chat that wants it is open

- Date: 2026-11-20
- Status: accepted; a wake while `/talk` is still recording does nothing, and only one after a `/talk` recording has ended takes over; a hold also silences a recording that's already running; and a busy chat waits a second before it takes a wake (0040); with `EARS_WAKE_END=silero` a wake recording ends when Silero's speech detector hears no speech, instead of when it goes quiet (0042); and after a spoken answer, Jarvis's own code can ask ears to listen once more without the wake word (0043)

## Context
Push-to-talk works (record 0038), and the wake word was always going to follow it. openWakeWord has a ready-made "hey jarvis" model, and `rhasspy/wyoming-openwakeword` serves it over Wyoming, which ears already speaks to Whisper. Ears can't start Jarvis, because that would need Docker access, which no container gets. So the wake word has to reach a chat that's already open, and I keep Jarvis's chats open in tmux. He mustn't be listening while he talks (rule R11), because the microphone and his speakers are on the same card. The TV faces my bed and desk, so false wakes have to be countable. Several things needed deciding: the engine, how the microphone is shared, when ears listens at all, how the wake reaches the chat, how a spoken command ends, how he stops listening while he talks, and the cue that he's heard.

## Options considered
The engine:
- openWakeWord's stock "hey jarvis" model, through `rhasspy/wyoming-openwakeword` 2.1.0 pinned by digest, in its own container: chosen. It's the newest release (28 October 2025, a memory-leak fix), from the same author as the Whisper and Piper images, the model is in the image, and the same 2.1.0 code used about 60 MB after two minutes of sound and about a tenth of a CPU core outside Docker. It runs as user 10400, which has no account on the server, with Docker's own init, a tmpfs `/tmp`, a 256 MB limit, no port, no device, and only the `ears` network.
- sherpa-onnx keyword spotting (plain "Jarvis", no training), Porcupine (needs an account key and activation online) and LiveKit's detector: left for the comparisons in the next step.

Sharing the microphone:
- With the wake word on, ears runs one `arecord` the whole time it's listening, and the wake word and every recording, push-to-talk included, take their sound from it: chosen. As I understand plain ALSA without a sound server, only one program can have the microphone open at a time, so a second `arecord` for the recording would fail.
- A sound server that lets two programs share it (PipeWire): not chosen, for the reasons in decision D9 of the voice plan.

When ears listens:
- Only while it's unmuted and a Jarvis chat with `JARVIS_EARS=wake` is waiting on it: chosen. The chat's waiting request counts as someone listening, with 5 seconds' grace between requests, and the chat keeps waiting even while it answers. With no such chat, the microphone is closed. A wake in the grace after the last chat has gone isn't taken by anyone, so it's dropped at 2 seconds.
- Whenever it's unmuted: not chosen. The microphone would be open for nothing whenever no chat is open.

How the wake reaches the chat:
- The chat waits on `GET /wait`, which answers at once whenever anything ears shows changes (or after 20 seconds), and takes a wake-word recording with `POST /wake/claim`. A recording no chat takes within 2 seconds is dropped without going to Whisper. If two chats are open, the first to take it gets it. A wake while `/talk` is still listening takes over, because ears keeps only the latest recording: chosen.
- Ears starting Jarvis: not possible, as above. Jarvis as a service that's always running: not now, while a chat in tmux does the job.

How a spoken command ends, until a real voice detector:
- When it's been quiet for 1.5 seconds after speech: chosen. Ears measures the room in the 3 seconds before the wake word (the level a fifth of the way up), and counts as speech anything three times that, and never below 300. It ignores the first 0.8 seconds, which are the end of "Hey Jarvis" and the chime. Enter on an empty line sends it at once, and the 30-second limit still applies. It keeps the half second before the detection, which is mostly the end of "Hey Jarvis", so a command said straight after it isn't clipped.
- With no speech within 5 seconds, it ends and is dropped without going to Whisper: chosen. The TV sets the room's level, so its dialogue rarely counts as speech, and a false wake from the TV usually ends this way instead of asking Claude about it. The cost: if I speak too quietly, it's dropped too, and Enter before the 5 seconds are up still sends it.
- A fixed length: not chosen. Short commands would wait, and long ones would be cut off.

Not listening while he talks:
- Every Jarvis with his voice on and an ears token holds the wake word (`POST /wake/hold`, named with that chat's own id) from when he starts an answer, which includes while Claude is thinking, until his last sound has played, and while he says his start-up sentence, renewing every 5 seconds, then lets go (`POST /wake/release`). Ears keeps each chat's hold apart, stops passing sound to openWakeWord at once, throws away what the microphone hears meanwhile, and starts again half a second after the last hold is let go, with a fresh start for openWakeWord. A hold runs out by itself after 15 seconds, so a chat that dies can't leave ears deaf: chosen. A chat with `JARVIS_EARS=off` has no token, so it can't hold: one speaking while a wake chat is open would be heard.
- Echo cancellation, so I could talk over him: not now. It needs hardware or a sound server.

The cue:
- Jarvis plays two short rising notes when he takes a wake, on his own speakers, only when his voice is on: chosen.
- Ears playing it: not chosen. Ears has no speakers, and giving it any would be a new device.

Settings:
- `EARS_WAKE` (`off` by default) in `ears/.env`, and `EARS_WAKE_THRESHOLD` (default 0.5, openWakeWord's own), which `bash host/ears.sh start` passes to the server: chosen. The threshold is what to raise if the TV sets him off.

## Decision
With `EARS_WAKE=on`, ears listens for "Hey Jarvis" through openWakeWord whenever it's unmuted and a chat with `JARVIS_EARS=wake` is waiting on it, records what follows until it goes quiet, and the chat takes the recording, shows the text and asks it. Jarvis holds the wake word while he talks.

## Confidence and the case against
Medium. Every part has its own tests, and ears was run against the real openWakeWord 2.1.0 code, with the exact library versions its image has, using openWakeWord's own test clip (its "hey mycroft" model, since there's no "hey jarvis" clip). Nobody has said "Hey Jarvis" to it yet, and the quiet check's numbers are guesses until I've used it. The case against: a false wake from the TV sends whatever Whisper heard to Claude as a question, and speaks the answer. The microphone is open whenever a wake chat is open and ears is unmuted, which is far more listening than push-to-talk. And the model's licence is non-commercial (CC BY-NC-SA 4.0): fine at home, but it rules out ever selling this with that model.

## Consequences
- Each detection is logged, so false wakes can be counted with `docker compose logs ears`. There's no score: openWakeWord's detection message over Wyoming carries none (read in 2.1.0's code, and its `--debug-probability` was removed in 2.0.0). A detection that came while ears wasn't listening, or more than 2 seconds after the sound it's about (judged by the time openWakeWord puts in it), is logged as ignored. The room's level is logged, never the sound or the text.
- Ears waits for one `arecord` to end before it starts the next, because only one can have the microphone.
- The answer log's `heard` gains `wake: true` for a question asked this way, and `npm run compare` counts them.
- `GET /wait` gives ears's whole state, its text included, to whoever has the token, as `GET /state` already did.
- The model is inside the image and never in this repo.
- Ears needs openWakeWord on its network. If it's down, ears says why, tries again every 5 seconds, and push-to-talk still works.
