import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mock, test } from "node:test";
import { mutedFrom, mutedLine, onLine, wakeStatus } from "./wake.js";
import { captionChars, captionParts, captionTimes, activityOf, createWall, doneFlashMs, heardFlashMs, hubWall, lookingOnWall, mostSaidChars, playOnWall, slotGiver, slots, speakingLingerMs, voiceOnWall, wallBackNote, wallOffLine, wallOnLine, wallOffWhy, wallProblemLine, wallStoppedNote, wordsShownMs, type Counts, type WallReport } from "./wall.js";

const still: Counts = { needs: 0, playing: 0, speakingUntil: 0, looking: 0, thinking: 0, listening: false, heardUntil: 0, doneUntil: 0 };

test("what he's doing is picked in a fixed order, the one that needs you first", () => {
  assert.equal(activityOf(still, 100), "waiting");
  assert.equal(activityOf({ ...still, doneUntil: 200 }, 100), "done");
  assert.equal(activityOf({ ...still, doneUntil: 200, thinking: 1 }, 100), "thinking");
  assert.equal(activityOf({ ...still, thinking: 1, looking: 1 }, 100), "looking");
  assert.equal(activityOf({ ...still, looking: 1, listening: true }, 100), "listening");
  assert.equal(activityOf({ ...still, listening: true, heardUntil: 200 }, 100), "heard");
  assert.equal(activityOf({ ...still, heardUntil: 200, playing: 1 }, 100), "speaking");
  assert.equal(activityOf({ ...still, speakingUntil: 200 }, 100), "speaking");
  assert.equal(activityOf({ ...still, speakingUntil: 100 }, 100), "waiting");
  assert.equal(activityOf({ ...still, playing: 1, needs: 1 }, 100), "needs");
});

test("each known voice gets the next free slot and keeps it, so up to five never share, and no name leaves", () => {
  const slotFor = slotGiver();
  assert.deepEqual(["sam", "alex", "sam", "jo", "dad", "kim", "alex"].map(slotFor), [0, 1, 0, 2, 3, 4, 1]);
  assert.equal(slotFor("lee"), 0, "a sixth voice has to share");
  assert.equal(slots, 5);
  assert.deepEqual(voiceOnWall({ who: "sam", owner: false, score: 0.8 }, slotFor), { voice: "other", slot: 0 });
  assert.deepEqual(voiceOnWall({ who: "pat", owner: true, score: 0.9 }, slotFor), { voice: "owner", slot: null });
  assert.deepEqual(voiceOnWall({ who: null, owner: false, score: 0.1 }, slotFor), { voice: "unknown", slot: null });
  assert.deepEqual(voiceOnWall(undefined, slotFor), { voice: null, slot: null });
});

test("the muted line is read from ears's status exactly, and anything else is unknown", () => {
  const answer = { status: 200, state: "muted", reason: null, error: null, seconds: null, last: null, version: 1 };
  assert.equal(wakeStatus(answer), mutedLine);
  assert.equal(wakeStatus({ ...answer, state: "idle", wake: { on: true, listening: true, held: false, problem: null } }), onLine);
  assert.equal(mutedFrom(mutedLine), true);
  assert.equal(mutedFrom(onLine), false);
  assert.equal(mutedFrom("off: ears answered 500"), null);
});

function recorder() {
  const sent: WallReport[] = [];
  const notes: string[] = [];
  let failWith: Error | null = null;
  const clock = { at: 1000 };
  const wall = createWall({
    send: async (report) => {
      if (failWith !== null) throw failWith;
      sent.push(report);
    },
    now: () => clock.at,
    note: (line) => void notes.push(line),
    gapMs: 0,
    heartbeatMs: 60_000,
  });
  return { wall, sent, notes, clock, fail: (error: Error | null) => (failWith = error), last: () => sent[sent.length - 1] };
}

async function settled() {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setImmediate(resolve));
}

