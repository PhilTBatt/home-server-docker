# 0067. Jarvis introduces himself from a file in his instructions

- Date: 2026-11-27
- Status: accepted

## Context
When someone asks Jarvis who he is, he only has his instructions and the persona to go on, so the answer changes each time and can claim things he can't do. I wanted a basic intro for now, and on 19 Nov I'd said I'd like intros of different lengths later.

## Options considered
Chosen 27 Nov:
- The intro in his instructions, with a line saying when to use it: chosen. He gives it in his own words, typed or spoken, and can answer follow-up questions about it.
- A code word that his code answers word for word: not chosen. Instant, but always the same, with no follow-ups.
- The intro in its own file, `jarvis/intro.md`, behind a setting that's off by default: chosen.
- Claude drafts it from the decision records and I edit it: chosen.
- The intro in the brain: not chosen. Merged notes shouldn't be able to change his instructions.

Claude's picks, not discussed:
- The setting is `JARVIS_INTRO`, `off` or `on`, and the file is read once when he starts, like the persona.
- The line before it tells him to answer from it when asked who or what he is, what he can do or who made him, or to introduce himself; as briefly as the question needs; never to recite it unasked or add abilities it doesn't give him; and that the rest of his instructions win if they disagree. So in guest mode he still won't offer what guests can't use.
- It goes after the persona and before the live facts, which say what's actually switched on.
- Up to 2,000 characters, since it goes with every question. He won't start if it's on and the file is missing, empty or too long, the way the persona works.
- His start-up lines say `Intro: on` with its word count.
- The first draft, in four short paragraphs: what he is, that I built him with Claude to learn, how he hears and speaks, what he can do, and what leaves the server.

## Decision
With `JARVIS_INTRO=on`, Jarvis reads `jarvis/intro.md` when he starts and adds it to his instructions after the persona, with a line saying to answer from it when asked about himself.

## Confidence and the case against
High that it works (Claude's estimate): it's the persona's pattern. The case against: the draft lists abilities that are only true when their switches are on, so with one off he could still mention it. The live facts come after it and say what's on, and the line says the rest of his instructions win, but a model can still slip. Keeping the file true is mine to do.

## Consequences
Intros of different lengths can come later as more files or sections. The file is tracked and the repo is public, so nothing private goes in it.
