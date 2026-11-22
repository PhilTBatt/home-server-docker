# 0046. Spoken code words are handled by Jarvis's own code

- Date: 2026-11-22
- Status: accepted

## Context
Some things I say to Jarvis aren't questions: a note to keep, finding my phone, telling him to stop listening, or calling a question off. Sending those to Claude costs a call, takes a few seconds, and would need Claude to have tools that write notes or ping my phone. I asked for code words on 22 Nov, as a fixed list.

## Options considered
Where they're recognised:
- In Jarvis's own code, on Whisper's text, before Claude sees it: chosen. It's instant and free, and the AI gets no new powers. Only the exact words count, so if Whisper mishears one, the question goes to Claude as usual.
- As tools Claude can use: not chosen. Looser wording would work, but it's slower, costs a call, and gives the AI tools that write notes or ping my phone, where hub actions have so far needed me to type yes (0011).

Which words, chosen 22 Nov:
- "Note this ...": saves what follows in the brain's inbox through the hub's note upload, as a voice note with when I said it and that Whisper wrote it.
- "Find my phone": a top-priority ntfy notification, through a new hub route behind `FIND_PHONE`, so the topic stays with the hub.
- "Stop listening": ears mutes itself, in ears's own code, so Jarvis still can't change the mute (rule R1). Unmuting stays a server command, because a muted ears hears nothing.
- "Never mind" or "that's all": nothing is asked, and no follow-up opens, so it ends a run of follow-ups.
- Train times: wanted, in a patch of its own. Turning the lights off: once I have lights.

Claude's picks, not discussed:
- They count only as the whole of what I said, give or take a greeting, the clipped end of "Hey Jarvis" and a few filler words, except "note this", which counts at the start. "Note this down" counts too. "That's all?" as a question isn't never mind.
- A request to stop listening that ears didn't take ("can you stop listening?") is never sent to Claude, so he can't answer "OK, I'll stop listening" and then listen for a follow-up: Jarvis says to say just "stop listening". A question that only mentions it still goes to Claude. Ears and Jarvis share one list of filler words. When ears has muted itself, Jarvis says "I've stopped listening." Ears logs that it heard its code word, never the words.
- Only spoken questions, never typed ones.
- No switch to turn them off.
- Jarvis says a short line out loud ("Noted."), held like an answer so ears doesn't hear it. Code words aren't logged with the answers.
- The hub sends the phone at most once every 10 seconds.

## Decision
Jarvis matches a fixed list of spoken code words in his own code before Claude sees the text, and ears matches "stop listening" itself.

## Confidence and the case against
Medium (Claude's estimate). They're simple and tested, but Whisper often gets my words wrong today, so some won't match until the microphone is better, and a false wake from the TV could save a junk note or ping my phone. A note saved by a false wake also ends up in the brain, which Claude reads, so sound from the TV could put text there. The case against: tools would understand looser wording, and a list that grows could become a second, worse language model.

## Consequences
- Jarvis's own code now writes to the brain's inbox and asks the hub to ping my phone, with the hub's token, when I say so. The AI still can't do either.
- `FIND_PHONE` is a new switch in `api/.env`, so the API won't start without it.
- Adding a word is a code change.
