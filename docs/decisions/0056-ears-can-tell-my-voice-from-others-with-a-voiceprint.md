# 0056. Ears can tell my voice from others with a voiceprint

- Date: 2026-11-26
- Status: accepted

## Context
Ears records after "Hey Jarvis" and sends what it hears to Whisper. It can't tell who is talking: the TV, someone else in the room, or Jarvis's own voice all count as speech, and so does Silero's detector (record 0042). Jarvis holds the wake word while he speaks (record 0039), but the TV and other people get through. I'll need to tell my voice from the TV eventually, so I wanted the parts built now: a small model that turns a voice into a list of numbers, a voiceprint of mine made from a few sentences I read, and a score for how alike they are. That needs a model file, more memory in ears, and a voiceprint kept on the server, never in this repo.

## Options considered
Chosen 26 Nov:
- Building voice ID now, behind a setting that's off by default: chosen. Leaving it until the TV is a proven problem: not chosen, since I know it will be.
- A voiceprint of me kept on the server, in a git-ignored folder, readable only by me: chosen.

Claude's picks, not discussed:
- The model: WeSpeaker's CAM++ trained on VoxCeleb (English), as published in sherpa-onnx's speaker recognition release on GitHub (28 MB, 512 numbers to a voice). On 110 test clips (8 synthetic British voices, 8 synthetic American ones and 3 real people speaking Mandarin, from sherpa-onnx's own test files) it separated voices best of the four English models tried, and was the fastest: about 17 ms per second of sound on the machine this was built on. WeSpeaker's ResNet34 (25 MB) came close but took twice as long. 3D-Speaker's CAM++ and ERes2Net for English were no better, and their model pages didn't give a licence I could read. NeMo's TitaNet models and WeSpeaker's larger ResNets are bigger (38 MB and up), and weren't tried.
- The model's licence: WeSpeaker's code is Apache 2.0, and its pretrained models follow their training data's licence, which for VoxCeleb is Creative Commons Attribution 4.0. VoxCeleb is clips of celebrities from YouTube, and its makers say the videos' copyright stays with their owners.
- The model is downloaded while ears's image builds, like Silero's, from a fixed address and checked by size and SHA-256, following GitHub's redirect for release files but never to plain HTTP. It's never in this repo. A host script that downloads it into a mounted folder would keep it out of the image, but adds a step and a mount.
- The features (80 log mel energies every 10 ms, as Kaldi makes them) are worked out in ears's own TypeScript, `fbank.ts`, with no new package. They match kaldi-native-fbank's to within a thousandth, and the voices to within a cosine of 0.9999999.
- A voiceprint is the average of five clips' voices, each from a sentence I read on screen, six seconds each. Nothing I say is kept, only the 512 numbers, with the model's name, how many clips and when.
- Enrolment refuses a clip with less than a second and a half of speech (three tries per sentence), and refuses the whole voiceprint if any clip sounds unlike the rest, under the threshold.
- A recording's speech is from the first tenth of a second above ears's floor for speech (300) to the last, with a tenth either side. Under a second of it is "too short" and not compared, since one-second clips already missed sometimes in tests and half-second ones often did. At most 10 seconds of it are used, to keep ears's memory down.
- The score is the cosine between the recording's voice and the voiceprint, from -1 to 1. The default threshold is 0.5. In the tests, the same voice never scored under 0.70 and different real voices never over 0.56 (0.551 at most); synthetic voices from one model came closer, up to 0.69.
- `EARS_VOICE_ID`: `off` (the default), `observe` (score each recording and log the score, block nothing) or `require`, and `EARS_VOICE_ID_THRESHOLD`.
- What `require` blocks: a recording started by the wake word, by speech over Jarvis (record 0055) or as a follow-up, when its voice counts as a different one, or when the check finds no speech in it loud enough to judge (possible only with Silero's detector, which hears quieter speech). It isn't sent to Whisper, and the chat says nothing was sent and why.
- What `require` lets through: under a second of speech, which can't be judged, so that "yes", "no" and "stop" still work; and recordings started by the talk button or `/talk`, since someone started those by hand. They're still scored.
- If the check itself fails, or takes more than 10 seconds, `require` blocks a wake-word or follow-up recording, saying it couldn't be checked. `observe` only logs it.
- The voice is checked before Whisper, one after the other, so a blocked recording never reaches Whisper. That adds the check's time to every recording.
- With `EARS_TURN_WORDS=on` (record 0054), `require` reads the words at a pause only when the voice so far counts as mine, so another voice's words aren't read part-way or sent to the quick check. An answer under a second then ends on the usual pause.
- Ears loads the voiceprint and the model when it starts, and won't start if it can't, like the speech detector (record 0042).
- The voiceprint's folder reaches ears only through `docker-compose.voice.yaml`, read-only, which `bash host/ears.sh start` adds when the setting is `observe` or `require` and a voiceprint exists. That file also raises ears's memory limit from 256 to 384 MiB.
- `bash host/ears.sh wake-report` counts how voices were judged, with the range of scores each way.
- `bash host/ears.sh voice-enrol` and `voice-check` run in throwaway containers from ears's image, like `mic-test`: no network, no log, only the microphone and its mixer. The voiceprint comes out of the enrolment container through a pipe and the host script writes it, so that container gets no folder at all. The check runs as me, with the voiceprint's folder read-only, so it can read a file only I can read. Both refuse to run without a terminal.

## Decision
Ears gets the parts for voice ID: WeSpeaker's CAM++ model in its image, features in its own code, a voiceprint of me in `ears/voice/` made by `bash host/ears.sh voice-enrol`, a score for any recording against it, and `voice-check` to try it. With `EARS_VOICE_ID=observe`, every recording's voice is scored and logged; with `require`, a wake-word or follow-up recording in a different voice isn't turned into text.

## Confidence and the case against
Medium (Claude's estimate). The model and the numbers match the reference code, but it hasn't heard my voice, my microphone, my room or my TV yet, and most of the test voices were synthetic. Noise lowers scores: with noise at a tenth of the speech's power (10 dB), the same voice dropped as low as 0.40 in tests, so a noisy room or a far-off microphone could fail me at 0.5. The case against: a voiceprint is biometric data about me kept on a server; the TV problem isn't measured yet; ears's image grows by 28 MB and its memory by about 50 MB once loaded, more while scoring; and a speaker-ID model can be fooled by a recording of my voice, so it's a filter for the TV, not a lock. In `require`, a low score on my own voice, from a cold, a noisy room or a different microphone (the speakerphone will need a new voiceprint), means Jarvis ignores me until I change the setting.

## Consequences
- Ears's image downloads a second model while it builds, so building it needs GitHub's release downloads as well as raw files.
- `ears/voice/voiceprint.json` holds my voiceprint. It's git-ignored, its folder is readable only by me, and it's never logged or printed.
- With voice ID on, ears's memory limit is 384 MiB, not 256: in tests here, Node with both models loaded peaked at about 200 MiB while scoring. Memory inside the real container wasn't measured.
- Ears runs as user 1000 in its container, and the voiceprint is readable only by its owner, so the service can read it only if my user on the server is 1000.
- `require` isn't a lock, and it isn't complete: a short word in any voice still gets through, and so does anything after the talk button.
- The voice is checked once a recording has ended, so with `EARS_INTERRUPT` on, `require` doesn't stop the TV cutting him off. It only keeps what the TV said from being asked.
- The voiceprint belongs to the model that made it: a new model means enrolling again, and ears says so.
