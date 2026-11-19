import assert from "node:assert/strict";
import { test } from "node:test";
import type { SpeechStart } from "./config.js";
import { createSentences, firstClauseChars, maxPieceChars } from "./sentences.js";

function fed(chunks: string[], options: { start?: SpeechStart; skipCode?: boolean; maxChars?: number; clauseChars?: number } = {}): string[][] {
  const sentences = createSentences({ start: "sentence", ...options });
  return [...chunks.map((chunk) => sentences.push(chunk)), sentences.end()];
}

function whole(text: string, options: { start?: SpeechStart; skipCode?: boolean; maxChars?: number; clauseChars?: number } = {}): string[] {
  return fed([text], options).flat();
}

test("a piece can be up to 400 characters, and a first clause needs 20", () => {
  assert.equal(maxPieceChars, 400);
  assert.equal(firstClauseChars, 20);
});

test("a sentence is handed over once the next one has started, and the last one waits for the end", () => {
  assert.deepEqual(fed(["Hello there. ", "How are", " you? I'm", " fine."]), [[], ["Hello there."], ["How are you?"], [], ["I'm fine."]]);
});

test("words that arrive one at a time come out as the same sentences", () => {
  const words = "The server is up. Its disk is half full! Shall I check the backup? Yes.".split(/(?<= )/);
  assert.deepEqual(fed(words).flat(), ["The server is up.", "Its disk is half full!", "Shall I check the backup?", "Yes."]);
});

test("a full stop at the end of what's arrived so far isn't trusted, since a number or a name may carry on", () => {
  assert.deepEqual(fed(["It costs 3.", "5 pounds. Cheap."]), [[], ["It costs 3.5 pounds."], ["Cheap."]]);
  assert.deepEqual(fed(["I read index.", "md and that's all."]), [[], [], ["I read index.md and that's all."]]);
  assert.deepEqual(fed(["Version 0.10.0 is out. Good."]).flat(), ["Version 0.10.0 is out.", "Good."]);
});

test("a title or a short form before a name doesn't end a sentence", () => {
  assert.deepEqual(whole("Ask Dr. Smith about it. Then Mr. Jones and Mrs. Jones. Or Ms. Patel."), ["Ask Dr. Smith about it.", "Then Mr. Jones and Mrs. Jones.", "Or Ms. Patel."]);
  assert.deepEqual(whole("Prof. Green lives on St. Mary's Road. It was Leeds vs. Derby."), ["Prof. Green lives on St. Mary's Road.", "It was Leeds vs. Derby."]);
  assert.deepEqual(whole("Fruit, e.g. Apples, i.e. Round ones. Fine."), ["Fruit, e.g. Apples, i.e. Round ones.", "Fine."]);
  assert.deepEqual(whole("Use a tool, e.g. docker. Done."), ["Use a tool, e.g. docker.", "Done."]);
  assert.deepEqual(whole("E.g. Docker does this. I.e. It works. Vs. Podman it's close."), ["E.g. Docker does this.", "I.e. It works.", "Vs. Podman it's close."]);
});

test("a short form only counts as a word of its own, in the case it's written in", () => {
  assert.deepEqual(whole("It runs three VMs. Each is small."), ["It runs three VMs.", "Each is small."]);
  assert.deepEqual(whole("It took 300 ms. Then it stopped."), ["It took 300 ms.", "Then it stopped."]);
  assert.deepEqual(whole("The engine revs. Then it stalls."), ["The engine revs.", "Then it stalls."]);
  assert.deepEqual(whole('She said "Dr. Smith" and (Mr. Jones) came. Fine.'), ['She said "Dr. Smith" and (Mr. Jones) came.', "Fine."]);
});

test("initials don't end a sentence either, at the cost of joining a sentence that ends in a capital letter to the next", () => {
  assert.deepEqual(whole("The U.S. Army and J. Smith came. Later they left."), ["The U.S. Army and J. Smith came.", "Later they left."]);
  assert.deepEqual(whole("That was plan B. Next step."), ["That was plan B. Next step."]);
});

