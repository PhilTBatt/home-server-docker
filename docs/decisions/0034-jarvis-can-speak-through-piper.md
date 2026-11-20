# 0034. Jarvis can speak through Piper, a second engine behind the same setting

- Date: 2026-11-20
- Status: accepted

## Context
Record 0020 made Kokoro Jarvis's first voice and put Piper second, as the speed baseline: smaller and faster, but flatter-sounding, and it speaks the Wyoming protocol, which needed a client written first. That client is `wyoming.ts` and `wyoming-client.ts`. Phil hears Kokoro as a bit robotic, and chose on 20 Nov to add Piper so the two can be heard and timed side by side. Six things needed deciding: which image, which voice, how the voice gets onto the server, how Jarvis talks to Piper, how he knows the sound's rate, and how the service is limited.

## Options considered
Which image:
- `rhasspy/wyoming-piper`, the image its own project publishes, pinned by version and digest: chosen. Its newest tag on Docker Hub is 2.5.2, from 11 Sep 2026. The Python package has reached 2.5.4 since, without an image yet.
- Building an image from the Python package: not chosen. One more Dockerfile to keep up to date, for no gain today.
- Piper inside Jarvis's own container: not chosen. Its packages are built for glibc, and Jarvis's image is Alpine, which uses musl; it would also mix a speech engine into the chat's container.

Which voice:
- `en_GB-alan-medium`, a British male voice, as the default of a new `JARVIS_PIPER_VOICE`: chosen by Phil.
- `en_GB-northern_english_male-medium`, or choosing after hearing samples: not chosen. Either can still be set in `JARVIS_PIPER_VOICE`.

How the voice gets onto the server:
- A one-off download, `bash host/jarvis.sh piper-voice`, into `piper/voices`, which git ignores and Piper reads read-only: chosen. Piper then needs nothing from the internet. The download checks that each file isn't empty and that the voice's settings give the rate Jarvis will play it at, and saves nothing unless all three files arrive. The voice's `MODEL_CARD` is saved beside it as `<voice>.MODEL_CARD`, because it's the only place its licence is written down.
- Downloading by hand: not chosen. Three files to name and place exactly.
- Letting Piper download it itself: not chosen. It would need the internet on the `speech` network, which records 0020 and 0024 close.
- Building the voice into an image: not chosen. One more image, for files that don't change.

How Jarvis talks to Piper:
- One Wyoming `synthesize` request per piece, through the same speech queue as Kokoro, each on a connection of its own that's closed once its sound is back: chosen. Bundling, stopping and `npm run compare` work as they do for Kokoro, so the two compare fairly. A new connection on the same Docker network costs a few milliseconds. One difference: wyoming-piper splits each piece into sentences itself and makes them one at a time, with no gap between them (its `handler.py`), so for Piper bundling saves requests and players but doesn't give it longer pieces to work on, as it does Kokoro (record 0033).
- Wyoming's text streaming (`synthesize-start`, `-chunk`, `-stop`): not chosen. Piper, not Jarvis's queue, would decide when each sentence is made, so stopping and the counts in `npm run compare` wouldn't work as they do for Kokoro, and it's more new code.
- One connection kept open for the whole chat: not chosen. Piper drops the connection after any error anyway, so reconnecting would be needed as well.

How he knows the sound's rate:
- From the voice's quality, as Piper's training notes give it (low 16,000 Hz, medium and high 22,050 Hz; x_low taken to be 16,000 Hz like low), checked against what Piper sends with every piece and against the voice's settings when it's downloaded: chosen. The player has to be told the rate before the sound plays.
- Learning it from the first sound: not chosen. The rate is read before that, and a rate that can change part-way is harder to reason about.
- Reading the voice's settings file: not chosen. Jarvis's container doesn't have the voices folder, and shouldn't need it.

