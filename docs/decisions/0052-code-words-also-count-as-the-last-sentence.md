# 0052. Code words also count as the last sentence, and Jarvis never guesses typed or spoken

- Date: 2026-11-25
- Status: accepted

## Context
On 25 Nov I said a sentence about something else and then "Find my phone.", and later "I did say that out loud." followed by "Can you please find my phone?". Both went to Claude, because records 0046 and 0049 only count a code word when it's all I said. Claude then told me I must have typed them. The live facts from record 0050 told him a code word that reaches him was either typed or didn't match, and he can't tell typed from spoken, so he guessed, and guessed wrong.

## Options considered
Chosen 25 Nov:
- Change the live facts so he never guesses: chosen.
- Also try a code word on the last sentence of what I said: chosen.
- Tell Claude which messages were spoken: not chosen.

Claude's picks, not discussed:
- The last sentence is what follows the last full stop, question mark, exclamation mark or "…" that Whisper wrote, when a space comes after it. Pieces with no letters or numbers don't count as sentences.
- All of what I said is tried first, so "Note this. Buy milk. And eggs." keeps every sentence in the note. Only when that isn't a code word is the last sentence tried.
- When the last sentence is a code word, the sentences before it are dropped: they aren't asked, and they aren't saved in a note.
- Only the last sentence is tried. A code word earlier on ("Find my phone. What's the weather?") goes to Claude, so a question after it is never lost.
- "Stop listening." as the last sentence after something else is caught like the other requests to stop listening that ears didn't take: Jarvis says to say just that. Ears still mutes itself only when "stop listening" is all I said; it's unchanged.
- "Never mind" as a question is still asked, as the last sentence too.
- The live facts now tell him that a code word reaching him means his code didn't catch it, that typed and spoken messages reach him the same way so he can't tell which it was, never to say which, and to tell me to say it out loud, on its own or as the last thing I say.

## Decision
A code word counts when it's all I said or the last sentence of it, and the live facts stop Jarvis guessing whether a missed one was typed or spoken.

## Confidence and the case against
Medium (Claude's estimate). The last-sentence rule rests on Whisper's punctuation: if it runs two sentences together without a full stop, the code word is still missed, and an odd full stop could split one off where I didn't pause. More of what I say now reaches the code words: anything that ends with a short sentence like "Never mind." or "Train times." is taken as that code word, even when I meant it as part of something longer. Dropping the earlier sentences means "What's the weather? Train times." only gives the trains. The case against is the one in 0046 and 0049: each widening makes the list more like a second, worse language model, when Claude with tools would understand any wording.

## Consequences
- Code words work after a false start, a greeting or a sentence about something else.
- When the last sentence is a code word, what came before it is lost, so a question I want answered has to be asked without one.
- Jarvis no longer blames a missed code word on typing.
- Record 0046's matching rule, record 0049's polite forms and the live facts' advice from record 0050 are all widened or changed by this record.
