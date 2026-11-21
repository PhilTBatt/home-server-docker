# 0043. After a spoken answer, Jarvis can listen for a follow-up without the wake word

- Date: 2026-11-21
- Status: accepted

## Context
The wake word works (records 0039 and 0042), but saying "Hey Jarvis" before every question gets tiresome in a back-and-forth. Until now only two things could start a recording: `/talk` and the wake word, and never the AI. The voice plan left room for one more, if it was wanted: listening straight after a spoken answer, for a few seconds, started by Jarvis's own code and never by the AI, behind a switch. I asked for it.

## Options considered
What opens the window:
- Jarvis's own code, after he has answered a question I asked with the wake word or as a follow-up (not when the answer failed), once his last sound has played and another half second has passed: chosen. The AI gets no tool for it, and no hub tool can start one. Typed questions and `/talk` ones don't open one, since I'm at the keyboard then.
- Ears opening one by itself after every recording: not chosen. Ears doesn't know when Jarvis has finished speaking, and it would open one even when no chat answered.
- A conversation mode switched on and off by voice: not chosen. It needs another phrase to detect, and it would listen for as long as it's on.

How ears records it:
- `POST /wake/follow?within=<milliseconds>` (1 to 20 seconds): chosen. The recording already belongs to the chat that asked, so nothing has to claim it and it isn't dropped for want of a claim. It ends the way a wake recording does, on loudness or on Silero's detector as `EARS_WAKE_END` says, 1.5 seconds after I stop speaking. Loudness is judged against the room ears measured before the last "Hey Jarvis", because when the window opens ears has only just started listening again after his speech. Nothing at the start is ignored, since there's no "Hey Jarvis" or chime to skip. With no speech within the window, it's dropped without going to Whisper.
- Refused while any chat holds the wake word, because then a Jarvis is still speaking, and refused before ears has heard the room at all, as just after it starts: chosen. The chat shows why.
- A chime when the window opens: not chosen. With nothing ignored at the start, the chime could count as speech. The chat shows a line instead.

How long it stays open, and what stops it:
- `JARVIS_FOLLOW_UP` in `jarvis/.env`: `off`, the default, or a whole number of seconds from 2 to 15. It needs `JARVIS_EARS=wake`, and Jarvis won't start with it set otherwise: chosen.
- Anything typed before the window opens, Enter on an empty line included, or a wake word calls it off, and a follow-up ears starts after that is dropped once the chat gets to it. If asking for one fails, as when ears doesn't answer in time, Jarvis cancels a follow-up ears may have started anyway. While it's open, Enter sends it and anything else typed drops it, as with a wake recording.
- At most 5 follow-ups in a row, then the chat says to say "Hey Jarvis" again: chosen. Silero counts the TV's dialogue as speech, so with the TV on a window could hear the TV, ask Claude about it, answer, and open another, without end. A cap bounds that.

## Decision
With `JARVIS_FOLLOW_UP` set to a number of seconds, once Jarvis has answered a question I spoke, his code asks ears to listen once more for that long without the wake word. What I say is asked like any spoken question, and if I say nothing it's dropped.

## Confidence and the case against
Medium-low. Every part has tests, and a real ears with the pretend microphone was run through it in Docker, but nobody has spoken to it yet, and the window length is a guess. The case against: it's a third way to start a recording without my key or the wake word, so for a few seconds after every spoken answer the microphone is listening for a question, and anything said in that time, the TV included, goes to Claude. The cap limits a runaway, but a false wake from the TV can now cost up to six questions instead of one. The room level comes from before the last "Hey Jarvis", so after several follow-ups it may no longer match the room.

## Consequences
- Ears has a third kind of recording, `follow`, logged as "Recording started to hear a follow-up." and shown as `by: "follow"` in its state.
- The answer log's `heard` gains `follow: true`, with `ender`, and `npm run compare` counts follow-ups beside wake questions.
- An ears built before this answers the new route with 404, and the chat says to start it again with `bash host/ears.sh start`, which rebuilds it.
- `JARVIS_FOLLOW_UP` is on Jarvis's start-up Settings line, and, like `JARVIS_EARS`, isn't logged with each answer.
