# 0036. Jarvis logs how many requests his speech engine gets

- Date: 2026-11-20
- Status: accepted

## Context
Record 0033 let Jarvis send Kokoro several sentences in one request with `JARVIS_SPEECH_BUNDLE`. Whether that was really happening couldn't be seen: the log counted sentences, not requests. Phil asked on 19 Nov for the count, and it went in that evening as `requests` and `requestedSentences` on each answer's speech line, with a line per setting in `npm run compare`, but with no record. A fresh review of that day's patches pointed out the missing record, and that an answer which started again (after a network error, or after the API turned down his earlier thinking) lost the requests made before it.

## Options considered
What's counted:
- Requests made and the sentences in them, on the speech line: chosen. With bundling off the two are equal; with it on, sentences per request shows how much was joined.
- How long each request took: not chosen. The speech line already has the first sentence's times, and a time per request would grow with the answer.
- Characters sent: not chosen. Sentences are what the rest of the line counts.

An answer that starts again:
- Count the requests from every attempt: chosen. They were made, and they took the engine's time.
- Count only the last attempt, as before: not chosen. The log would say the engine did less than it did.

## Decision
Each answer's speech line has `requests` and `requestedSentences`, counting every request made for that answer, including any made before it started again. `compare` adds them up per setting and names the engine, Kokoro or Piper.

## Confidence and the case against
High that the counts are right: tests cover bundled and unbundled answers, a request still being made when he's stopped, and an answer that starts again twice. The case against: an answer starts again rarely, so the change to how it's counted will hardly ever show. And a request that was called off part-way still counts, though the engine may not have finished it.

## Consequences
- Log lines from before the counts went in, on the evening of 19 Nov, have none, and `compare` leaves them out of its request lines.
- Only the counts of an earlier attempt are kept. Its sentences, times and failures are still those of the last attempt, as before.
- Piper splits each piece into sentences itself, so for Piper bundling saves requests and players but doesn't give it longer pieces to work on (record 0034).