test("thinking, his words, a yes and the end are told to the hub as they happen", async () => {
  const { wall, last } = recorder();
  const answer = wall.chat.answer();
  await settled();
  assert.deepEqual(last(), { activity: "thinking", muted: null, heard: null, said: null });
  answer.text("Bins ");
  answer.text("tonight.");
  await settled();
  assert.equal(last().said, "Bins tonight.");
  let yes: (value: string) => void = () => {};
  const asking = answer.asking(new Promise<string>((resolve) => (yes = resolve)));
  await settled();
  assert.equal(last().activity, "needs");
  yes("yes");
  assert.equal(await asking, "yes");
  await settled();
  assert.equal(last().activity, "thinking");
  answer.end(true);
  await settled();
  assert.equal(last().activity, "done");
  assert.equal(last().said, "Bins tonight.");
  wall.close();
});

test("an answer that starts again drops the words from before", async () => {
  const { wall, last } = recorder();
  const answer = wall.chat.answer();
  answer.text("Bins are on Thurs");
  await settled();
  answer.restart();
  await settled();
  assert.equal(last().said, null);
  answer.text("The bins go out tonight.");
  await settled();
  assert.equal(last().said, "The bins go out tonight.");
  answer.end(true);
  answer.restart();
  await settled();
  assert.equal(last().said, "The bins go out tonight.", "once ended, a restart changes nothing");
  wall.close();
});

test("a failed answer isn't done, and ending twice counts once", async () => {
  const { wall, last } = recorder();
  const answer = wall.chat.answer();
  answer.end(false);
  answer.end(true);
  await settled();
  assert.equal(last().activity, "waiting");
  wall.close();
});

test("done waits until he has stopped speaking, then flashes for a while", async () => {
  const { wall, last, clock } = recorder();
  let spoken: () => void = () => {};
  wall.speech(new Promise<void>((resolve) => (spoken = resolve)));
  const answer = wall.chat.answer();
  answer.end(true);
  await settled();
  assert.equal(last().activity, "waiting");
  spoken();
  await settled();
  assert.equal(last().activity, "done");
  clock.at += doneFlashMs + 1;
  await new Promise((resolve) => setTimeout(resolve, 20));
  wall.chat.listening(false);
  wall.muted(true);
  await settled();
  assert.equal(last().activity, "waiting");
  wall.close();
});

test("speaking lasts while a sentence plays, and a moment after, so the gaps between sentences don't flicker", async () => {
  const { wall, last, clock } = recorder();
  let played: () => void = () => {};
  const playing = wall.during("speaking", () => new Promise<void>((resolve) => (played = resolve)));
  await settled();
  assert.equal(last().activity, "speaking");
  played();
  await playing;
  await settled();
  assert.equal(last().activity, "speaking");
  clock.at += speakingLingerMs + 1;
  wall.muted(false);
  await settled();
  assert.equal(last().activity, "waiting");
  wall.close();
});

test("a look-up shows while it runs, and gives back what it gave", async () => {
  const { wall, last } = recorder();
  let found: (value: string) => void = () => {};
  const looking = wall.during("looking", () => new Promise<string>((resolve) => (found = resolve)));
  await settled();
  assert.equal(last().activity, "looking");
  found("an answer");
  assert.equal(await looking, "an answer");
  await settled();
  assert.equal(last().activity, "waiting");
  wall.close();
});

test("a look-up or a sentence that fails still lets go", async () => {
  const { wall, last } = recorder();
  await assert.rejects(wall.during("looking", async () => Promise.reject(new Error("no"))));
  await settled();
  assert.equal(last().activity, "waiting");
  wall.close();
});

test("Hey Jarvis flashes heard, then listening shows until the recording ends", async () => {
  const { wall, last, clock } = recorder();
  wall.chat.woke();
  wall.chat.listening(true);
  await settled();
  assert.equal(last().activity, "heard");
  clock.at += heardFlashMs + 1;
  await new Promise((resolve) => setTimeout(resolve, heardFlashMs + 50));
  assert.equal(last().activity, "listening");
  wall.chat.listening(false);
  await settled();
  assert.equal(last().activity, "waiting");
  wall.close();
});

