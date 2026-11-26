# 0055. I can interrupt Jarvis while he's speaking

- Date: 2026-11-26
- Status: accepted

## Context
While any chat is thinking or speaking, ears hears nothing: each chat holds the wake word until its last sound has played (records 0039 and 0040). That's there because his voice comes out of the laptop's speakers, next to its microphone, so he'd wake himself or record himself. It also means I can't stop a long answer, or correct him, without going to the keyboard. A person can be interrupted.

## Options considered
How to interrupt, chosen 26 Nov:
- "Hey Jarvis" only: the wake word still works while he speaks. Chosen, as one mode.
- Any speech from me: speaking over him stops him. Chosen, as a second mode.
- Both, switchable, off by default: chosen.
- Leave it, and use the keyboard: not chosen.

I also agreed on 26 Nov to change the rule that ears never listens while he speaks, for this.

Claude's picks, not discussed:
- One switch, in ears: `EARS_INTERRUPT=off|wake|speech`. Ears owns the microphone, so it decides. Jarvis has no switch of his own: he reads the mode from ears's view.
- With `wake`, only openWakeWord hears the microphone during a hold. The recording a wake word starts there has nothing from before the wake word in it and gets silence until half a second after the last chat lets go, and so does one started by a wake word heard in that half second, so neither his voice nor its echo is recorded or sent to Whisper. The cost is that what I say before then is lost.
- With `speech`, 0.3 seconds of sound louder than speech in the room during a hold also starts a recording, with at least the half second before it and the real sound throughout. That's only right for a microphone that doesn't hear him.
- The room's level isn't measured while he speaks, so his voice never becomes "the room".
- The chat that's speaking takes the recording at once, though it's busy. His code stops the speech as soon as it reads the event, not when the chat gets to it. The answer he was giving still finishes writing on screen, silently, before my new question is asked: a question can't be called off part-way yet.
- A speaking chat that doesn't get the recording stops too.
- No chime on a cut-in.
- The talk button works while he speaks when interrupting is on. Follow-ups don't change.
- A recording started by speech is logged and counted as a wake-word recording, with a line before it saying it was speech.

## Decision
With `EARS_INTERRUPT=wake`, "Hey Jarvis" stops him mid-answer and takes what I say next; with `speech`, any speech over him does. It's off by default.

## Confidence and the case against
Medium for `wake`, low for `speech` (Claude's estimates). Nothing was tried with real sound. Whether openWakeWord hears "Hey Jarvis" over his own voice coming from speakers beside the microphone isn't known. `speech` can't work on the laptop at all: his voice is the loudest thing its microphone hears, so he'd interrupt himself at once. It needs the speakerphone, with him playing through it so it can cancel his voice, and that wasn't checked either. In `speech` mode a recording can start with no wake word, from the TV or anyone talking while he speaks, and it's asked as a question. The old answer isn't called off, so it's still paid for and still has to finish before the new question starts. The case against is the talk button: it already exists, it's exact, and with this change it works while he speaks.

## Consequences
- The rule from records 0039 and 0040 becomes: ears hears nothing while he speaks unless `EARS_INTERRUPT` says so.
- What can start a recording grows by one in `speech` mode: sound over his voice. The AI still has no tool for it.
- If his own answer has "Hey Jarvis" in it, he can interrupt himself.
- With `wake`, what I say after "Hey Jarvis" is lost until half a second after he stops.
- Calling off the answer in progress would be its own decision.