test("an initial after a bracket or a quote still joins on", () => {
  assert.deepEqual(whole('(J. Smith) and "A. Jones" came. Fine.'), ['(J. Smith) and "A. Jones" came.', "Fine."]);
});

test("a full stop followed by a number isn't taken for an end until a letter shows which it is, so the pieces don't depend on how the text arrives", () => {
  assert.deepEqual(fed(["The backup ran on Nov. ", "18 ", "at 3 a.m. today."]), [[], [], [], ["The backup ran on Nov. 18 at 3 a.m. today."]]);
  assert.deepEqual(fed(["That's approx. ", "5", " km of cable. Next."]), [[], [], ["That's approx. 5 km of cable."], ["Next."]]);
  assert.deepEqual(fed(["All done. ", "🎉 ", "Next one."]), [[], [], ["All done."], ["Next one."]]);
  assert.deepEqual(fed(["One. Two. 5"]), [["One."], ["Two.", "5"]]);
  for (const text of ["The backup ran on Nov. 18 at 3 a.m. today. Fine.", "It needs approx. 5 km of cable. Then more.", "Version 0.10.0 is out. It costs 3.50 pounds. Good.", "Ask Dr. Smith about it. Then see J. Jones, e.g. tomorrow. Done.", "First: 1. 2 more follow. Then 3. The end."]) {
    for (const size of [1, 2, 3, 5, 8]) {
      const chunks = Array.from({ length: Math.ceil(text.length / size) }, (_unused, index) => text.slice(index * size, (index + 1) * size));
      assert.deepEqual(fed(chunks).flat(), whole(text), `${text} in ${size}s`);
    }
  }
});

test("a short form split across two arrivals is still joined", () => {
  assert.deepEqual(fed(["Ask Dr. ", "Smith. ", "Then go."]), [[], [], ["Ask Dr. Smith."], ["Then go."]]);
});

test("a new line ends a piece straight away, full stop or not", () => {
  assert.deepEqual(fed(["First line\nsecond line. Third"]), [["First line", "second line."], ["Third"]]);
  assert.deepEqual(fed(["## Summary\n\nAll good.\n"]), [["Summary", "All good."], []]);
  assert.deepEqual(fed(["One.\r\nTwo.\r\n"]), [["One.", "Two."], []]);
  assert.deepEqual(whole("Run:\r\n```\r\ncode\r\n```\r\nAfter.\r\n"), ["Run:", "After."]);
  assert.deepEqual(whole("One\rTwo."), ["One", "Two."]);
});

test("a list's items are one piece each, and a number on its own waits for its item", () => {
  assert.deepEqual(whole("Steps:\n1. Unplug it.\n2. Wait ten seconds. Really.\n- Plug it in\n"), ["Steps:", "1, Unplug it.", "2, Wait ten seconds.", "Really.", "Plug it in"]);
  assert.deepEqual(fed(["1. ", "Unplug it. ", "Next."]), [[], [], ["1, Unplug it."], ["Next."]]);
  assert.deepEqual(fed(["100. ", "Unplug it. ", "Next."]), [[], [], ["100, Unplug it."], ["Next."]]);
  assert.deepEqual(fed(["- 1. ", "Unplug it. ", "Next."]), [[], [], ["1, Unplug it."], ["Next."]]);
});

test("what comes out is already cleaned for speaking, and a piece with nothing to say is left out", () => {
  assert.deepEqual(whole("**Done.** I read `areas/home-server.md`. See https://example.com.\n---\n| a | b |\n|---|---|\n"), ["Done.", "I read.", "See.", "a, b"]);
  assert.deepEqual(whole("...\n\n   \n🎉\n"), []);
});

