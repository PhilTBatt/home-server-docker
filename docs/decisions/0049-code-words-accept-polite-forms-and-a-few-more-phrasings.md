# 0049. Code words accept polite forms and a few more phrasings

- Date: 2026-11-25
- Status: accepted

## Context
Record 0046 made the code words count only as the whole of what I said, give or take a greeting and a few filler words. On 25 Nov I said "Can you please find my phone?", and it went to Claude, who said he had no tool for it. Asking politely is how I talk, so the strict list missed the way I actually ask.

## Options considered
How loose, chosen 25 Nov:
- Polite forms and a few more fixed phrasings: chosen. "Can you", "could you", "would you", "will you", "can u", "please" and "just" may come before a note, the phone or the trains, and "for me" after, plus a short list of other ways to ask ("where's my phone", "is my train on time"). A question that's only about phones or trains still goes to Claude.
- Exact phrases only, with Jarvis telling me the phrase when I ask another way: not chosen.

Claude's picks, not discussed:
- "Make a note" and "take a note" (with "of this", "of that" or "of it") start a note, like "note this", and "for me" may follow any of them. The phrase has to end there, so "make a note-taking app" isn't a note.
- The phone also takes "help me find my phone", "where's my phone", "ring my phone" and "ping my phone".
- Train times also take "what time's my train", "is my train on time", "are the trains on time" and "how are the trains looking", and "tell me", "give me", "check", "get" or "show me" before them, or "what are" or "what's" when "the" or "my" follows, so "What are trains?" is still a question.
- "Never mind" and "stop listening" are unchanged: polite forms of "never mind" make no sense, and "stop listening" already had its own.
- The filler words ears shares with Jarvis are unchanged; the polite words are Jarvis's own.

## Decision
Notes, the phone and train times count when asked politely or in a few listed ways, still matched in Jarvis's own code from a fixed list.

## Confidence and the case against
Medium (Claude's estimate). The list is tested against near misses, but every phrase added is one more chance for a sentence from the TV, or a question I meant for Claude, to match. "Please note this isn't working" now saves a note. The case against is the one in 0046: a list that keeps growing becomes a second, worse language model, and Claude with tools would understand any wording.

## Consequences
- More of what I say reaches the code words, and less reaches Claude.
- Each new phrasing is still a code change, with a test for it and its near misses.
