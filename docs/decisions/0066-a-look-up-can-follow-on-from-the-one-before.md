# 0066. A look-up can follow on from the one before

- Date: 2026-11-26
- Status: accepted

## Context
The helper from record 0063 starts fresh for every look-up and remembers nothing. In `ask` mode Jarvis never sees a look-up, on purpose. So "look up who scored", straight after looking up a score, had nothing to follow on from, and the helper's offer to look again if I said more couldn't work. After a spoken look-up he also didn't listen for a follow-up, so I had to say "Hey Jarvis" again.

## Options considered
Chosen 26 Nov:
- Carry the last look-up for 5 minutes: chosen. A look-up within 5 minutes of the last answered one is also given that one's question and answer. Only my words and the web's answer go, nothing from the brain.
- Each look-up stands alone: lost. The helper would just stop offering.
- Let Jarvis see look-ups: lost. Web text would reach the Jarvis who reads my brain, even in `ask`.

For what I say in the follow-up after a spoken look-up, I asked for it to work out whether I want another look-up or am talking to Jarvis, since sending everything to the web would be annoying and sending everything to Jarvis would lose the thread.

Claude's picks, not discussed:
- The check is one small question to the fast model, the way `JARVIS_TURN_CHECK` works: the last look-up's question and answer and what I said, answered with one word, `look` or `chat`. Unsure means `chat`, and no answer within 3 seconds or a failed check sends it to Jarvis, so a slow check never sends my words to the web.
- Only one look-up back is carried. A look-up that failed or found nothing isn't one to follow on from, and `new` forgets it.
- The helper is now told to say what it took an unclear question to mean, and never to offer to do more.
- Both logs record whether a look-up followed on and how long the check took, and a look-up is logged in the chat that started it.
- The compare report says how each look-up signed in, in words.

## Decision
A look-up within 5 minutes of the last answered one carries that one's question and answer. After a spoken look-up's answer, with `JARVIS_FOLLOW_UP` set, he listens for a follow-up, and a one-word check decides whether it's another look-up or for Jarvis.

## Confidence and the case against
Medium. The case against: a follow-on now sends the last answer back out with the new question, so a page's words can travel one step further. The check can get it wrong both ways: a reply meant for Jarvis could be looked up, or a follow-on question could go to Jarvis, who doesn't know what I looked up. And each check is one more request on Jarvis's API key.

## Consequences
- With `JARVIS_WEB=off` nothing changes. With `JARVIS_FOLLOW_UP` off, there's no window after a look-up and no check.
- An unrelated look-up within 5 minutes still carries the last one, marked as context to ignore unless it follows on.
- In `auto`, Jarvis's own look-up tool is unchanged: he already sees his own look-ups.