test("a fenced block of code is skipped, and speaking carries on after it", () => {
  assert.deepEqual(whole("Run this:\n```bash\ndocker ps\necho done. Really.\n```\nThen look.\n"), ["Run this:", "Then look."]);
  assert.deepEqual(whole("Before.\n~~~\ncode here\n~~~\nAfter.\n"), ["Before.", "After."]);
  assert.deepEqual(whole("  ```\n  indented fence\n  ```\nAfter."), ["After."]);
  assert.deepEqual(whole("````\nfour ticks\n````\nAfter."), ["After."]);
});

test("a fence that arrives in bits is still seen, and nothing inside it slips out early", () => {
  assert.deepEqual(fed(["Run this:\n`", "`", "`bash\ndocker ps. ", "More code. And more.\n``", "`\nThen look. ", "Done."]), [["Run this:"], [], [], [], [], ["Then look."], ["Done."]]);
});

test("a fence that's never closed keeps everything after it unspoken", () => {
  assert.deepEqual(whole("Here:\n```\ndocker ps\nstill code. Yes."), ["Here:"]);
});

test("code marks at the start of a line that aren't a fence are spoken as usual", () => {
  assert.deepEqual(fed(["`docker ps` lists them. ", "Next."]), [[], ["docker ps lists them."], ["Next."]]);
  assert.deepEqual(fed(["``", "x`` is odd. ", "Next."]), [[], [], ["x is odd."], ["Next."]]);
  assert.deepEqual(fed(["~", "5 minutes. ", "Next."]), [[], [], ["~5 minutes."], ["Next."]]);
});

test("three ticks in the middle of a line aren't a fence", () => {
  assert.deepEqual(whole("Type this. ``` Is a fence.\nNext line."), ["Type this.", "Is a fence.", "Next line."]);
  assert.deepEqual(whole("Three ``` ticks.\nstill spoken\n```\nnot spoken"), ["Three ticks.", "still spoken"]);
  assert.deepEqual(fed(["Type this. ```Is", " three ticks.\nNext line."]), [["Type this."], ["Is three ticks."], ["Next line."]]);
  assert.deepEqual(fed(["Type this. ```Is", " three ticks. And", " more.\nNext."]), [["Type this."], ["Is three ticks."], ["And more."], ["Next."]]);
});

test("code written on one line between two sets of three ticks is read as words, and doesn't hide what follows", () => {
  assert.deepEqual(whole("To restart it, run:\n```docker compose restart kokoro```\nThat should fix it. If not, tell me."), ["To restart it, run:", "docker compose restart kokoro", "That should fix it.", "If not, tell me."]);
  assert.deepEqual(fed(["Run:\n```docker ", "compose ps``", "`\nDone."]).flat(), ["Run:", "docker compose ps", "Done."]);
});

test("a block of code ends only at a line of the same marks, at least as many, with nothing after them", () => {
  assert.deepEqual(whole("````\ncode\n```\nstill code\n````\nAfter."), ["After."]);
  assert.deepEqual(whole("```\ncode\n~~~\nstill code\n```\nAfter."), ["After."]);
  assert.deepEqual(whole("~~~\ncode\n```\nstill code\n~~~\nAfter."), ["After."]);
  assert.deepEqual(whole("```\ncode\n```js\nstill code\n```\nAfter."), ["After."]);
  assert.deepEqual(whole("```\ncode\n`````  \nAfter."), ["After."]);
  assert.deepEqual(whole("> ```\n> code\n> ```\nAfter."), ["After."]);
  assert.deepEqual(whole("~~~ `sh`\ncode\n~~~\nAfter."), ["After."]);
});

test("a block of code that starts straight after a list's mark is skipped too", () => {
  assert.deepEqual(whole("1. ```bash\n   docker compose ps\n   ```\n2. Then look at the list.\n\nThat's all."), ["2, Then look at the list.", "That's all."]);
  assert.deepEqual(whole("- ```bash\n  docker compose ps\n  ```\n- Then look."), ["Then look."]);
  assert.deepEqual(whole("12) ```\ncode\n```\nAfter."), ["After."]);
});

