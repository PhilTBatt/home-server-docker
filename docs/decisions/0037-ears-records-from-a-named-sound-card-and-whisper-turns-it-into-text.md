# 0037. Ears records from a named sound card, and Whisper turns it into text

- Date: 2026-11-20
- Status: accepted

## Context
Record 0035 built ears with only a pretend microphone, because the one I want is still to be bought. On 20 Nov I asked to test with the laptop's own microphone now instead of waiting, and for it to work with any device, even if that means plugging a headset in. Earlier I'd said I didn't want to use the built-in one; this is for testing, and any card can be named instead. A recording also needs turning into text before Jarvis can use it, which the plan always gave to Whisper. Six things needed deciding: which microphone, how ears gets it, its level, what turns speech into text, how that keeps my words out of its logs, and which recordings it hears.

## Options considered
Which microphone:
- Any sound card, named in `EARS_SOUND_CARD` by its `/dev/snd/by-path` name, the way `JARVIS_SOUND_CARD` names the speakers: chosen. The laptop's card covers a headset in its jack, and maybe its built-in microphone: on many laptops like this one the built-in microphone is on a card of its own, which hasn't been checked here. A USB microphone, the one I'll buy included, is a card of its own.
- Only the laptop's: not chosen. It would have to change again for the next microphone.

How ears gets the device:
- A second compose file, `docker-compose.mic.yaml`, that `bash host/ears.sh start` adds only when `EARS_MICROPHONE=card`, with that one card's mixer and microphone and the group that owns them: chosen, my pick. With the pretend microphone ears still gets no device. It's how Jarvis gets his speakers (record 0014).
- Always giving ears the device: not chosen. It would hold a microphone even when it isn't using one.

Its level:
- Set at start from `EARS_MIC_LEVEL` (default 80) on `EARS_MIC_CONTROL` (default `Capture`), switching capture on, with `keep` to leave the card alone: chosen. The laptop's `Capture` was at 0% and switched off when it was looked at (18 Nov), and a card's levels go back to how its driver starts them after a reboot, as Jarvis found with `Master` (record 0015).
- Leaving levels to be set by hand: not chosen, since a reboot would undo them.

What turns speech into text:
- Whisper, through `rhasspy/wyoming-whisper` 3.8.1 pinned by digest, with faster-whisper and the `base-int8` model, the model it picks for faster-whisper on this kind of CPU: chosen, and I said yes to the container. (Left to choose for itself in English, its code picks a different engine, Parakeet, if the image has it installed.) It's the Wyoming team's own image, so ears talks to it the way Jarvis talks to Piper. 3.9.1 is out on GitHub, but not as an image.
- The `tiny` model: not chosen. It's faster but less accurate, and the numbers on this server will say whether speed matters.

Getting the model there, since Whisper's network has no internet:
- `bash host/ears.sh whisper-model`: four files from pinned versions on Hugging Face, checked by size, and the model itself by its SHA-256: chosen. The `base-int8` model leaves out its tokenizer, so faster-whisper would fetch one from Hugging Face every time it starts. The script fetches that same file, from `openai/whisper-tiny`, once, into the model's folder. Whisper is then told `--local-files-only`, and `HF_HUB_OFFLINE=1` is set.
- Letting the image download it at first start: not chosen. That needs internet, which its network doesn't have.

Keeping my words out of its logs:
- Lifting just its transcript line to warnings, with a `sitecustomize.py` that Python loads at start: chosen, my pick. Whisper 3.8.1 writes every transcript at its normal log level and has no setting to stop it. Its other lines and its errors still show, one of them how long each recording was.
- Turning its Docker logs off: not chosen. Errors would disappear too.
- Leaving it: not chosen. Rule R1 says the words are never logged.

Which recordings it hears:
- One that was asked to stop or ended at its time or sound limit: chosen. One ended by a mute, by a new unmute or by its recorder failing never goes to Whisper, and nor does one where a new unmute came while a stop was still ending it. A mute or new unmute while Whisper is working drops the text even if it comes. A mute is the privacy switch, so it wins.

Keeping the text out of Docker:
- Ears's health check runs `ask.js health`, which prints only the status code and the state's one word: chosen. Its health check ran `ask.js state` (record 0035), which prints the whole state, and Docker keeps what a health check prints, in what `docker inspect` shows and in its own files on disk, so the text would have been kept there.
- Sending the state's output nowhere with a shell: not chosen. It would hide errors too, and nothing would stop the next change printing the text again; `health` has its own test.

## Decision
Ears records from the sound card `EARS_SOUND_CARD` names, given to it only by `docker-compose.mic.yaml` through `bash host/ears.sh start`, and sets its level at start. A recording that was asked to stop or ended at its time or sound limit goes to Whisper, `rhasspy/wyoming-whisper` 3.8.1 with `base-int8` from `whisper/models/`, on the `ears` network. Ears is `working` meanwhile, gives Whisper a minute, and keeps the text in its state until the next recording ends. Whisper runs as user 10300, which has no account on the server, with Docker's init first, its model read-only, its `/tmp` in memory, and its transcript line quietened. Neither ears nor Whisper logs the words, and ears's health check prints only its state's word.

## Confidence and the case against
High that the rules hold: ears's tests cover every way a recording ends while Whisper works, and the real Whisper server code, version 3.8.1, ran in a Docker rehearsal with a pretend model, a pretend `arecord` and pretend sound devices. Not tested at all: a real microphone, the real model, the real image, and Whisper's real speed and memory on this server, since my workspace has no sound and can't reach Hugging Face. The case against: `base-int8` may not be accurate enough for my voice, the laptop's built-in microphone may not be on its card or may be poor, and a card whose control isn't `Capture`, or whose control has no capture switch, needs `EARS_MIC_CONTROL` or `EARS_MIC_LEVEL=keep`.

## Consequences
- Ears now holds a recording's sound in memory, up to 37.5 seconds' worth (about 1.2 MB), until Whisper has it. Whisper writes each recording to a file in its `/tmp`, which is in memory, and removes it when it's done. Either can be moved to swap if the server uses swap.
- The text stays in ears's state until the next recording ends, or ears stops. A mute doesn't clear it.
- Whisper runs whenever ears does. Its memory is still to be measured, so its limit is 2 GiB for now.
- Starting ears with plain `docker compose up -d ears` gives it no device; with `card` it then won't start, and says how to.
- Jarvis still has no microphone. Push-to-talk and the wake word, which will start recordings, aren't built yet.
