import assert from "node:assert/strict";
import { test } from "node:test";
import { codeSpansIn, looseMarkIn, speakable } from "./speakable.js";

function all(cases: [string, string][]) {
  for (const [written, spoken] of cases) assert.equal(speakable(written), spoken, written);
}

test("plain sentences are spoken as they're written", () => {
  all([
    ["Hello there.", "Hello there."],
    ["It costs £3.50, i.e. not much.", "It costs £3.50, i.e. not much."],
    ["Is it on? Yes!", "Is it on? Yes!"],
  ]);
});

test("the marks for bold, italics and struck-out text are left out, and the words kept", () => {
  all([
    ["**Bold** and *italic* words.", "Bold and italic words."],
    ["__Bold__ and _italic_ words.", "Bold and italic words."],
    ["***Both*** at once.", "Both at once."],
    ["~~Old~~ new.", "Old new."],
  ]);
});

test("heading, bullet, tick-box and quote marks at the start of a line are left out", () => {
  all([
    ["# Title", "Title"],
    ["###### Small title", "Small title"],
    ["- First thing", "First thing"],
    ["* Second thing", "Second thing"],
    ["+ Third thing", "Third thing"],
    ["• Fourth thing", "Fourth thing"],
    ["  - Indented thing", "Indented thing"],
    ["- [ ] Not done yet", "Not done yet"],
    ["- [x] Done already", "Done already"],
    ["> A quoted line", "A quoted line"],
    [">> Quoted twice", "Quoted twice"],
    ["> - A bullet in a quote", "A bullet in a quote"],
  ]);
});

test("a hash or a dash that isn't a mark is left alone", () => {
  all([
    ["Issue #12 is open.", "Issue #12 is open."],
    ["A well-known thing - more or less.", "A well-known thing - more or less."],
    ["#hashtag", "#hashtag"],
  ]);
});

test("a numbered item keeps its number, said with a pause", () => {
  all([
    ["1. Unplug it.", "1, Unplug it."],
    ["12) Plug it back in.", "12, Plug it back in."],
    ["  3. Indented.", "3, Indented."],
    ["2026. A year, not a list number.", "2026. A year, not a list number."],
    ["It scored 1. Then 2.", "It scored 1. Then 2."],
  ]);
});

test("a link is spoken as its words, and a bare web address is left out", () => {
  all([
    ["See [the docs](https://example.com/a/b) for more.", "See the docs for more."],
    ["![a chart](img.png) shows it.", "a chart shows it."],
    ["Go to https://example.com/x now.", "Go to now."],
    ["See https://example.com/x. Then stop.", "See. Then stop."],
    ["Is it https://example.com?", "Is it?"],
    ["It's at <https://example.com>.", "It's at."],
    ["[Empty]() link.", "Empty link."],
  ]);
});

test("code marks are left out and short code is read as words, with underscores as spaces", () => {
  all([
    ["Set `JARVIS_VOICE` to `kokoro`.", "Set JARVIS VOICE to kokoro."],
    ["`docker compose up -d` starts it.", "docker compose up -d starts it."],
    ["snake_case_name and a_b.", "snake case name and a b."],
    ["_leading and trailing_ marks.", "leading and trailing marks."],
  ]);
});

test("file paths are left out, with the sentence's own punctuation kept", () => {
  all([
    ["I read areas/home-server.md and found it.", "I read and found it."],
    ["It's in `jarvis/.env`.", "It's in."],
    ["It runs from ~/docker on the server.", "It runs from on the server."],
    ["Look in /dev/snd, then ./run.sh.", "Look in, then."],
    ["(see /dev/snd/pcmC1D0p).", "(see)."],
    ["(/dev/snd) is where.", "is where."],
    ['It is in "jarvis/.env", I think.', "It is in, I think."],
    ["C:\\Users\\phil\\file.txt is there.", "is there."],
    ["The log is data/answers.jsonl today.", "The log is today."],
    ["See docs/decisions/ for more.", "See for more."],
    ["Ask http://kokoro:8880 for it.", "Ask for it."],
    ["Look under `api/src/modules` first.", "Look under first."],
    ["Edit **jarvis/.env** now.", "Edit now."],
    ["It's in **~/docker**.", "It's in."],
    ["It's in _docs/notes.md_, I think.", "It's in, I think."],
    ["`areas/server.md`: the notes.", "the notes."],
    ["`areas/server.md`; then the rest.", "then the rest."],
    ["See ../notes for it.", "See for it."],
    ["It's in _~/docker_ now.", "It's in now."],
    ["The image is lscr.io/linuxserver/jellyfin:latest now.", "The image is now."],
    ["See github.com/remsky/Kokoro-FastAPI for more.", "See for more."],
    ["Ask kokoro.home:8880/health first.", "Ask first."],
    ["(`api/src/modules`).", ""],
  ]);
});

