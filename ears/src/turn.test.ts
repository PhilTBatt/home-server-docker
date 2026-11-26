import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAfterMs, doneAfterMs, judgeWithinMs, judgeWords, leadingOn, moreAfterMs, rarelyLast } from "./turn.js";

test("words that end a sentence, with nothing left hanging, are done", () => {
  for (const text of ["What's the weather tomorrow?", "Find my phone.", "Hey Jarvis, train times please.", "Stop!", "He said \"go on.\"", "Note this: buy milk (the green one).", "  Turn it up.  "]) assert.equal(judgeWords(text), "done", text);
  for (const text of ["Turn the lights on.", "I think so.", "What does it look like?", "Not really.", "Tell me when.", "Do that.", "Stop it."]) assert.equal(judgeWords(text), "done", `${text} ends on a word that often ends a sentence`);
});

test("words that trail off, or stop on a word that leads on to more, mean more is coming, whatever full stop Whisper adds", () => {
  for (const text of ["I was thinking about...", "I was thinking about…", "Can you check the,", "Add milk, eggs and", "Add milk, eggs and.", "What time is the", "What time is the?", "It's because.", "So I went to the shop and um.", "I'd like - ", "Well:", "Tell me about my.", "It's bigger than."]) assert.equal(judgeWords(text), "more", text);
  for (const word of leadingOn) assert.equal(judgeWords(`Something ${word}.`), "more", word);
});

test("words with no ending at all are unsure, and so is nothing but noise", () => {
  for (const text of ["What's the weather tomorrow", "Find my phone", "turn the lights off", "Remind me to", "Is it going to be", "", "   ", "...", "?"]) assert.equal(judgeWords(text), "unsure", JSON.stringify(text));
});

test("only the greeting so far means the question is still to come", () => {
  for (const text of ["Hey Jarvis.", "Hey Jarvis", "Jarvis?", "Okay, Jarvis.", "Hey, Jarvis!"]) assert.equal(judgeWords(text), "more", text);
  assert.equal(judgeWords("Hey Jarvis. What's on?"), "done");
  assert.equal(judgeWords("Hi."), "more", "a bare greeting is taken as the start of one");
});

test("the last word counts, not ones earlier on, and case and curly quotes don't matter", () => {
  assert.equal(judgeWords("And then it's done."), "done");
  assert.equal(judgeWords("That’s what it’s for, AND."), "more");
  assert.equal(judgeWords("It’s the one."), "done");
  assert.equal(judgeWords("It's 7.30."), "done");
});

test("the timings: look after 0.4 s of quiet, end 0.7 s after finished words, wait 3.5 s after unfinished ones, and give a chat 1.5 s to judge", () => {
  assert.deepEqual([checkAfterMs, doneAfterMs, moreAfterMs, judgeWithinMs], [400, 700, 3_500, 1_500]);
});

test("a full stop or question mark after a word that rarely ends a thought is unsure, not done, since Whisper puts them on cut-off words too", () => {
  for (const text of ["Set a timer for.", "What's the weather like in?", "Remind me to call my mum at six and then.", "Hey Jarvis, can you?", "Add milk eggs in.", "I was going to.", "Who is it with?", "Where's that from?", "What is?", "Thank you.", "What's it for?", "Yes it is.", "I'd like to.", "That's it then."]) assert.equal(judgeWords(text), "unsure", `${text} keeps the usual pause: it may be finished, so it isn't made to wait longer`);
  for (const text of ["What time is it?", "Turn the lights off.", "Set a timer for 10 minutes.", "Find my phone.", "That's it then, thanks.", "Play some music in the kitchen."]) assert.equal(judgeWords(text), "done", text);
  assert.deepEqual(rarelyLast, ["for", "in", "at", "to", "with", "from", "then", "you", "can", "could", "would", "is", "are", "was", "i", "we", "about"]);
  for (const word of rarelyLast) assert.equal(judgeWords(`Something ${word}`), "unsure", `${word} with no ending is unsure as before`);
});
