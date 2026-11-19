# 0025. Jarvis can finish his sentence when he's interrupted, and ignores an Enter pressed early

- Date: 2026-11-19
- Status: accepted

## Context
Record 0023 had a new question or an empty line stop his speech at once, and kept an Enter pressed while an answer was still being written, to act on once the prompt was back. On the server, with real timings, that went wrong. His first sound came 3.5 to 6 seconds after the question, well after the text was done, so an Enter pressed while waiting hushed him before he'd said a word. 7 of the 17 answers in the first log with the voice on had no sound, most likely for that reason. Nothing on screen said so, and Phil said it seemed like he'd stopped working. Phil couldn't choose between stopping at once and finishing the sentence, and asked for both behind a switch. ChatGPT's review of record 0023 also pointed out that the player was only ever asked politely to stop.

## Options considered
What a new question or an empty line does while he's talking:
- Behind a switch, `JARVIS_SPEECH_STOP`: `now`, the default, stops at once as before; `sentence` lets the sentence that's playing finish and says nothing after it: chosen. Phil asked for both, and the log can show their times side by side.
- Only stopping at once: not chosen. Being cut off mid-word is what may sound wrong, and that can only be judged by ear.
- Only finishing the sentence: not chosen. A long sentence would keep talking after being asked to stop.
- Carrying on until the new answer is ready to speak, then switching: not chosen. If you typed to shut him up, he'd carry on for seconds.

With `sentence`, when the new question is sent:
- Straight away, with the new answer's first sound waiting until the last sentence is over: chosen. The new answer's words and its speech aren't held up by the end of the old one.
- Once the sentence is over: not chosen. Every interruption would hold the new question back by the rest of a sentence, a few seconds.

Saying what happened:
- A note when a new question or an empty line interrupts him: `(stopped talking)`, `(the last answer won't be spoken)` if no sound had reached the player yet, or `(stopping after this sentence)`: chosen. A hush that leaves nothing on screen looks like a fault.
- No note for `new`, `exit`, Ctrl+C or a failed answer: chosen. What stopped him is already plain.

An empty line typed before the prompt is back:
- Ignored: chosen. It's most often an Enter pressed while waiting, and with speech starting seconds after the text, keeping it hushed him before he started. Each line is stamped with how many prompts had been shown when it was typed, and one typed before the prompt it's read at is early.
- Kept and acted on, as before: not chosen, for the reason above.
- Ignoring any line typed early, questions too: not chosen. A question typed ahead is still meant to be asked.

Stopping the player:
- Asking `aplay` to stop, then killing it outright if it hasn't ended 2 seconds later: chosen. `aplay`'s own code stops on the first request, but a player that never ended would keep the chat from closing, since Node waits for it.
- Asking only: not chosen, for that reason.
- Killing outright at once: not chosen. `aplay` gets no chance to let go of the sound card cleanly.

## Decision
`JARVIS_SPEECH_STOP` decides what a new question or an empty line does while he's talking: `now` (the default) stops at once, and `sentence` lets the sentence that's playing finish. Either way a note says so unless he was already on his last sentence, an empty line typed before the prompt is back is ignored, and a stopped `aplay` is killed outright if it hasn't ended 2 seconds after being asked.

## Confidence and the case against
Medium (Claude's estimate) that this fixes what Phil ran into; which setting sounds better is for his ears. The case against:
- With `sentence`, the new answer's first sound can be held back by the rest of the old sentence, so its time to first sound goes up when he's interrupted mid-sentence.
- An empty line typed early because you really did want him to stop is ignored; a second Enter once the prompt is back does it.
- The 2 seconds is a guess, and a stuck `aplay` hasn't been seen.
- The note is one more line on screen after every interruption.

## Consequences
- With `JARVIS_VOICE` off or missing, Jarvis runs as he did. His settings line gains `JARVIS_SPEECH_STOP`, and a wrong value for it stops him, like his other settings.
- An answer's speech is numbered against its answer when it's handed to the log, straight after the answer's own line, not when the speech ends. So with `sentence` an old answer's speech line can be written after the next answer's line and still land against its own answer, and nothing waits for the old sentence: not the prompt, and not Ctrl+C.
- A second empty line, or a new question, while a sentence is finishing leaves it to finish, and any later answer's sound waits for every sentence still finishing; `new`, `exit` and Ctrl+C cut them all short.
- An interruption during an answer's last sentence, with nothing after it, isn't counted as a stop and gets no note, because nothing is cut.
- A finishing sentence that can't be played counts as a failure in the log, like any other, but gets no note: its speech's notes were shown when it was interrupted.
- The old speech's notes are shown when it's interrupted, from what had happened by then.
- Older lines in the log have no `JARVIS_SPEECH_STOP`, so `npm run compare` counts them as `now`, though an early Enter still hushed him then.