test("a slash that isn't a path is left alone, and so is a file's bare name", () => {
  all([
    ["The and/or case.", "The and/or case."],
    ["Open 24/7 at 5 km/h.", "Open 24/7 at 5 km/h."],
    ["On 18/11/2026 it worked.", "On 18/11/2026 it worked."],
    ["Half is 1/2.", "Half is 1/2."],
    ["It's `3/4` full since `18/11/2026`.", "It's 3/4 full since 18/11/2026."],
    ["Memory use is 5.2/7.6 GB.", "Memory use is 5.2/7.6 GB."],
    ["It's `5.2/7.6` GB, or `1,024/2,048`.", "It's 5.2/7.6 GB, or 1,024/2,048."],
    ["Load average: 0.12/0.08/0.05.", "Load average: 0.12/0.08/0.05."],
    ["Disk: 142/200.5 GB, or 1,024/2,048.", "Disk: 142/200.5 GB, or 1,024/2,048."],
    ["Set it to `on`/`off`.", "Set it to on/off."],
    ["The `kokoro`/`jarvis` pair.", "The kokoro/jarvis pair."],
    ["A 3.5mm/6.35mm adapter, v1.2/v1.3.", "A 3.5mm/6.35mm adapter, v1.2/v1.3."],
    ["Pick yes/no.thanks now.", "Pick yes/no.thanks now."],
    ["I read index.md first.", "I read index.md first."],
    ["Backups: Mon/Wed/Fri at 03:00.", "Backups: Mon/Wed/Fri at 03:00."],
    ["You can read/write/execute it.", "You can read/write/execute it."],
    ["Choose option A/B/C.", "Choose option A/B/C."],
    ["Three parts: a/b/c here.", "Three parts: a/b/c here."],
  ]);
});

test("a backslash put before a mark to keep it is dropped, and the word is kept", () => {
  all([
    ["The setting is JARVIS\\_VOICE here.", "The setting is JARVIS VOICE here."],
    ["Not \\*bold\\* at all.", "Not bold at all."],
    ["Version 1\\.2 is out\\!", "Version 1.2 is out!"],
    ["Issue \\#12, a \\~ and a \\+ sign.", "Issue #12, a ~ and a + sign."],
  ]);
});

test("a star that isn't around a word is kept", () => {
  all([
    ["So 2 * 3 = 6, and 2*3 too.", "So 2 * 3 = 6, and 2*3 too."],
    ["Then 2**10 is 1024, and x ** 2 is its square.", "Then 2**10 is 1024, and x ** 2 is its square."],
    ["** The rest of a bold sentence.", "The rest of a bold sentence."],
    ["A bold start is cut off here **", "A bold start is cut off here"],
    ["**Bold**, *slanted* and ***both***.", "Bold, slanted and both."],
  ]);
});

test("a table row is read as a list, and its ruling line is left out", () => {
  all([
    ["| Name | Size |", "Name, Size"],
    ["| Kokoro | 1.2 GiB |", "Kokoro, 1.2 GiB"],
    ["|---|---|", ""],
    ["| :--- | ---: |", ""],
    ["a | b", "a, b"],
  ]);
});

test("a ruled line across the page says nothing", () => {
  all([
    ["---", ""],
    ["***", ""],
    ["___", ""],
    ["=====", ""],
    ["  ---  ", ""],
  ]);
});

test("emoji, page marks, colour codes and control characters are left out", () => {
  all([
    ["Done ✅ nicely 🎉.", "Done nicely."],
    ["Thumbs 👍🏽 up.", "Thumbs up."],
    ["Flag 🇬🇧 here.", "Flag here."],
    ["Step 1\ufe0f\u20e3 is first.", "Step 1 is first."],
    ["Family \u{1f468}\u200d\u{1f469}\u200d\u{1f467} here.", "Family here."],
    ["Done \u2714\ufe0f now.", "Done now."],
    ["del\u007fete and c1\u0085here", "del ete and c1 here"],
    ["<br>Line one<br/>", "Line one"],
    ["A <b>bold</b> word.", "A bold word."],
    ["\u001b[31mred\u001b[0m text\u0007", "red text"],
    ["tab\there", "tab here"],
  ]);
});

test("a less-than sign in a sum isn't taken for a page mark", () => {
  all([["If 3 < 5 and 7 > 2, fine.", "If 3 < 5 and 7 > 2, fine."]]);
});

test("spaces are tidied: none doubled, none before punctuation or inside brackets, none at the ends", () => {
  all([
    ["  Too    many   spaces  .", "Too many spaces."],
    ["( spaced ) and [ this ]", "(spaced) and [this]"],
    ["Empty () brackets [] go.", "Empty brackets go."],
    [", starts with a comma", "starts with a comma"],
    ["Put the token in your .env file.", "Put the token in your .env file."],
    ["Check .gitignore and .bashrc now.", "Check .gitignore and .bashrc now."],
    ["It listens on port :8080 here.", "It listens on port :8080 here."],
    ["Wait ... what ?", "Wait... what?"],
    ["ends with a comma, ", "ends with a comma"],
  ]);
});

