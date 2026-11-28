# 0091. The phone gets his voice a sentence at a time

- Date: 2026-11-28
- Status: accepted

## Context
Talking to Jarvis from the phone (record 0078) made his whole answer's voice first, joined it into one WAV and sent it to the hub, so the phone played nothing until the last sentence was made. Phil found the phone's voice "quite slow". In the room he speaks each sentence as soon as it's made.

## Options considered
Chosen by Phil (27 Nov, accepted in the 28 Nov order): send his voice a sentence at a time, so the phone starts playing after the first sentence. The downsides were put to him first: a gap between sentences when Kokoro makes one slower than the last one plays (likelier with the server on swap), and more moving parts, with Play again having to replay every piece. Not chosen: leaving it as one WAV.

Claude's picks, not discussed:
- Each sentence goes to the hub as its own WAV, to `POST /talk/<id>/voice?part=<n>`, in order from 0, as soon as Kokoro or Piper has made it. `POST /talk/<id>/voice-done` says it's all there. A piece out of order, or after done, is refused. The hub's view gives `voices`, how many pieces it has so far, and `GET /talk/<id>/voice?part=<n>` reads one.
- The limits stay what they were for one WAV: 2 minutes of voice and 6 MiB in all, so the hub's memory can't grow any more than before. An answer is also at most 120 pieces, about one a second.
- A WAV sent with no part is the whole voice, done at once, and the view's `voice` is still true once any piece is there, so most mixes of old and new still work while things are updated: an old Jarvis sends one WAV to a new hub, and a new page plays an old hub's one WAV. Two don't: a new Jarvis with an old hub gets only his first sentence there, and a phone still showing the old page plays only the first sentence from a new Jarvis. So the steps update the hub before Jarvis, and reload the page on the phone.
- If his voice stops part-way (Kokoro fails, or the hub refuses a piece), the phone keeps what came, Jarvis tells the hub it's done, and his terminal says how many pieces got there and why the rest didn't.
- The page fetches each piece as the hub has it and starts it the moment the one before ends (Web Audio's own timing), so there's no gap when the pieces come faster than they play. Play again plays every piece again from the start, and any still to come follow on.
- The hub logs each piece's id, place and size, never anything else.

## Decision
His voice goes to the phone a sentence at a time, each played straight after the one before.

## Confidence and the case against
Fairly confident. The case against: on a slow server the phone may now play a sentence, pause, play the next, where before it played smoothly once it started; whether that's better than waiting is a matter of taste, and it can't be switched back without a new decision. It's also more requests (one per sentence) and more code in three places.

## Consequences
The phone's first words come sooner, by the time the rest of the answer takes to speak. The hub keeps a list of pieces per answer instead of one WAV. Sending more than one piece at a time, or the room and the phone sharing pieces, would be its own change.
