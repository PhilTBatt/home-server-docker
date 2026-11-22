# 0045. A talk button reaches ears through a command on the server

- Date: 2026-11-22
- Status: accepted

## Context
Push-to-talk works in the chat as `/talk`, then Enter on an empty line (0038). I want it ready for a switch or a button, like a Stream Deck key later, so I can start a question without typing or saying "Hey Jarvis". A button lives outside the chat, and ears has no published port and is reachable only from Jarvis's network (rule R8), so a press needs a way in.

## Options considered
How a press reaches ears:
- A command on the server, `bash host/ears.sh talk`, which runs ears's own helper inside ears with `docker compose exec`: chosen. A button runs it over SSH from another computer, or on the server itself. Nothing new can reach ears, and it needs only what already runs ears.
- A route on the hub's API, for a button on the hub page on my phone: not chosen. The hub would need a path to ears and ears's token, which breaks rule R8, and anyone past the hub's login could start the server's microphone.
- Both: not chosen, for the same reason.

What a press starts:
- A recording ears starts itself and a waiting chat takes, like the wake word's: chosen. Jarvis's `/talk` code stays as it is, and the chat that takes it chimes and answers as it does after "Hey Jarvis".
- A recording that belongs to one chat: not chosen. A command on the server can't know which chat is open.

How it ends:
- When I stop talking, like a wake recording, and a second press sends it at once: chosen.
- Only on a second press: not chosen. It always takes two presses.
- Separate start and stop commands, for holding a button: not chosen. Claude wasn't sure a Stream Deck can run one thing on press and another on release without a plugin.

Claude's picks, not discussed:
- It's judged like a wake recording, the first 0.8 seconds ignored for the chime, against the room's level from up to the last 3 seconds ears heard, or the last level it measured if it has heard less than a second since it last started listening. None of the sound from before the press is kept.
- A press while Jarvis is speaking is refused, as the wake word is held then (rule R11). A second press before a chat has taken the recording is refused, so it can't be sent to no one, and one before it has heard speech just says it's listening, so a double press or the chime isn't sent to Whisper. A press while ears is already listening after "Hey Jarvis" or for a follow-up is refused, saying to just speak, so a press can't send a recording before I've said anything. A press during `/talk`'s own recording is refused by ears.
- It needs `EARS_WAKE=on` and a chat with `JARVIS_EARS=wake`, because that's how a chat waits on ears. The command waits until a chat has taken the recording, so it only says it's listening when one has, and says so when none did.
- The log, `wake-report` and `npm run compare` count talk-button recordings apart from wake ones.

## Decision
`bash host/ears.sh talk` starts a recording a waiting wake chat takes, judged like a wake recording, and pressing again sends it.

## Confidence and the case against
Medium (Claude's estimate). Every part has tests and a rehearsal in Docker, but nobody has pressed it on the server yet. The case against: over SSH a press reaches ears a second or two late (Claude's guess, not measured), and a button on my phone would be handier than SSH. A refused press only says why on the screen that ran it, which a Stream Deck doesn't show.

## Consequences
- Rule R1's "Phil's push-to-talk key" now includes this command. Jarvis's AI still has no tool that starts a recording. CLAUDE.md tells Claude Code never to run it, as with `mic-test`, but only a deny rule would stop it, and that's still mine to decide.
- Anything that can run commands on the server as me can start the microphone with it, as it already could with `docker compose exec`.
- A button on the hub page would need its own decision.