test("a fence line is held back whole until its line ends, even when it reads like a sentence", () => {
  assert.deepEqual(fed(["```js title. Next", "\nlet x = 1.\n```\nDone."]), [[], [], ["Done."]]);
});

test("a piece longer than the limit is cut at a comma, or else at a space, and nothing is lost", () => {
  const long = "one two three four five, six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.";
  assert.deepEqual(whole(long, { maxChars: 40 }), ["one two three four five", "six seven eight nine ten eleven twelve", "thirteen fourteen fifteen sixteen."]);
  assert.deepEqual(whole("abcdefghijklmnopqrstuvwxyz", { maxChars: 10 }), ["abcdefghij", "klmnopqrst", "uvwxyz"]);
  assert.deepEqual(whole("one two three four five; six seven eight nine ten", { maxChars: 30 }), ["one two three four five;", "six seven eight nine ten"]);
  assert.deepEqual(whole("one two three four five: six seven eight nine ten", { maxChars: 30 }), ["one two three four five:", "six seven eight nine ten"]);
  assert.deepEqual(whole(`${long}\nAfter.`, { maxChars: 40 }), ["one two three four five", "six seven eight nine ten eleven twelve", "thirteen fourteen fifteen sixteen.", "After."]);
  assert.deepEqual(fed([`${long} After`, " that."], { maxChars: 40 }), [["one two three four five", "six seven eight nine ten eleven twelve", "thirteen fourteen fifteen sixteen."], [], ["After that."]]);
  assert.equal(whole(`${"word ".repeat(200)}end.`).every((piece) => piece.length <= maxPieceChars), true);
  assert.equal(whole(`${"word ".repeat(200)}end.`).join(" "), `${"word ".repeat(200)}end.`);
});

test("text with no full stop doesn't wait for ever: once it's past the limit, the first part is handed over", () => {
  const sentences = createSentences({ start: "sentence", maxChars: 30 });
  assert.deepEqual(sentences.push("these words just keep on coming "), ["these words just keep on"]);
  assert.deepEqual(sentences.push("with no end"), []);
  assert.deepEqual(sentences.end(), ["coming with no end"]);
});

test("with the first-clause setting, the first piece of an answer can end at a comma once it's long enough", () => {
  assert.deepEqual(fed(["Well, that depends on the weather, ", "which is bad. Second, third."], { start: "clause" }), [["Well, that depends on the weather"], ["which is bad."], ["Second, third."]]);
});

test("the first clause can also end at a semicolon, a colon or a dash", () => {
  assert.deepEqual(fed(["The backup ran last night; it took", " an hour."], { start: "clause" }), [["The backup ran last night;"], [], ["it took an hour."]]);
  assert.deepEqual(fed(["Here is what I found: the disk", " is full."], { start: "clause" }), [["Here is what I found:"], [], ["the disk is full."]]);
  assert.deepEqual(fed(["The server is fine – nothing", " to report."], { start: "clause" }), [["The server is fine –"], [], ["nothing to report."]]);
  assert.deepEqual(fed(["The server is fine - nothing", " to report."], { start: "clause" }), [["The server is fine -"], [], ["nothing to report."]]);
  assert.deepEqual(fed(["The server is fine — nothing", " to report."], { start: "clause" }), [["The server is fine —"], [], ["nothing to report."]]);
  assert.deepEqual(fed(["The server is doing fine—nothing", " to report."], { start: "clause" }), [["The server is doing fine—"], [], ["nothing to report."]]);
});

test("a hyphen inside a word isn't a clause end", () => {
  assert.deepEqual(fed(["This server runs many self-hosted services, and", " more."], { start: "clause" }), [["This server runs many self-hosted services"], [], ["and more."]]);
  assert.deepEqual(fed(["The range is 10–20 degrees most days, and", " more."], { start: "clause" }), [["The range is 10–20 degrees most days"], [], ["and more."]]);
});

