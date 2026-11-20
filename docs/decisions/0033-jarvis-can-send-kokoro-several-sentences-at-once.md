# 0033. Jarvis can send Kokoro several sentences at once

- Date: 2026-11-19
- Status: accepted

## Context
Since record 0023 Jarvis sends Kokoro one sentence per request, so his first sound comes as soon as the first sentence is ready. Phil hears him as "a bit robotic". Kokoro's notes on its voices say they're weakest on short pieces, "especially less than 10-20 tokens", and suggest bundling shorter ones together (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md). Kokoro-FastAPI's own chunker aims for 175 to 250 tokens a piece when it's given a whole text (its `TARGET_MIN_TOKENS` and `TARGET_MAX_TOKENS`, https://github.com/remsky/Kokoro-FastAPI/blob/v0.10.0/docs/configuration.md). Tokens are Kokoro's units of sound, not characters. Record 0031 asks for short sentences, which makes pieces shorter still. Whether one sentence at a time is part of why he sounds robotic isn't known; Phil chose to try bundling on 19 Nov.

## Options considered
When to bundle:
- Only after the first sentence, which still goes alone: chosen. The first sound comes as soon as before.
- From the start: not chosen. The first sound would wait for more text.

Which sentences go together:
- Whatever is already waiting when Kokoro is free, with nothing held back for more: chosen. It never adds a wait. Bundles should form because Kokoro is usually behind the text; that's expected, not measured.
- A fixed number of sentences, waiting for them to arrive: not chosen. It would add silences whenever the text is slower than the speech, such as before a tool.

How big a piece can get:
- No longer than twice the last piece, and never over 250 characters: chosen. Kokoro took about 0.37 seconds of work per second of speech on this server (record 0020), so a piece up to twice as long as the one playing should be ready before it ends. 250 characters is a guess at staying near the size Kokoro's server aims for, since how many tokens a character makes varies. Both are estimates.
- Only the 250-character cap: not chosen. A big second piece behind a short first sentence could leave a silence while it's made.

What ends a piece:
- A sentence that doesn't end with a full stop, question or exclamation mark or ellipsis, such as a list item, closes its piece: chosen. Otherwise it would be read straight into the next sentence.
- Colons and semicolons as sentence ends too: not chosen. The speech filter drops code blocks, so "Run this:" followed by a code block and "Then restart." would be read as one line.

How the switch works:
- `JARVIS_SPEECH_BUNDLE`, `off` by default, logged with each voiced answer and split out by `compare`: chosen, like every other setting.

## Decision
With `JARVIS_SPEECH_BUNDLE=on`, an answer's first piece goes to Kokoro alone. After that, whenever Kokoro is free, the sentences already waiting go together as one piece, up to twice the length of the last piece Kokoro made or 250 characters, whichever is smaller, closing at any sentence that doesn't end with a full stop, question or exclamation mark or ellipsis. Each piece is made in one request and played by one `aplay`. Counts in the report and the log stay per sentence.

## Confidence and the case against
Medium (Claude's estimate) that bundling sounds more natural; Phil's ears decide. The case against:
- If a whole sentence isn't the cause of the robotic sound, this changes nothing but adds code.
- A bigger piece takes longer to make, so if the estimates are wrong there could be a silence after the first sentence. `compare`'s longest silence will show it.
- With `JARVIS_SPEECH_STOP=sentence`, he finishes the whole piece he's on, which can be several sentences, and its note still says he's stopping after this sentence.
- A piece that fails to be made or played loses several sentences at once, and "two in a row" now means two pieces.

## Consequences
- With it off, every sentence is its own piece, exactly as before.
- The report's and the log's counts (played, failed, not played in full, the 40-sentence limit) still count sentences. But a piece that's stopped or fails counts all its sentences as not played in full or failed, even ones already heard, and the longest silence is only measured between pieces, so `compare`'s numbers for the two settings aren't quite like for like.
- An answer's log line gains `speechBundle`, only with the voice on. Older lines count as `off`, and `compare` names the two "a sentence at a time" and "sentences bundled" when both are in the log.
