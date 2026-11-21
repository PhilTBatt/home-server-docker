# 0038. Jarvis takes spoken questions through ears with /talk

- Date: 2026-11-20
- Status: accepted; with `JARVIS_EARS=wake`, "Hey Jarvis" starts a recording too, and the log's `heard` marks those with `wake` (0039)

## Context
Ears records from a real microphone and Whisper turns each recording into text (record 0037), but nothing used the text. Jarvis needed a way for me to speak a question instead of typing it. His chat reads whole lines, an empty Enter already stops him talking (record 0023), and a terminal doesn't say when a key is let go, so it had to be press to start and press again to send (rule R3). The first test on 20 Nov showed the laptop's built-in microphone works through card 1. I'll want a talk button on the Stream Deck later, beside the wake word, so the way I start a recording now shouldn't be the only way there can be.

## Options considered
How I start and send:
- Typing `/talk`, then pressing Enter on an empty line to send what I said: chosen, my pick on 20 Nov. It fits the way the chat already reads lines. While he's listening he isn't talking, so an empty Enter can only mean send.
- One key with no Enter, read straight from the keyboard: not now. Terminals send different codes for the same key (VS Code's terminal, and Windows Terminal over SSH), and reading raw keys beside readline is more to get wrong. Kept open: what starts and sends a recording (`talk.ts`) is separate from what triggers it in the chat, so a key or a Stream Deck button can drive the same thing later.
- An empty Enter at the prompt starting a recording: not chosen. One stray Enter would switch the microphone on.

How Jarvis reaches ears:
- Jarvis joins ears's network only through `docker-compose.talk.yaml`, which `bash host/jarvis.sh` adds only with `JARVIS_EARS=push`, and is given `EARS_TOKEN` from `ears/.env` by name, never on a command line: chosen. With `JARVIS_EARS=off` he isn't on the network and has no token. The Agent SDK's environment never gets the token, as it never gets the hub's.
- Having `bash host/jarvis.sh` start ears, the way it starts Kokoro: not chosen. Ears always starts muted and is started and unmuted on purpose with its own script (rule R2), and Whisper used 456 MiB after one recording on 20 Nov. Jarvis's start-up line says whether ears is ready, muted or out of reach.

A recording I don't send:
- Anything typed while he's listening cancels it with ears's new `POST /recording/cancel`, which ends it without sending it to Whisper, and then the line is taken as usual: chosen. If it had already ended at its 30-second limit and been turned into text, the cancel clears that text instead. If ears doesn't answer a start or a stop, Jarvis cancels anyway, in case it went through. Before this, only a mute or a new unmute ended a recording without text.
- Stopping it and throwing the text away: not chosen. Whisper would still turn something I meant to drop into text.

Him talking while I speak:
- `/talk` stops his speech at once before it listens, even with `JARVIS_SPEECH_STOP=sentence`: chosen. The microphone and the speakers are on the same card, so finishing his sentence would put him into my recording (rule R11).

Text that's already been made:
- A mute clears it from ears's state, and says it was cleared by a mute: chosen. I said probably, on 20 Nov. Jarvis takes the text from ears as soon as it's made, so keeping it there after a mute served nothing.
- Keeping it until the next recording ends: not chosen.

## Decision
With `JARVIS_EARS=push`, typing `/talk` stops him talking and asks ears to record; Enter on an empty line stops the recording, waits for Whisper's text, shows it as "You said:" and asks it like a typed question; anything else typed drops the recording. Jarvis reaches ears only through `docker-compose.talk.yaml`, with its token, and a mute clears any text ears holds.

## Confidence and the case against
High that the rules hold: the chat, the talk part, ears's client and ears's cancel each have their own tests, and a Docker rehearsal ran the real script, Jarvis and ears with a stand-in Whisper and a stand-in for Anthropic's API. The case against: typing six characters isn't really push-to-talk, and a single key is what a Stream Deck button would send most simply. Also, Jarvis's code can now start a recording. The AI still has no tool for it, a recording only starts from a line I type, and the mute switch still wins, but it's one more thing that can switch the microphone on.

## Consequences
- The answer log keeps, for a spoken question, how long was recorded and how long the text took after Enter (`heard`), never the words. `npm run compare` gives them their own line.
- On ears's network Jarvis can also reach Whisper directly. Whisper has no token, but all it can do is turn sound into text.
- A recording that reaches its 30-second limit while he's listening is still sent when I press Enter, once Whisper has it. Jarvis waits while ears is still ending a recording or Whisper is working, so it never takes an earlier recording's text for this one.
- Once asked, a spoken question is like a typed one: it goes to Anthropic's API, and with `JARVIS_CHATS=resume` it's saved with the chat in `jarvis/data/chats/`. Only the answer log leaves the words out.
- For the Stream Deck button and the wake word, either the button types into the terminal, or ears starts the recording itself and Jarvis picks up the text. The wake word will need the second, so the button probably will too. That's for its own decision.