test("what was heard goes with its voice, tidied, and an empty one is ignored", async () => {
  const { wall, last } = recorder();
  wall.chat.heard({ text: "  what's   on\ntonight ", recordedMs: 1, textMs: 1, voice: { who: "sam", owner: false, score: 0.7 } });
  await settled();
  assert.deepEqual(last().heard, { text: "what's on tonight", voice: "other", slot: 0 });
  wall.chat.heard({ text: "and you", recordedMs: 1, textMs: 1, voice: { who: "alex", owner: false, score: 0.7 } });
  await settled();
  assert.deepEqual(last().heard, { text: "and you", voice: "other", slot: 1 });
  wall.chat.heard({ text: "what's on tonight", recordedMs: 1, textMs: 1, voice: { who: "sam", owner: false, score: 0.7 } });
  wall.chat.heard({ text: "   ", recordedMs: 1, textMs: 1 });
  await settled();
  assert.equal(last().heard?.text, "what's on tonight");
  wall.close();
});

test("the quiet chat for the phone shows the work but never the words", async () => {
  const { wall, last } = recorder();
  const quiet = wall.chat.quiet;
  assert.equal(quiet.quiet, quiet);
  quiet.heard({ text: "a phone question", recordedMs: 1, textMs: 1 });
  const answer = quiet.answer();
  answer.text("A private answer.");
  await settled();
  assert.deepEqual(last(), { activity: "thinking", muted: null, heard: null, said: null });
  answer.end(true);
  await settled();
  assert.equal(last().said, null);
  wall.close();
});

test("a new answer clears the last one's words, and a long answer keeps its last words", async () => {
  const { wall, last } = recorder();
  const first = wall.chat.answer();
  first.text("Old words.");
  first.end(true);
  const second = wall.chat.answer();
  await settled();
  assert.equal(last().said, null);
  second.text(`${"word ".repeat(200)}the end.`);
  await settled();
  const said = last().said ?? "";
  assert.ok(said.length <= mostSaidChars);
  assert.ok(said.endsWith("the end."));
  assert.ok(said.startsWith("word"));
  second.end(true);
  wall.close();
});

test("words are forgotten after a while, so a heartbeat doesn't keep showing them", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    const sent: WallReport[] = [];
    const wall = createWall({ send: async (report) => void sent.push(report), gapMs: 0, heartbeatMs: 60_000, now: () => 0 });
    wall.chat.heard({ text: "what's on", recordedMs: 1, textMs: 1 });
    const answer = wall.chat.answer();
    answer.text("Bins tonight.");
    answer.end(true);
    await settled();
    assert.deepEqual([sent[sent.length - 1].heard?.text, sent[sent.length - 1].said], ["what's on", "Bins tonight."]);
    mock.timers.tick(wordsShownMs - 1);
    await settled();
    assert.equal(sent[sent.length - 1].said, "Bins tonight.");
    mock.timers.tick(2);
    await settled();
    assert.deepEqual([sent[sent.length - 1].heard, sent[sent.length - 1].said], [null, null]);
    wall.close();
  } finally {
    mock.timers.reset();
  }
});

test("new words start their time again", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    const sent: WallReport[] = [];
    const wall = createWall({ send: async (report) => void sent.push(report), gapMs: 0, heartbeatMs: 60_000, now: () => 0 });
    wall.chat.heard({ text: "one", recordedMs: 1, textMs: 1 });
    mock.timers.tick(wordsShownMs - 10);
    wall.chat.heard({ text: "two", recordedMs: 1, textMs: 1 });
    mock.timers.tick(20);
    await settled();
    assert.equal(sent[sent.length - 1].heard?.text, "two");
    wall.close();
  } finally {
    mock.timers.reset();
  }
});

test("muted is told once when it changes", async () => {
  const { wall, sent } = recorder();
  wall.muted(true);
  wall.muted(true);
  await settled();
  assert.deepEqual(sent.map((report) => report.muted), [true]);
  wall.muted(null);
  await settled();
  assert.equal(sent[sent.length - 1].muted, null);
  wall.close();
});

