# 0040. Each Jarvis chat keeps to its own recording

- Date: 2026-11-21
- Status: accepted

## Context
A review of push-to-talk (record 0038) and the wake word (record 0039) tried two chats open at once, and a chat that's busy when a wake comes. Every single-chat case held up. Four things didn't:
- Stop and cancel acted on whatever recording ears had. A chat whose `/talk` recording had ended at its 30-second limit, with another chat's wake recording running, stopped that one when I pressed Enter, and asked its words. The other chat asked them too. Anything typed in the first chat cancelled the other chat's recording.
- A hold only stopped openWakeWord hearing him. A recording that was already running when another chat started speaking kept that chat's voice and sent it to Whisper, against "not listening while he speaks".
- A chat busy answering, with its voice off, still took a wake the moment ears had one, so an idle chat never saw it, and the question waited until the busy chat had finished. A chat that ended before it handled a wake it had taken left that recording to run on to Whisper, and its text sat in ears.
- The README and record 0039 said a wake while `/talk` is still listening takes over. It can't: while any recording runs, ears doesn't pass the microphone to openWakeWord. Only a wake after a `/talk` recording has ended at its limit, before Enter, takes over.

## Options considered
Stop and cancel:
- Ears gives each recording's number in a start's answer, and every answer says the number of the last one that ended (`lastId`). Stop and cancel take `?id=` and act only on that recording: one that has ended while a newer one runs is refused with 409, and one ears has moved on from with 410. Jarvis keeps the number of the recording it started or took, names it, and only takes text as its own when `lastId` is that number. Numbers start from the time ears started, in milliseconds, so as long as the server's clock doesn't go back they keep rising across a restart, and a chat holding a number from before can't touch a new recording: chosen. Without `?id=` they act as before, so `ask.js` and anything else still work.
- Refusing stop and cancel without a number: not chosen. It would break `ask.js` for nothing.
- Numbers from 1 in each run of ears: not chosen. A chat left waiting across `ears.sh stop` and `start` would stop or cancel the new run's recording with the same number, and take its words.
- A run name sent with every number: not chosen. It does the same job with more to send and check.

A recording while a chat holds the wake word:
- The recording gets silence of the same length for as long as any chat holds it: chosen. It keeps the recording's timing and its limits as they were, keeps another chat's voice out of Whisper, and if it's long enough, the quiet ends a wake recording as any quiet would. Only the hold counts, not the half second after it, so a `/talk` straight after he stops talking isn't clipped.
- Ending the recording when another chat starts holding: not chosen. It would throw away what I'd said so far.
- Changing only the docs: not chosen. It would leave the rule broken.

A busy chat:
- A chat that isn't waiting for me to type waits a second before taking a wake, so an idle chat gets it first. With only one chat, the busy one still gets it, inside ears's 2 seconds: chosen. A chat that ends while it has a wake recording it hasn't finished with cancels it by its number.
- A busy chat never taking a wake: not chosen. With one chat, a wake while he writes an answer would be dropped, and today it's asked after the answer.

The docs:
- Say what the code does: chosen. Feeding openWakeWord during `/talk` so a wake could take over: not chosen, since it would stop and replace what I was saying.

## Decision
Each recording has a number that Jarvis keeps and names, and ears refuses to stop or cancel any other. A recording running while any chat holds the wake word hears silence; holds need the wake word on. A busy chat lets an idle one take a wake first, and a chat cancels a wake recording it took and didn't finish with when it ends.

## Confidence and the case against
High for the numbering: it's what the review proved wrong, and each case has a test. Medium for the rest. The case against: these need two chats open at once, or a wake while a chat with its voice off is writing an answer, which I may never do, and they add code to both ears and Jarvis. The second's wait also means a single busy chat takes a wake a second later than before.

## Consequences
- Ears's answers gain `lastId`, and a start's gains `id`. A 410 is new.
- A `/talk` started while ears couldn't be reached is still cancelled without a number, since the chat never learnt it.
- A chat that's busy takes a wake about a second later.
- Numbers are about 13 digits long, and only keep rising across a restart as long as the server's clock doesn't go back.
- With `EARS_WAKE=off`, ears has no holds, so a `/talk` recording made while another chat speaks hears him.
