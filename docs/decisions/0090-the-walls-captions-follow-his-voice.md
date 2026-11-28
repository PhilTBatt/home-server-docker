# 0090. The wall's captions follow his voice

- Date: 2026-11-28
- Status: accepted

## Context
On the wall (record 0081) Jarvis's words were sent as Claude wrote them, the last 600 characters, and the page showed as many whole sentences from the end as fit, for 10 seconds. So the caption ran ahead of his voice, and a long answer's beginning never showed. Phil saw it on the TV: "he does only show the end of a speech".

## Options considered
Chosen by Phil (27 Nov, option A): Jarvis tells the hub each sentence, or bundled piece, as it starts playing, so the caption runs with his voice like subtitles, beginning first. Not chosen: B, the page scrolling through the whole answer, out of step with his voice; C, leaving it. On 28 Nov Phil added: keep the last caption up until the next sentence starts, and split a piece too long to fit into parts timed across its speech.

Claude's picks, not discussed:
- A caption is at most 160 characters. A longer piece is split at its sentences first, then at commas, semicolons, colons and dashes, then between words, and a word longer than that is cut. Each part comes in at its share of the piece's playing time, by how many characters it has.
- Only Jarvis changes how captions are made: the speech queue hands each piece's text to the player, and `playOnWall` passes it on as the piece starts. The hub keeps what it's sent as before. The page changes only how long the last caption stays: while he's still speaking, and for 6 seconds after, or 10 seconds after it came if that's longer.
- A piece's later parts are dropped when his speech is stopped part-way or the piece fails to play, and when a new question is heard or a new answer starts, so the wall never shows words he didn't say.
- With his voice off, the wall shows the answer as it's written, as before; with it on and nothing of an answer spoken, it shows the answer once it's done, so an answer is never lost from the wall.
- It's for questions said out loud only, as before: typed and phone answers still show him working and never their words.

## Decision
With his voice on, the wall shows each sentence as he starts saying it, split into timed parts when it's too long, and keeps the last one up until the next starts.

## Confidence and the case against
Moderate. The case against: a part's timing is a guess from its length, so on a long piece the caption can drift a little ahead of or behind his voice. Bundled pieces (`JARVIS_SPEECH_BUNDLE`) are long, so they're split more often. And the wall now relies on the speech queue's timing, which is fiddly and heavily tested code.

## Consequences
The caption matches what he's saying. Showing more than one sentence at once, or scrolling, would be a new decision.
