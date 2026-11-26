# 0054. A recording can end sooner or later by what I've said so far

- Date: 2026-11-26
- Status: accepted

## Context
A recording after "Hey Jarvis" ends when it's been quiet for a fixed time after I speak (record 0039): 1.5 seconds, or `EARS_WAKE_PAUSE`, which I've raised because he kept cutting me off when I paused to think. A fixed pause is wrong both ways. Long enough to think in, it makes every short question wait. Short enough to feel quick, it cuts off anything with a pause in it. A person knows from the words: "what time is it" is finished, "turn the lights off and" isn't.

## Options considered
How to judge, chosen 26 Nov:
- Rules in code on the words so far: chosen. Instant, free, and they give the AI nothing new.
- A quick AI check when the rules can't tell: chosen, as a second switch.
- A small local model that predicts the end of a turn from the sound: not chosen for now. It's a new model file and more memory on an 8 GB server, for a job the first two may already do.
- Leave it as a fixed pause: not chosen.

Where the words come from: ears turns the recording so far into text while I'm still being recorded, which I said yes to on 26 Nov. Until now nothing was turned into text before a recording ended.

Claude's picks, not discussed:
- Ears looks once per pause, 0.4 seconds after I stop, by sending the recording so far to Whisper. Speaking again calls the look off and forgets what it found.
- The rules: words that end in a full stop, question mark or exclamation mark are finished. Words that end in a comma, a dash, a colon or "...", or whose last word is one of a short list that can't end a thought ("and", "but", "because", "if", "the", "my", "um" and the like), aren't. A greeting or "Jarvis" with nothing after it isn't finished either. Anything else is unsure.
- Finished ends the recording after 0.7 seconds of quiet, or the usual pause if that's shorter. Not finished waits 3.5 seconds, or the usual pause if that's longer. Unsure keeps the usual pause.
- The quick AI check is Jarvis's, not ears's: ears has no internet and no API key. The chat that took the recording asks the fast model already used for chats, with a one-word answer, and gives up after 1.2 seconds. Ears waits up to 1.5 seconds for it, and only when a chat that says it judges is waiting.
- The answer can only be "done" or "more", for the question ears asked about the recording that's running. It can't start, stop or cancel anything.
- When the look's text covers everything I said, ears uses it as the recording's text and doesn't ask Whisper again.
- Both switches default to off: `EARS_TURN_WORDS` in `ears/.env` and `JARVIS_TURN_CHECK` in `jarvis/.env`.
- The words are never logged. The log says how they were judged and how many looks it took.

## Decision
With `EARS_TURN_WORDS=on`, ears reads what I've said so far at each pause and ends the recording sooner when it reads as finished and later when it doesn't; with `JARVIS_TURN_CHECK=on` as well, the chat asks a fast model when the rules can't tell.

## Confidence and the case against
Low to medium (Claude's estimate) until it's been used. The rules rest on Whisper's punctuation, and Whisper is known to put a full stop on speech that was cut off, which would make an unfinished sentence read as finished and end it at 0.7 seconds: worse than today. Nothing here was tried against the real Whisper or my voice. Each look is a whole Whisper run on the laptop's CPU, so a look that's still running when I carry on may hold up the next one, and the final text. With the AI check on, words I've said go to Anthropic 0.4 seconds into a pause, before the recording has ended and even if I then cancel it; without it they'd go only as the question. The check also costs a small API call per unsure pause. The case against is the small turn-detection model: it judges from how I sound, not from punctuation, and it's what voice assistants built for this use.

## Consequences
- A finished question can be answered about a second or two sooner, and a pause mid-sentence gets longer to finish.
- `EARS_WAKE_PAUSE` becomes the pause for when the words don't settle it, so it can stay long.
- Ears now turns sound into text during a recording, not only after it. The text still lives only in memory.
- Ears's API has one more route, `POST /wake/turn`, and its view can carry the words so far while a question is waiting, to anything that holds `EARS_TOKEN`.
- A wrong "finished" cuts me off sooner than before. `bash host/ears.sh wake-report` and the log's "Judged by your words" lines are how to tell.
- Follow-ups (record 0043) and the talk button (record 0045) are judged the same way. `/talk` recordings aren't: they end when I press Enter.