How the service is limited:
- In its own `piper` profile, on the internal, isolated `speech` network only, with no published port, the voices folder read-only, a 1 GiB memory limit, and the image's own health check run at Kokoro's timings: chosen, like Kokoro. `host/jarvis.sh` starts it before a chat with `JARVIS_VOICE=piper` and stops it afterwards, unless it was already running.

## Decision
`JARVIS_VOICE=piper` speaks through a new `piper` service: `rhasspy/wyoming-piper`, pinned by version and digest, given the voice named by `JARVIS_PIPER_VOICE` (default `en_GB-alan-medium`) from the git-ignored `piper/voices`, read-only. `bash host/jarvis.sh piper-voice` downloads that voice once. Jarvis's `piper.ts` sends each piece as one `synthesize` request on its own connection and checks the sound is 16-bit mono at the rate the voice's quality gives.

## Confidence and the case against
Medium (Claude's estimate). Jarvis's side was tested against stand-ins and against wyoming-piper 2.5.2's own code, installed from its Python package and run in Docker on an internal network with Piper's silent test voice and the voices folder read-only. It hasn't run on this server, with the real image or with the alan voice. The case against:
- The voice's licence isn't clear. Its `MODEL_CARD` says it was fine-tuned from Piper's lessac voice, whose recordings are licensed for "research and exploration of speech technologies" only, with no commercial use (https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html). Its own recordings point to Mycroft's mimic3 voice `apope`, whose licence file reads "Copyright 2022 Mycroft AI, All Rights Reserved" (https://github.com/MycroftAI/mimic3-voices/tree/master/voices/en_UK/apope_low). Piper's own notes say they take no position on this (https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md). Here it's used at home, on one machine, and the voice is never in this repo; that isn't legal advice.
- The image is two releases behind the Python package.
- 1 GiB is a guess, not a measurement on this server.
- The rate rule is a convention in Piper's training notes, not something Piper enforces. A voice that breaks it is refused when it's downloaded and on every piece, with a message saying so, rather than played at the wrong speed.
- Kokoro and Piper now share `speech`, so each could reach the other's API. Neither has a reason to.

## Consequences
- With `JARVIS_VOICE=piper` and the voice not downloaded, `host/jarvis.sh` stops before building or starting anything and says to run `bash host/jarvis.sh piper-voice`.
- `JARVIS_PIPER_VOICE` is checked every time Jarvis starts, voice or not, like his other settings, and `host/jarvis.sh` checks it the same way before using it in a file name or a web address. `host/jarvis.test.sh` keeps the two patterns, the default and the rate rule in step.
- Piper's Wyoming port has no login, so anything on `speech` can use it. Joining `speech` stays security-sensitive.
- Piper only logs the words it speaks with `--debug`, so that flag isn't used.
- Piper can't reach the internet, so it can't fetch a voice that's missing. Asked for one, wyoming-piper 2.5.2 tries to download it into its read-only folder and fails with "Read-only file system", which is the reason Jarvis's `Voice:` line then gives; started with `--voice` naming a missing voice, it stops at once. `host/jarvis.sh` checks the voice's files are there before starting Piper, so this only happens when Piper is started by hand, or the files go while it runs.
- Jarvis's check asks Piper to describe itself and looks for the voice's name, but Piper lists every voice in its catalogue whether it's downloaded or not, so the check only catches a name that isn't in the catalogue. A missing voice shows up as the start-up sentence failing.
- The image runs as root inside its container. It has no port, no internet, no devices and only its voices folder, read-only. Running it as another user, or with Docker's other restrictions, wasn't tried.
- `npm run compare` names the setting "Piper voice", and its requests line names Piper.
- `JARVIS_KOKORO_SPEED` and `JARVIS_KOKORO_VOICE` don't touch Piper.
- Piper is in a profile, so `docker compose up -d` and `host/hub-update.sh` never start or update it. A newer version means changing its tag and digest together.
- Licences: wyoming-piper is MIT and the Piper engine it runs is GPL-3.0-or-later; running them isn't distributing them. Nothing from either is copied into this repo. A voice's licence is in its `MODEL_CARD`.