test("a clause shorter than 20 spoken characters isn't worth a request of its own, and marks don't count towards it", () => {
  assert.deepEqual(fed(["Sure, I can", " do that."], { start: "clause" }), [[], [], ["Sure, I can do that."]]);
  assert.deepEqual(fed(["**Yes**, `it` *is*, and more", " follows."], { start: "clause" }), [[], [], ["Yes, it is, and more follows."]]);
  assert.deepEqual(fed(["Exactly twenty chars, then more", "."], { start: "clause" }), [["Exactly twenty chars"], [], ["then more."]]);
  assert.deepEqual(fed(["Short one, then more", "."], { start: "clause", clauseChars: 5 }), [["Short one"], [], ["then more."]]);
});

test("the first clause isn't cut inside a link's words, a bracket or code marks", () => {
  assert.deepEqual(fed(["Have a look at [the docs, which are long](https://example.com/a) for", " more."], { start: "clause" }), [[], [], ["Have a look at the docs, which are long for more."]]);
  assert.deepEqual(fed(["It works (on most days, at least) and", " so on."], { start: "clause" }), [[], [], ["It works (on most days, at least) and so on."]]);
  assert.deepEqual(fed(["Run `docker compose ps, then look` and", " wait."], { start: "clause" }), [[], [], ["Run docker compose ps, then look and wait."]]);
  assert.deepEqual(fed(["It works (on most days), and then", " it stops."], { start: "clause" }), [["It works (on most days)"], [], ["and then it stops."]]);
  assert.deepEqual(fed(["Run `docker compose ps` first, then look", " at it."], { start: "clause" }), [["Run docker compose ps first"], [], ["then look at it."]]);
  assert.deepEqual(fed(["Step 1) restart the server now, then", " wait."], { start: "clause" }), [["Step 1) restart the server now"], [], ["then wait."]]);
});

test("what's left of a line after an early cut isn't taken for the start of a line", () => {
  assert.deepEqual(fed(["Run this command now, ```bash", "\nNext."], { start: "clause" }), [["Run this command now"], ["bash"], ["Next."]]);
  assert.deepEqual(fed(["aaaa bbbb cccc dddd ```bash", "\nNext."], { maxChars: 20 }), [["aaaa bbbb cccc dddd"], ["bash"], ["Next."]]);
});

test("a comma inside a number isn't a clause end", () => {
  assert.deepEqual(fed(["That folder holds 1,250,000 files and", " counting."], { start: "clause" }), [[], [], ["That folder holds 1,250,000 files and counting."]]);
});

test("only the very first piece of an answer is cut at a clause", () => {
  assert.deepEqual(fed(["First sentence here. ", "Then a long second one, with a comma, ", "and more."], { start: "clause" }), [[], ["First sentence here."], [], ["Then a long second one, with a comma, and more."]]);
  assert.deepEqual(fed(["Well, that depends on the weather, and then, as ever, on the", " day."], { start: "clause" }), [["Well, that depends on the weather"], [], ["and then, as ever, on the day."]]);
});

test("unspeakable text at the start doesn't use up the first clause", () => {
  assert.deepEqual(fed(["```\ncode\n```\n---\nWell, that depends on the weather, ", "which is bad."], { start: "clause" }), [["Well, that depends on the weather"], [], ["which is bad."]]);
});

test("without the first-clause setting, nothing is ever cut at a comma", () => {
  assert.deepEqual(fed(["Well, that depends on the weather, ", "which is bad."]), [[], [], ["Well, that depends on the weather, which is bad."]]);
});

