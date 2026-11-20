# 0023. Jarvis speaks his answers a sentence at a time, each through its own player

- Date: 2026-11-19
- Status: accepted, with how a new question or an empty line stops him changed by 0025, what's in code marks left unspoken with the spoken style on (0031), failed sentences logged as couldn't be made or couldn't be played (0032), and sentences after the first sent to Kokoro several at a time with `JARVIS_SPEECH_BUNDLE` (0033)

## Context
Since record 0020 Jarvis can say one fixed sentence through Kokoro. His answers arrive a few words at a time, and speaking them means settling things that are awkward to change later: what gets spoken, when speech starts, how each sound is played, what stops it, what happens when a sentence fails, and what's logged. Kokoro takes roughly 0.3 seconds plus 0.37 seconds for each second of speech on this server (record 0020), so waiting for a whole answer before speaking would add seconds of silence to every reply.

## Options considered
When speech starts:
- A sentence at a time, each sent to Kokoro as soon as it's complete, while the rest is still being written: chosen. The first sound only waits for the first sentence.
- The whole answer, once it's finished: not chosen. Nothing would be heard until the last word had been written and all of it made.
- The whole answer handed to Kokoro's own streaming: not chosen. Kokoro packs sentences together before it makes any sound, so the first sound would come later, and a failure part-way would cut a sentence off mid-word (record 0020).
- The first clause on its own, ahead of the rest of the first sentence: built behind `JARVIS_SPEECH_START=clause` so the two can be compared, and not the default. It should start sooner, at the cost of a pause where a sentence wouldn't have one. The first piece after each tool he uses can be cut the same way.

How sentences are found:
- `Intl.Segmenter`, which is built into Node, with the last piece always held back until text with a letter in it arrives, a line ends or the answer ends: chosen. Holding back is what keeps "3." and "5" together when they arrive apart. Pieces are joined after a title or short form (Dr., Mr., e.g.), after an initial, and after a list number on its own. A new line always ends a piece, and so does a tool being used, a note or a yes-or-no question, so what he said before it is spoken while it happens. A tool also ends any block of code left open.
- Splitting at every full stop, question mark and exclamation mark: not chosen. "3.5", "index.md" and "e.g." would each be cut in two.
- A library for it: not chosen. A dependency for something the runtime already does.

What's spoken:
- The answer's own words, tidied by a filter: the marks for headings, lists, bold and code left out, fenced code blocks, file paths, web addresses and emoji skipped, and anything with no letters or numbers left in it dropped: chosen. A path is a word with a backslash in it, or with a slash and one of these: it starts like a path (`/`, `~/`, `./`, `../`), ends in a slash or a file ending, starts with a site's name, has `://` in it, or is written whole in code marks. The filter only changes what goes to Kokoro. The screen shows what it always did.
- Everything as written: not chosen. A voice reading out asterisks, backticks and paths is noise.
- The tool notes, the timing and cost lines and the yes-or-no question before a hub action: never spoken. They aren't the answer.

How each sound is played:
- A new `aplay` for each sentence, given the whole sound and then closed: chosen. Kokoro returns a sentence's sound all at once, and closing `aplay`'s input is the one sure way to have it play everything it was given.
- One `aplay` for the whole answer, fed a sentence at a time: not chosen for now. From a reading of `aplay`'s source, not a test on these speakers, it takes its input in fixed blocks, so the end of one sentence could sit unplayed until the next one arrives.
- Making sound two sentences ahead of the one playing, with one request to Kokoro at a time: chosen. It hides most of the making time behind the playing, without making a long answer's worth of speech that may never be heard.

What the prompt does while he's speaking:
- It comes back as soon as the words are done, and he carries on speaking behind it. A new question, `new`, `exit` or Ctrl+C stops the sound at once, and Enter on an empty line stops him talking and nothing else: chosen. Reading is quicker than listening, so the next question shouldn't have to wait for him to finish.
- Holding the prompt until he's finished: not chosen. The only way to stop him would be Ctrl+C, which ends the chat.
- Ctrl+C stopping only the speech the first time: not chosen. It would change what Ctrl+C has always done here.

When a sentence can't be spoken:
- Skip it and carry on, and after two in a row that can't be made, or two in a row that can't be played, leave the rest of that answer unspoken; either way say so in a note before the next answer or when the chat ends: chosen. One bad sentence shouldn't silence an answer, and a speech engine that has gone away shouldn't be asked forty times.
- Stop at the first failure: not chosen. A single slow sentence would end the speech.
- Try the sentence again: not chosen. Everything behind it would wait.
- A time limit on playing each sentence, of twice the sound's own length plus 10 seconds, after which its `aplay` is stopped and the sentence counts as failed: chosen. Kokoro's requests already have a limit of their own (record 0020). Without one here, a player that never finished would leave the rest of the answer silent with nothing to say why.