test("when the hub stops answering it's noted once, and again once it's back", async () => {
  const { wall, notes, fail } = recorder();
  fail(new Error("fetch failed"));
  wall.muted(true);
  await settled();
  wall.muted(false);
  await settled();
  assert.deepEqual(notes, [wallStoppedNote("fetch failed")]);
  fail(null);
  wall.muted(true);
  await settled();
  wall.muted(false);
  await settled();
  assert.deepEqual(notes, [wallStoppedNote("fetch failed"), wallBackNote]);
  wall.close();
});

test("the first report says whether the hub is showing him", async () => {
  const ok = recorder();
  assert.equal(await ok.wall.ready(), wallOnLine);
  assert.equal(await ok.wall.ready(), wallOnLine);
  ok.wall.close();
  const off = recorder();
  off.fail(new Error(wallOffWhy));
  assert.equal(await off.wall.ready(), wallOffLine);
  off.wall.close();
  const down = recorder();
  down.fail(new Error("fetch failed"));
  assert.equal(await down.wall.ready(), wallProblemLine("fetch failed"));
  down.wall.close();
});

test("the heartbeat sends the same report again, so the hub knows he's running", async () => {
  const sent: WallReport[] = [];
  const wall = createWall({ send: async (report) => void sent.push(report), gapMs: 0, heartbeatMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 75));
  wall.close();
  const count = sent.length;
  assert.ok(count >= 2, String(count));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(sent.length, count, "nothing is sent once closed");
});

test("reports sent close together are merged, so the hub isn't flooded", async () => {
  const sent: WallReport[] = [];
  let release: () => void = () => {};
  const wall = createWall({
    send: (report) => {
      sent.push(report);
      return sent.length === 1 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
    },
    gapMs: 0,
    heartbeatMs: 60_000,
  });
  wall.muted(true);
  for (let i = 0; i < 20; i++) wall.chat.listening(i % 2 === 0);
  release();
  await settled();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].activity, "waiting");
  wall.close();
});

test("playing and looking up are wrapped only when the wall is on", async () => {
  const parts = { play: async (_sound: Uint8Array, _signal: AbortSignal) => {}, make: async () => new Uint8Array(1) };
  assert.equal(playOnWall(parts, undefined), parts);
  const ask = async (question: string, _signal: AbortSignal) => question;
  assert.equal(lookingOnWall(ask, undefined), ask);
  const { wall, sent, clock } = recorder();
  await playOnWall(parts, wall).play(new Uint8Array(2), new AbortController().signal);
  await settled();
  assert.ok(sent.some((report) => report.activity === "speaking"));
  clock.at += speakingLingerMs + 1;
  let found: () => void = () => {};
  const slow = (question: string, _signal: AbortSignal) => new Promise<string>((resolve) => (found = () => resolve(question)));
  const looking = lookingOnWall(slow, wall)("why", new AbortController().signal);
  await settled();
  assert.equal(sent[sent.length - 1].activity, "looking");
  found();
  assert.equal(await looking, "why");
  assert.equal(await lookingOnWall(ask, wall)("how", new AbortController().signal), "how");
  wall.close();
});