test("ending hands over whatever was held and leaves it ready for another answer", () => {
  const sentences = createSentences({ start: "clause" });
  assert.deepEqual(sentences.push("Well, that depends on the weather, which"), ["Well, that depends on the weather"]);
  assert.deepEqual(sentences.push(" is bad.\n```\nnever closed"), ["which is bad."]);
  assert.deepEqual(sentences.end(), []);
  assert.deepEqual(sentences.end(), []);
  assert.deepEqual(sentences.push("Again, that depends on the weather, which"), ["Again, that depends on the weather"]);
  assert.deepEqual(sentences.end(), ["which"]);
});

test("nothing in means nothing out", () => {
  assert.deepEqual(fed([]), [[]]);
  assert.deepEqual(fed(["", ""]), [[], [], []]);
  assert.deepEqual(fed(["\n\n\n"]), [[], []]);
});

test("asked to skip code, sentences leave out what's in code marks, and one that was only code isn't spoken", () => {
  const text = "Run the tests first.\n`npm test`\nThen type `npm start` and wait. Use `bash host/jarvis.sh` to start him.";
  assert.deepEqual(whole(text, { skipCode: true }), ["Run the tests first.", "Then type and wait.", "Use to start him."]);
  assert.deepEqual(whole(text), ["Run the tests first.", "npm test", "Then type npm start and wait.", "Use bash to start him."]);
  assert.deepEqual(fed([...text], { skipCode: true }).flat(), whole(text, { skipCode: true }));
});

test("asked to skip code, a first clause needs its 20 characters without the code", () => {
  const arriving = ["Run `docker compose up -d --build`, then wait", " for it. After that it's ready."];
  assert.deepEqual(fed(arriving, { start: "clause" }), [["Run docker compose up -d --build"], ["then wait for it."], ["After that it's ready."]]);
  assert.deepEqual(fed(arriving, { start: "clause", skipCode: true }), [[], ["Run, then wait for it."], ["After that it's ready."]]);
});

test("asked to skip code, a sentence end inside code marks doesn't split the code, so none of it is spoken", () => {
  const text = "Run `git commit -m 'Fix bug. Add test'` now. Then rest.";
  assert.deepEqual(whole(text, { skipCode: true }), ["Run now.", "Then rest."]);
  assert.deepEqual(fed([...text], { skipCode: true }).flat(), ["Run now.", "Then rest."]);
  assert.deepEqual(whole(text), ["Run git commit -m 'Fix bug.", "Add test' now.", "Then rest."]);
});

test("asked to skip code, sentences are split around code spans found the same way the filter finds them, escaped marks and all", () => {
  for (const text of ["Use \\` to mark code. Run `git commit -m 'Fix bug. Add test'` now.", "Use `` ` `` to mark code. Run `git commit -m 'Fix bug. Add test'` now."]) {
    assert.deepEqual(whole(text, { skipCode: true }), ["Use to mark code.", "Run now."], text);
    assert.deepEqual(fed([...text], { skipCode: true }).flat(), ["Use to mark code.", "Run now."], text);
  }
});

test("asked to skip code, a mark that opens nothing holds the rest of its line, then the line is split as usual", () => {
  const sentences = createSentences({ start: "sentence", skipCode: true });
  assert.deepEqual(sentences.push("First this. Run `npm test. Then go on. And"), ["First this."]);
  assert.deepEqual(sentences.push(" more.\nNext line. Ok."), ["Run npm test.", "Then go on.", "And more.", "Next line."]);
  assert.deepEqual(sentences.end(), ["Ok."]);
});

test("asked to skip code, a stray mark pairs with the next one, as Markdown would, so what's between them isn't spoken", () => {
  const text = "Don`t worry. It's fine. Run `npm test` now.";
  assert.deepEqual(whole(text, { skipCode: true }), ["Don npm test now."]);
  assert.deepEqual(fed([...text], { skipCode: true }).flat(), ["Don npm test now."]);
  assert.deepEqual(whole(text), ["Dont worry.", "It's fine.", "Run npm test now."]);
});
