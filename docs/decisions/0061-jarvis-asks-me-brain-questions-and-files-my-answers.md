# 0061. Jarvis asks me brain questions when I ask, and files my answers in the inbox

- Date: 2026-11-26
- Status: accepted

## Context
My brain (`~/hub-memory`) has gaps and mistakes I don't see: two files that disagree, a dated fact that's gone stale, a name that's mentioned but never explained. Jarvis already reads all of it, read-only, so he's well placed to spot them. The question was how far he should go in fixing and filling it, given that the brain is where I keep things true, and that notes only get in through the inbox, which a routine of mine merges later while treating anything that reads like an instruction as suspicious.

## Options considered
Chosen 26 Nov: suggests, never edits. Jarvis asks a gap question or two when I ask for them; my answers, and mistakes he suspects, are filed as inbox notes; the brain stays read-only to him.
- Jarvis editing brain files himself: lost. He must never write to the brain. A wrong edit would go straight into what I trust, and nothing would stand between him and it.
- Jarvis raising questions unprompted: lost. He never starts this himself. Anything he says unasked needs its own decision (record 0051), and questions at random moments would be a nag.

Claude's picks, not discussed:
- A setting, `JARVIS_BRAIN_QUESTIONS`, off by default, which needs `JARVIS_HUB_TOOLS=on` because filing uses the hub's token. It doesn't check `MEMORY_UPLOAD` before looking, since the hub has no way to ask without saving something; if the hub refuses, he says why and prints the whole note in the chat so nothing is lost.
- How I ask: typed `/questions`, or one of eight spoken phrasings matched by his code like the other code words, on their own or as the last sentence, politely or not ("brain questions", "any questions for me" and a few more), and only with the setting on: with it off they aren't code words and go to Claude as before, so switching it off changes nothing. Only typed `/questions` says how to turn it on. Typed words are never code words, as before. "Any questions?" on its own isn't one, since it's too ordinary.
- Finding them goes through the chat's own session, with a fixed instruction from his code that includes today's date. So the instruction and Claude's reply stay in the chat's history, its cost is in the chat's cost line, and it counts towards the chat's size, length warnings and cap like any question; past the cap he doesn't look. I chose this over a separate one-off session because it's what was asked, the engines have no way to send a question without keeping it, and it means I can ask him afterwards why he asked something. The look isn't written to the answer log, so it can't be rated, and my answers are never sent to Claude.
- The reply's form: a block between `BEGIN QUESTIONS` and `END QUESTIONS`, with `question:`, `files:`, `kind:` (gap or mistake) and `wrong:` lines for each. Words before it are ignored, because his instructions tell him to say what he's checking before he reads. Anything else is refused, not guessed at: more than two, lines out of order, a field over 300 characters, more than five files, or a file that isn't a plain path inside the brain or isn't there (his code checks each one exists). A `/brain/` at the start of a path is taken off.
- Any hub action Claude tries while looking is refused without asking me.
- Answers: my next typed line, or what Whisper heard through `/talk`, the wake word or the button. After a question said aloud in answer to something I said, he listens for a follow-up as usual. While questions are open, everything I say is an answer, code words included, except skip, never mind and a request to stop listening. Stop listening ends them like never mind, filing what I'd answered, and is handled exactly as outside them: never filed, never asked, the same reply, and no follow-up after it, whether ears muted itself or Jarvis tells me to say just that. Typed `exit`, `quit`, `new`, `+`, `-`, `/` commands and an empty line keep their meaning. An answer over 4,000 characters is refused and the question stays open, so the note fits the hub's 20,000-character limit. There's no time limit: the questions stay open until I answer or end them.
- Skip and filing: a skipped gap isn't filed. A skipped suspected mistake gets "Shall I file it as a suspected mistake?", and only yes, yeah, yep, yes please or file it files it. Never mind, that's all, a request to stop listening, `new`, `exit` or the chat closing ends the questions and files what I'd already answered, rather than throwing my words away. If nothing was answered, nothing is sent.
- The note: titled `brain questions`, one per run, through the same `POST /memory/inbox` as a voice note, with the same plain-words handling of the hub's errors. Each question has "Jarvis asked:", the files, "What looked wrong to Jarvis:", and "Phil answered (typed)" or "(spoken, as Whisper heard it)" with the date and time, and the answer as a quote. A line at the top says the questions come from the AI and may be wrong.
- His live facts gain a sentence saying how I ask, that his code asks and files, and that he never writes to the brain or raises questions himself.

## Decision
With `JARVIS_BRAIN_QUESTIONS=on`, `/questions` or a spoken "brain questions" has Jarvis's code ask Claude for up to two gap questions in a fixed form, ask me them one at a time, and file my answers as one inbox note; Jarvis never writes to the brain and never asks unprompted.

## Confidence and the case against
Medium (Claude's estimate). The parsing and filing are tested closely, but whether Claude finds questions worth answering is only known from using it: it reads a few files per look, so on a big brain it will mostly find small things near `index.md`, and its "stale" guesses rest on the date it's given. The case against: keeping the look in the chat's history means every later question in that chat pays for it, and a saved chat keeps it; a separate session would be tidier. Taking everything said as an answer while questions are open means a "find my phone" said then is filed rather than acted on. And I could get the same value by asking Claude Code to read the brain and list problems for me, with no new code in Jarvis.

## Consequences
- The brain stays read-only to Jarvis; the only new way in is an inbox note his own code writes, which my merge routine reads like any other.
- A new spoken code word, with near misses tested, and a second `/` command beside `/talk`.
- A run that's left open takes my next line as its answer, however much later that is.
- What Claude reads while looking, and the questions it finds, go to Anthropic as part of the chat, as everything in the chat already does. My answers don't: they go only to the hub's inbox.
