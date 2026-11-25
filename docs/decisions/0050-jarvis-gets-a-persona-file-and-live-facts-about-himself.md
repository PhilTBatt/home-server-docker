# 0050. Jarvis gets a persona file and live facts about himself

- Date: 2026-11-25
- Status: accepted; the live facts' advice on a missed code word changed by 0052

## Context
Jarvis's instructions say what he can do and how short to be, but nothing about how he comes across, so he sounds like any assistant. He also knows nothing about the chat he's in: on 25 Nov I said "Can you please find my phone?", it reached Claude, and he said he couldn't find my phone himself, with no idea that his own code has a code word for it. Notes about him in the brain go stale with every change, and his instructions treat brain files as information, never instructions.

## Options considered
Chosen 25 Nov, along with polite code words (record 0049) and spoken train changes:
- A persona file and live facts, together: chosen.
- Where the persona lives: `jarvis/persona/`, one file per persona, named by a setting: chosen. A folder in the brain was discussed on 19 Nov and not chosen: the brain is fed by merged notes, and if part of it became instructions, a line in a note could change how he behaves.
- Who writes it: Claude drafts a calm butler's manner in its own words, with no film quotes and a few example lines I can replace, and I edit it: chosen.

Claude's picks, not discussed:
- Both are settings, `JARVIS_PERSONA` (`off` or a file's name) and `JARVIS_LIVE_FACTS` (`off` or `on`), off by default like every other new Jarvis setting.
- A persona's name may only use lowercase letters, numbers and dashes, so it can't point outside the folder. Jarvis won't start if the file is missing, unreadable, empty, or over 4,000 characters, since it's sent with every question.
- The persona goes after his instructions, under a line saying it shapes his manner only, never changes what he can do, and lasts the whole chat, tool use included. Then come the live facts, the spoken style, and the session notes.
- Live facts are written by his code from what actually started: his voice and which engine speaks, how I can talk to him, whether he has the hub's tools and actions, the code words his code answers before he sees them, and what he can't do. He's told that typed messages never count, and when a code word reaches him anyway, to give me the words to say out loud rather than claim he did it.
- The log keeps the persona's name and whether live facts were on, never the persona's words, and `npm run compare` splits its rows by both.
- The butler draft leaves out "sir", the film's catchphrase; add it if wanted.

## Decision
Jarvis can load a persona from `jarvis/persona/<name>.md` and a paragraph his own code writes about what's switched on, each behind its own setting.

## Confidence and the case against
Medium (Claude's estimate). Both are text, so how much they change his answers can only be seen by trying them and comparing ratings. Each adds something like 300 tokens to every request (Claude's estimate), and a persona can make answers longer or more mannered than the facts need. The live facts repeat what's in his code, so every new code word or setting is one more place to keep true, and a fact that's gone wrong is worse than none. The simpler path would have been a few lines added to his fixed instructions, with no settings at all, at the cost of not being able to compare or switch them off. The persona is in a public repo, so it can never hold anything personal.

## Consequences
- I can change how he comes across by editing one file and starting him again, and compare personas, or none, in `npm run compare`.
- He can tell me the right words when a code word misses, instead of saying he can't.
- `live-facts.ts` has to change whenever code words, settings or his abilities do.
- Anything personal about me stays in the brain, never in `jarvis/persona/`.
