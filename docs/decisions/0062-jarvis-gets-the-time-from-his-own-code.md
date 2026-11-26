# 0062. Jarvis gets the time from his own code, with each question and as a code word

- Date: 2026-11-26
- Status: accepted

## Context
Jarvis couldn't tell me the time. Claude only knows what's in the chat, and nothing put a clock there, so "what time is it?" got an apology. He couldn't reason about time either: whether it's too late to ring someone, or how long until a train.

## Options considered
Chosen 26 Nov: both of the first two.
- A line with the time after every question: chosen. He knows the time for any question, typed or spoken, at the cost of a few tokens a question.
- A code word for asking the time or the date out loud: chosen as well. Like the other code words it's instant and costs nothing, for the plainest way of asking.
- The time in the system prompt: lost. The system prompt is the same text every turn, and a time in it would be wrong within a minute or change it every turn.
- A tool he calls for the time: lost. It's a second round trip to Claude for something his own code can simply tell him.
- Letting him look it up on the web: not part of this. Whether he can search the web is its own decision, with its own risks.

Claude's picks, not discussed:
- The date is a code word as well as the time.
- Which phrases count, and that they only count when they're all I said. Every other code word also counts as the last sentence of something longer; these don't, because "I'm in New York. What time is it?" should reach Claude with the rest of what I said.
- London time, whatever time zone the server is set to.
- The replies' wording, with the time in 24-hour form like the train times.
- The line goes straight after my message, before the chat-size line when there is one.
- No follow-up recording after a clock answer, as with every code word.
- The log doesn't record the switch.

## Decision
`JARVIS_CLOCK`, off by default. On, every question goes to Claude with a bracketed line after it giving the time and date in London, and asking the time or the date out loud is answered by his own code from the server's clock.

## Confidence and the case against
High for the line, medium for the code word. The case against the code word: with the line there Claude can already answer, so it's a second way to do one thing, kept only because it's instant. The case against the line: it's in every question whether or not the time matters.

## Consequences
- With the switch off nothing changes: the phrases aren't code words, and nothing is added to a question or to the system prompt.
- The server's clock is trusted. If it's wrong, he's wrong.
- The time is always London's, whatever time zone the server is set to.
- The line stays in a saved chat with each question, so an old chat shows when each thing was asked.
- While a round of brain questions is open (record 0061), asking the time or the date out loud is filed as an answer, like anything else I say then except stop listening.
- The log doesn't record the switch, so `npm run compare` can't split by it.
