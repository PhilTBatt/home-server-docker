import assert from "node:assert/strict";
import { test } from "node:test";
import { speakable } from "./speakable.js";

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
