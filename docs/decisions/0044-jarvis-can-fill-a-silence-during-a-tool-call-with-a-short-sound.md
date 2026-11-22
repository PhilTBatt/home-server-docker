# 0044. Jarvis can fill a silence during a tool call with a short sound

- Date: 2026-11-21
- Status: accepted

## Context
When Jarvis uses a tool in the middle of a spoken answer, such as reading a file from the brain, there can be a silence while it runs. What he says before a tool is sent to be spoken as soon as the tool starts, so it plays while the tool runs, and the silence only comes when he says nothing first, or when the tool outlasts what he said. The voice plan's rule for a filler: only after a real wait, once per tool call, and never if the answer is already there. My numbers on 19 Nov said it wasn't needed yet; I asked for it on 21 Nov to try.

## Options considered
What fills it:
- A short sound made in code, like the wake word's chime: chosen. Two short low notes (440 Hz, 70 ms each, 90 ms apart), so it can't be taken for the chime's two rising ones. It needs nothing from Kokoro or Piper, plays at once, and can't be mistaken for the start of an answer. Claude picked the notes.
- A phrase like "One moment", made once when he starts: not chosen for now. It needs the speech engine at start-up, it sounds like the answer starting, and the same phrase on every tool call would get tiresome.

When it plays:
- Once his speech has been quiet for 1.2 seconds after a tool starts, checked every tenth of a second: chosen. Quiet means no sentence playing, being made or waiting to play, the last answer's speech finished, and the last sound's player (a sentence's, the chime's or the filler's own) ended. The wait counts from when he goes quiet, not from when the tool starts, so it never plays over what he says before the tool. 1.2 seconds is Claude's pick, so that no silence runs much past the plan's 1.5 seconds; it wasn't measured.
- At most once per tool call: chosen, as the plan's rule says. A tool that starts before the last one's filler played starts the wait again, and a tool after a filler can have its own.
- Never once words come back, a yes-or-no question or a note marks a gap, or the answer ends, finishes or is stopped: chosen. A stop also cuts off a filler that's playing; an answer that ends normally lets it finish.
- Not after a hub action, which asks me yes or no first, and not once his speech has been given up after two failures, since the wake word is no longer held then: chosen.

The switch and the log:
- `JARVIS_FILLER`, `off` by default: chosen, like every other setting, so it can be tried and turned off again.
- Logging fillers with each answer: not chosen. A filler doesn't change any time the answer log measures. The speech line's longest silence is still between sentences.

## Decision
With `JARVIS_FILLER=on` and his voice on, a quiet of 1.2 seconds after a tool starts plays two short low notes, at most once per tool call.

## Confidence and the case against
Medium-low (Claude's estimate). Every part has tests, but nobody has heard it yet, and the wait and the notes are guesses. The case against: most tool calls are short, so it may play when the answer was about to come anyway, and a sound that means "still working" can be more irritating than a silence. A phrase might sound more natural than a beep.

## Consequences
- An answer's speech isn't over until its filler has played, so the hold on the wake word covers it, ears doesn't hear it, and the next answer's speech waits for it.
- `JARVIS_FILLER` is on Jarvis's start-up Settings line and, like `JARVIS_FOLLOW_UP`, isn't logged with each answer.
- Changing the wait or the notes is a code change.
