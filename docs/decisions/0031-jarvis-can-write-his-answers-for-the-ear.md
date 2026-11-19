# 0031. Jarvis can write his answers for the ear

- Date: 2026-11-19
- Status: accepted

## Context
Since record 0023 Jarvis speaks his answers a sentence at a time, but he writes them for the screen. On the server, his answers opened with a 23-word sentence, and since Kokoro takes about 0.37 s of work per second of speech, his first sound came 3.5 to 6 seconds after the question. The speech filter also guesses: a path dropped mid-sentence leaves a hole, and a command in code marks is read out. Phil chose to build writing for the ear next, behind a switch like his other settings, with the written answer allowed to change too, and paths and code kept in code marks.

## Options considered
How he's asked to write for the ear:
- A paragraph added to his instructions when his voice is on, behind `JARVIS_SPOKEN_STYLE` (`off` by default): chosen. Every other setting has a switch, and `compare` can only compare the two if both exist.
- A separate spoken answer beside the written one, suggested by ChatGPT: not chosen. It's a second request for every answer, so slower and about twice the cost; Phil said it had too many downsides.
- Always on with the voice, no switch: not chosen, for the reason above.

Paths, commands and code:
- In code marks, shown on screen and not spoken, with no sentence needing them to make sense: chosen, Phil's pick.
- Left out of the answer with the voice on: not chosen. The screen would lose them.
- Read out as they are, apart from the paths the filter already skips: not chosen. A long command is hard to follow by ear.

What the speech filter does with code marks:
- Skips what's inside them only with the spoken style on: chosen, Phil's pick. His instructions then say no sentence depends on them.
- Always skips them: not chosen. With the style off, answers can lean on a command mid-sentence, and skipping it would leave a hole.
- Leaves the filter as it is: not chosen. Short commands and setting names would still be read out.

## Decision
`JARVIS_SPOKEN_STYLE=on`, with his voice on, adds a paragraph to his instructions asking him to write for the ear, and makes the speech filter skip anything in code marks that opens and closes on one line. It's `off` by default.

## Confidence and the case against
Medium (Claude's estimate) that shorter opening sentences bring his first sound forward and sound more natural; `compare` and Phil's ears will tell. The case against:
- Instructions are a request, not a rule. He may still open with a long sentence, or build a sentence around a command, which then has a hole in it.
- The written answer gets plainer too, which may be worse to read.
- Numbers and units written the way they're said can look odd on screen.

## Consequences
- With `JARVIS_SPOKEN_STYLE` off or missing, or his voice off or unable to start, his instructions are exactly as they were.
- His settings line gains `JARVIS_SPOKEN_STYLE`, and a wrong value stops him, like his other settings.
- An answer's log line gains `spokenStyle`, only with the voice on. Older lines count as `off` in `compare`, which names the two "usual style" and "written for the ear" when both are in the log.
- The paragraph has no double quotes, since the Agent SDK's request escapes them, and a test checks it.
- The paragraph asks him to use plain words when he says what he's about to check before reading a file, or suggests a new chat, since his other instructions ask for both and code marks there would leave a hole.
- Code spans are found the way Markdown finds them within a line, with the same pattern in the sentence splitter and the speech filter, so a sentence end inside code marks doesn't split the code. A stray backtick pairs with the next one, as Markdown would, so what's between them isn't spoken either.
- While a line is still arriving, a backtick that hasn't been closed yet holds the rest of that line, so that speech waits for the line to end.
- Code marks left open, or code that runs over a line or past the 400-character cut, are still read out, with the marks taken off.