How much is spoken:
- The first 40 sentences of an answer: chosen. Without a limit, a very long answer would be read out for minutes. It's a guess, and one number in `speech-queue.ts`.

What's logged:
- The answer's line as before, written at the same moment as without a voice, plus a line for its speech when the speech is over: how long after the question the first sentence was sent to Kokoro, its sound came back and the first sound that played reached the player, the longest silence between two sentences, how many sentences were spoken, failed or left, and whether the speech was stopped early, given up on or cut at 40 sentences. Never the words, and never the reason a sentence failed: chosen. A rating typed while he's speaking is saved at once.
- The speech times on the answer's own line: not chosen. The line would have to wait for the first sound, and a rating typed before then would wait with it.
- Kokoro set to log errors only (`API_LOG_LEVEL: ERROR`): chosen. At its default level it writes the first 50 characters of every piece of text it's asked to speak into its log, which would put Jarvis's words on disk outside the log he keeps himself. `WARNING`, the level its docs use as an example, still prints the first 100 characters of a piece it couldn't make sound for. This is from a reading of its v0.10.0 code and docs, and hadn't been seen on the server when this was written. At `ERROR` an error's own message is still printed, and whether any such message quotes the text isn't known.

## Decision
With `JARVIS_VOICE=kokoro`, Jarvis speaks each answer a sentence at a time while it's being written: `sentences.ts` finds the sentences, `speakable.ts` tidies each one for the ear, and `speech-queue.ts` asks Kokoro for them one at a time, up to two ahead, and plays each through an `aplay` of its own. The prompt doesn't wait for him. A new question, `new`, `exit`, Ctrl+C or a failed answer stops the sound at once, and Enter on an empty line stops him talking. `JARVIS_SPEECH_START` chooses between a whole first sentence (the default) and an early first clause. Kokoro logs errors only.

## Confidence and the case against
Medium (Claude's estimate). The case against:
- None of this had been heard on the server's speakers when it was written. A new `aplay` for every sentence may leave a small gap, or a click, between sentences. One player for the whole answer is the alternative if it does.
- Speech lags behind the text, so a long answer keeps talking after it's been read. That's what the empty-line Enter and the 40-sentence limit are for, and 40 may be the wrong number.
- The joining rules trade one mistake for another: a sentence that ends in a single capital letter ("plan B.") is joined to the next one. That only makes a longer piece, never a wrong one.
- A dropped path leaves a hole: "I read `areas/server.md` and found it" is spoken as "I read and found it". The rule for what a path is will sometimes be wrong both ways: "TypeScript/Node.js" is dropped, and a bare `api/src/modules` outside code marks is read out. Asking Jarvis to write for the ear is the next step and should leave the filter little to do.
- With Kokoro logging errors only, its own start-up messages are gone too, so there's less to read when it won't start.

## Consequences
- With `JARVIS_VOICE` off or missing, Jarvis runs as he did. Two things differ: his settings line gains `JARVIS_SPEECH_START`, and a wrong value for it stops him, like his other settings.
- An empty line used to do nothing. It still does nothing unless he's speaking.
- He's only hushed once the prompt is back. An Enter pressed while an answer is still being written is kept and acted on then, so it stops him the moment the words are done. Until then, which can be a while when he's using tools, only Ctrl+C stops the sound, and that ends the chat. At a hub action's yes-or-no question an empty line still means no.
- An answer the engine starts again is spoken again from the top.
- A note about speech that went wrong isn't shown the moment it happens, because the prompt is on the screen by then. It's shown before the next answer, or when the chat ends.
- The 120-second limit on a question doesn't count time spent speaking, because speech carries on outside it.
- The first sound's time is when the first sound that played was handed to `aplay`. `aplay` may hold it for a moment before it's heard, and that can't be seen from here. The longest silence is measured the same way, from one sentence's `aplay` finishing to the next sound being handed over, so 0 doesn't mean no gap was heard. It's empty when fewer than two sentences played.
- `npm run compare` keeps the first question of a chat apart from later ones. That shows Claude's slower first answer, not a cold Kokoro: the start-up sentence has already warmed it.
- Sound is made up to two sentences ahead, so stopping him can waste up to two requests to Kokoro, as well as the rest of the sentence that was playing.
- A Kokoro that was already running before its log setting changed keeps the old one until it's stopped and started again, because `host/jarvis.sh` never replaces a running Kokoro (record 0020).
- A hub action's yes-or-no question is typed and read, never spoken or heard (record 0011).
- The queue asks an engine for one sentence's sound at a time. An engine that finds sentence ends itself, as Piper is expected to, will need its own way in.