test("the hub is told with his token, as JSON, and its answers are read in plain words", async () => {
  const seen: { auth: string | undefined; type: string | undefined; body: string; url: string | undefined }[] = [];
  const statuses = [200, 404, 401, 500];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (part) => (body += part));
    request.on("end", () => {
      seen.push({ auth: request.headers.authorization, type: request.headers["content-type"], body, url: request.url });
      response.statusCode = statuses.shift() ?? 200;
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = hubWall("the-token", url);
  const report: WallReport = { activity: "speaking", muted: false, heard: null, said: "Hi." };
  try {
    await send(report, new AbortController().signal);
    await assert.rejects(send(report, new AbortController().signal), { message: wallOffWhy });
    await assert.rejects(send(report, new AbortController().signal), { message: "the hub refused his token" });
    await assert.rejects(send(report, new AbortController().signal), { message: "the hub answered 500" });
  } finally {
    server.close();
  }
  assert.deepEqual(seen[0], { auth: "Bearer the-token", type: "application/json", body: JSON.stringify(report), url: "/wall/jarvis" });
});

test("a caption is one piece when it fits, or whole sentences joined up to the caption's size", () => {
  assert.equal(captionChars, 160);
  assert.deepEqual(captionParts("  The bins go out tonight.  "), ["The bins go out tonight."]);
  assert.deepEqual(captionParts(""), []);
  const sentences = `${"a".repeat(70)}. ${"b".repeat(70)}. ${"c".repeat(70)}.`;
  assert.deepEqual(captionParts(sentences), [`${"a".repeat(70)}. ${"b".repeat(70)}.`, `${"c".repeat(70)}.`]);
});

test("a sentence too long for one caption is split at its commas, then between words, never mid-word unless a word is longer than a caption", () => {
  const clauses = `${"one ".repeat(30).trim()}, ${"two ".repeat(30).trim()}, three`;
  const parts = captionParts(clauses);
  assert.ok(parts.every((part) => part.length <= 160), JSON.stringify(parts));
  assert.equal(parts.join(" "), clauses);
  const words = "word ".repeat(80).trim();
  const split = captionParts(words);
  assert.ok(split.length >= 3 && split.every((part) => part.length <= 160 && !part.startsWith(" ") && !part.endsWith(" ")));
  assert.equal(split.join(" "), words);
  const huge = "x".repeat(400);
  assert.deepEqual(captionParts(huge).map((part) => part.length), [160, 160, 80]);
});

test("each part of a split caption comes in at its share of the sound's time, by length", () => {
  assert.deepEqual(captionTimes(["aaaa", "bb", "cccc"], 1000), [0, 400, 600]);
  assert.deepEqual(captionTimes(["one"], 2500), [0]);
});

test("with his voice on, his words show only as each piece starts playing, beginning first, and stay until the next", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const answer = wall.chat.answer();
  answer.text("The bins go out tonight. ");
  answer.text("And the recycling.");
  await settled();
  assert.equal(last().said, null, "nothing runs ahead of his voice");
  answer.caption({ text: "The bins go out tonight.", ms: 1500 });
  await settled();
  assert.equal(last().said, "The bins go out tonight.");
  answer.end(true);
  await settled();
  assert.equal(last().said, "The bins go out tonight.", "the last caption stays up after the text has all come");
  answer.caption({ text: "And the recycling.", ms: 1200 });
  await settled();
  assert.equal(last().said, "And the recycling.");
  wall.close();
});

test("a piece too long for one caption is split and timed across its speech", async () => {
  const { wall, sent, last } = recorder();
  wall.voiced(true);
  const answer = wall.chat.answer();
  const first = "a".repeat(120);
  const second = "b".repeat(120);
  answer.caption({ text: `${first}, ${second}`, ms: 60 });
  await settled();
  assert.equal(last().said, `${first},`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await settled();
  assert.equal(last().said, second);
  assert.ok(sent.some((report) => report.said === `${first},`));
  wall.close();
});

test("a new piece or a restart drops a split caption's later parts, so an old one can't come in late", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const answer = wall.chat.answer();
  answer.caption({ text: `${"a".repeat(120)}, ${"b".repeat(120)}`, ms: 40 });
  answer.caption({ text: "Next one.", ms: 500 });
  await new Promise((resolve) => setTimeout(resolve, 70));
  await settled();
  assert.equal(last().said, "Next one.");
  answer.caption({ text: `${"c".repeat(120)}, ${"d".repeat(120)}`, ms: 40 });
  answer.restart();
  await new Promise((resolve) => setTimeout(resolve, 70));
  await settled();
  assert.equal(last().said, null);
  wall.close();
});

test("a typed question's speech is never captioned, and neither is anything with his voice off", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const quiet = wall.chat.quiet.answer();
  quiet.caption({ text: "Your private answer.", ms: 1000 });
  quiet.text("Your private answer.");
  quiet.end(true);
  await settled();
  assert.equal(last().said, null);
  const off = recorder();
  const answer = off.wall.chat.answer();
  answer.caption({ text: "Never shown this way.", ms: 1000 });
  answer.text("Shown as it's written.");
  await settled();
  assert.equal(off.last().said, "Shown as it's written.", "voice off keeps the old way");
  wall.close();
  off.wall.close();
});

