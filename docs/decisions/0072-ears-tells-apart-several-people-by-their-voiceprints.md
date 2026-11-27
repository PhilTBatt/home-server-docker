# 0072. Ears tells several people apart by their voiceprints, and lets guests through on request

- Date: 2026-11-27
- Status: accepted

## Context
Ears can score a recording against one voiceprint, mine (record 0056), and with `EARS_VOICE_ID=require` it drops a wake-word recording in any other voice. I wanted Jarvis to keep track of different people. By default he answers everyone as now, and guest mode is what limits people, so ears has to say who it heard rather than only whether it was me, and `require` mustn't shut out a guest while Jarvis is in guest mode. This record is the ears side; what Jarvis does with who's speaking is its own piece of work.

## Options considered
Chosen 27 Nov (Phil): "deffo add voice id in too that's great if it can keep track of different people", and "by default he answers everyone as now; guest mode is what limits people".

Claude's picks, not discussed:
- One voiceprint file per person, `ears/voice/<name>.json`, names 1 to 20 of a to z, 0 to 9 and -, made the same way as mine (`bash host/ears.sh voice-enrol <name>`), beside the existing `voiceprint.json`, which stays the owner's so nothing changes for a setup that has only that. `EARS_VOICE_OWNER` can name another file as the owner's. Not one file holding everyone: a person can then be deleted without touching anyone else's.
- Every recording is scored against every voiceprint (one pass through the model, then a cosine for each, which costs next to nothing), and the best score at or above `EARS_VOICE_ID_THRESHOLD` is who it was; under it, nobody. One threshold for everyone, not one each: there's nothing yet to set them from. At most 20 voiceprints, and ears won't start without the owner's or with one it can't read, as before.
- What Jarvis gets: `voice: { who, owner, score }` in the recording's result, only with `observe` or `require` and only when it was scored; never the numbers. `who` is the file's name, so the owner's default is `voiceprint`.
- `require` now blocks only a voice that matches none of the voiceprints. Recordings started by hand still always get through, as in record 0056.
- `POST /wake/guests?on=1|0`, behind ears's token, lets every voice through while on, still scored and reported, and shows as `wake.guests` in ears's view. Off at every start, so a restart can't leave the door open. Only Jarvis's code should set it, as his guest mode starts and ends. With guests on, the words-at-a-pause check (record 0054) reads anyone's words too.
- `voice-list` (names, dates, clip counts, the owner marked), `voice-forget <name>` (a terminal and a y/N first, plain names only), and `voice-check` listing every voiceprint and naming the best match.
- `wake-report` counts recordings per name and for nobody, each with its range of scores, and how many guests let through.
- Claude Code is denied reading `ears/voice/`.
- No new package, model or container: the same model and code as record 0056.

Jarvis's side (Claude's picks, not discussed):
- `JARVIS_VOICES`, `off` or `on`: he reads `last.voice` and shows it under what I said; the answer log gets `owner`, `known` or `unknown`, never the name.
- Only my voice (`owner: true`) can end guest mode by voice, or change modes while in it. He tells the hub `by: owner`, which the hub accepts, while `by: voice` still can't end guest mode.
- While he's in guest mode he turns on `POST /wake/guests`, and turns it off when guest mode ends, when he starts, and when he ends in guest mode, so the door can't stay open after him (if he's stopped so hard that he can't, his next start shuts it).
- `JARVIS_OTHER_VOICES` for a voice that isn't mine: `answer` (the default, my choice: "he can always respond to people"), `name` (Claude is told who asked, so the name goes to Anthropic with the question), or `guest` (a voice no voiceprint matches puts him in guest mode first, before its words can do anything else, then he answers it there).

## Decision
Ears scores each recording against every voiceprint in `ears/voice/` and reports who it was, or nobody, with the best score; `require` blocks only voices that match none; and a guests switch on ears's API lets every voice through while Jarvis is in guest mode.

## Confidence and the case against
Medium for the code, which is tested with stand-in voices and checked by breaking it on purpose; low for how well it tells real people apart, which record 0056 already said hasn't been tried with my voice, my room or my microphone, let alone with family voices that may sound alike. The case against: a voiceprint is biometric data, and keeping them for other people on a home server raises the stakes of a leak and needs their agreement; one shared threshold that suits me may confuse two similar voices, and a match only says the voice is closer to that voiceprint than the threshold, not that it's that person; and the guests switch is an open door that something other than Jarvis, with ears's token, could also open.

## Consequences
- `EARS_VOICE_OWNER` is a new optional setting in `ears/.env`.
- `ears/voice/` can hold several people's voiceprints: keep them only with their agreement, and delete them with `voice-forget`. Older backups keep a deleted one until they're removed.
- Ears's view gains `last.voice` and `wake.guests`, and its API `POST /wake/guests`, for Jarvis's side to use.
- The log's voice lines changed wording, so anything reading them besides `wake-report` needs updating.
