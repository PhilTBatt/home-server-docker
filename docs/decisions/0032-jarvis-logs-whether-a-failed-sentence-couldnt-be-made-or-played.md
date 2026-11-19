# 0032. Jarvis logs whether a failed sentence couldn't be made or couldn't be played

- Date: 2026-11-19
- Status: accepted

## Context
Record 0023 chose what's logged about each answer's speech: how many sentences were spoken, failed or left, and "never the words, and never the reason a sentence failed". A sentence can fail in two places: Kokoro may not make its sound, or `aplay` may not play it. Both added to one count, so the log couldn't say which. ChatGPT pointed this out when it looked at the speech guide, and Phil asked for it on 19 Nov, once `compare` added up each setting's failed sentences.

## Options considered
What's logged:
- Two counts next to `failed`, `failedMaking` and `failedPlaying`, which add up to it: chosen. Older lines, and everything that reads `failed`, keep working.
- The two counts in place of `failed`: not chosen. Older lines only have `failed`, so the total would have to be read two ways.
- The error itself: not chosen. Record 0023 keeps it out of the log, and whether an error ever quotes the text being spoken isn't known.

How `compare` shows it:
- A line under the counts table for each setting where sentences failed: chosen, Phil's pick. The table stays as wide as it was; it already wraps on his terminal.
- Two more columns in the counts table: not chosen. The table would be wider still.
- The log only, with `compare` unchanged: not chosen.

## Decision
Each answer's speech line gains `failedMaking` and `failedPlaying`, which add up to `failed`, and `compare` prints them under its counts table for each setting where sentences failed. Record 0023's "never the reason a sentence failed" now means never the error: which step failed is logged, and the error isn't.

## Confidence and the case against
High that the counts are right: a fresh review checked every way speech can fail, end or be stopped, and 30 deliberate breakages each failed a test. The case against: no sentence has failed in Phil's chats so far, so this may rarely show anything. Until a second engine exists, "couldn't be made" always means Kokoro.

## Consequences
- Lines logged before this have no split. `compare` counts their failures separately, as "from older log lines that don't say which".
- `compare` skips a speech line that has only one of the two counts, or whose two counts don't add up to `failed`.
- A sentence that fails while he finishes it after being interrupted, or whose sound is stopped for playing far too long, counts as couldn't be played.
- The note on screen after an answer is unchanged. It already shows the error.