test("with his voice on but nothing spoken, the answer still shows once it's done", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const answer = wall.chat.answer();
  answer.text("Kokoro was down, so this was never spoken.");
  answer.end(true);
  await settled();
  assert.equal(last().said, "Kokoro was down, so this was never spoken.");
  const failed = wall.chat.answer();
  failed.text("Half an ans");
  failed.end(false);
  await settled();
  assert.equal(last().said, null, "a failed answer isn't shown");
  wall.close();
});

test("playing on the wall hands each piece's text and length to the caption, and the text on to the player", async () => {
  const { wall } = recorder();
  const got: Array<[number, string | undefined]> = [];
  const pieces: Array<{ text: string; ms: number }> = [];
  const parts = { play: async (sound: Uint8Array, _signal: AbortSignal, text?: string) => void got.push([sound.length, text]) };
  const played = playOnWall(parts, wall, 24_000, (piece) => void pieces.push(piece));
  await played.play(new Uint8Array(48_000), new AbortController().signal, "One second of sound.");
  await played.play(new Uint8Array(4), new AbortController().signal);
  assert.deepEqual(pieces, [{ text: "One second of sound.", ms: 1000 }]);
  assert.deepEqual(got, [[48_000, "One second of sound."], [4, undefined]]);
  wall.close();
});

test("a piece already stopped before it plays never puts its caption up", async () => {
  const { wall } = recorder();
  const pieces: Array<{ text: string; ms: number }> = [];
  const parts = { play: async (_sound: Uint8Array, _signal: AbortSignal, _text?: string) => {} };
  const stopped = new AbortController();
  stopped.abort();
  await playOnWall(parts, wall, 24_000, (piece) => void pieces.push(piece)).play(new Uint8Array(48_000), stopped.signal, "Never said.");
  assert.deepEqual(pieces, []);
  wall.close();
});

const longPiece = `${"a".repeat(120)}, ${"b".repeat(120)}, ${"c".repeat(120)}`;

test("a piece stopped part-way, by a cut-in, a new question or Ctrl+C, drops its later caption parts, so words he never said can't show", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const answer = wall.chat.answer();
  const parts = { play: (_sound: Uint8Array, signal: AbortSignal, _text?: string) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })) };
  const played = playOnWall(parts, wall, 24_000, (piece) => answer.caption(piece));
  const stopping = new AbortController();
  const playing = played.play(new Uint8Array(24_000 * 2 * 0.3), stopping.signal, longPiece);
  await settled();
  assert.equal(last().said, `${"a".repeat(120)},`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  stopping.abort();
  await playing;
  await new Promise((resolve) => setTimeout(resolve, 300));
  await settled();
  assert.equal(last().said, `${"a".repeat(120)},`, "the parts after the stop never came");
  wall.close();
});

test("a piece whose sound fails to play drops its later caption parts too", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const answer = wall.chat.answer();
  const parts = { play: async (_sound: Uint8Array, _signal: AbortSignal, _text?: string): Promise<void> => Promise.reject(new Error("aplay failed")) };
  const played = playOnWall(parts, wall, 24_000, (piece) => answer.caption(piece));
  await assert.rejects(played.play(new Uint8Array(24_000 * 2 * 0.06), new AbortController().signal, longPiece), /aplay failed/);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await settled();
  assert.equal(last().said, `${"a".repeat(120)},`);
  wall.close();
});

test("a new question heard stops the last answer's caption parts still to come, so they can't push in front of what you said", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const answer = wall.chat.answer();
  answer.caption({ text: longPiece, ms: 60 });
  wall.chat.heard({ text: "What's next?", recordedMs: 1000, textMs: 200 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await settled();
  assert.equal(last().said, `${"a".repeat(120)},`);
  assert.equal(last().heard?.text, "What's next?");
  wall.close();
});

test("a new answer stops the last one's caption parts still to come", async () => {
  const { wall, last } = recorder();
  wall.voiced(true);
  const first = wall.chat.answer();
  first.caption({ text: longPiece, ms: 60 });
  wall.chat.answer();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await settled();
  assert.equal(last().said, null);
  wall.close();
});