test("something with no letters or numbers left in it isn't spoken at all", () => {
  all([
    ["", ""],
    ["   ", ""],
    ["...", ""],
    ["**", ""],
    ["- ", ""],
    ["`~/docker`", ""],
    ["https://example.com", ""],
    ["🎉", ""],
    ["#", ""],
  ]);
});

test("other alphabets and accented letters count as words", () => {
  all([
    ["Café déjà vu.", "Café déjà vu."],
    ["Привет.", "Привет."],
    ["7", "7"],
  ]);
});

test("asked to skip code, anything in code marks is left out, the sentence around it is kept, and a mark left hanging before the end is dropped", () => {
  const skipping = (written: string) => speakable(written, { skipCode: true });
  assert.equal(skipping("Run `npm test` to check."), "Run to check.");
  assert.equal(skipping("The command is on screen: `docker compose up -d`."), "The command is on screen.");
  assert.equal(skipping("Set `JARVIS_VOICE` and `JARVIS_VOLUME`, then restart."), "Set and, then restart.");
  assert.equal(skipping("Use ``a `tick` inside`` like that."), "Use like that.");
  assert.equal(skipping("Both `a` and `b` go."), "Both and go.");
  assert.equal(skipping("It's in `index.md`;"), "It's in");
  assert.equal(skipping("`npm test`"), "");
  assert.equal(skipping("An open `mark stays as it was."), "An open mark stays as it was.");
  assert.equal(skipping("No code here: just words."), "No code here: just words.");
  assert.equal(skipping("Ends with a colon:"), "Ends with a colon:");
});

test("without being asked, code marks are only taken off, and a path in them is still left out", () => {
  assert.equal(speakable("Run `npm test` to check."), "Run npm test to check.");
  assert.equal(speakable("The command is on screen: `docker compose up -d`."), "The command is on screen: docker compose up -d.");
  assert.equal(speakable("The file is `jarvis/src/chat.ts` now."), "The file is now.");
  assert.equal(speakable("Run `npm test` to check.", { skipCode: false }), "Run npm test to check.");
});

test("asked to skip code, the marks left around what was taken out are tidied, an item that was only code isn't spoken as a bare number, and an escaped mark isn't code", () => {
  const skipping = (written: string) => speakable(written, { skipCode: true });
  assert.equal(skipping("Set `A`, `B`, and `C`."), "Set, and.");
  assert.equal(skipping("Note: `x`; then go."), "Note: then go.");
  assert.equal(skipping("Wait: `x`!"), "Wait!");
  assert.equal(skipping("e.g. `x`."), "e.g.");
  assert.equal(skipping("Hmm... `x` right."), "Hmm... right.");
  assert.equal(skipping("1. `cd ~/docker`"), "");
  assert.equal(skipping("2) `npm test`"), "");
  assert.equal(skipping("1. `cd ~/docker`."), "");
  assert.equal(skipping("Count 1..10 with `x`."), "Count 1..10 with.");
  assert.equal(skipping("Use std::vector and `x`."), "Use std::vector and.");
  assert.equal(skipping("Use e.g.: `x`."), "Use e.g.");
  assert.equal(skipping("Time 3:30 and `x`."), "Time 3:30 and.");
  assert.equal(skipping("Step 2 is `npm test`."), "Step 2 is.");
  assert.equal(skipping("Run`npm test`now."), "Run now.");
  assert.equal(skipping("Use ``x``` y` z."), "Use x y z.");
  assert.equal(skipping("Use \\`x\\` here."), "Use x here.");
  assert.equal(skipping("2."), "2.");
  assert.equal(skipping("Wait,, then go."), "Wait,, then go.");
});

test("code spans are found as the filter takes them out, and a mark that opens nothing so far is found apart from them", () => {
  assert.deepEqual(codeSpansIn("Run `npm test` and ``a `b` c`` now."), [[4, 14], [19, 30]]);
  assert.deepEqual(codeSpansIn("Use \\` here, and `x`."), [[17, 20]]);
  assert.deepEqual(codeSpansIn("No code at all."), []);
  assert.equal(looseMarkIn("Run `npm test` and `npm", codeSpansIn("Run `npm test` and `npm")), 19);
  assert.equal(looseMarkIn("Run `npm test` now.", codeSpansIn("Run `npm test` now.")), null);
  assert.equal(looseMarkIn("Use \\` here.", []), null);
  assert.equal(looseMarkIn("Wait ``for it", []), 5);
});
