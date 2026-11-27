import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mock, test } from "node:test";
import { mutedFrom, mutedLine, onLine, wakeStatus } from "./wake.js";
import { activityOf, createWall, doneFlashMs, heardFlashMs, hubWall, lookingOnWall, mostSaidChars, playOnWall, slotGiver, slots, speakingLingerMs, voiceOnWall, wallBackNote, wallOffLine, wallOnLine, wallOffWhy, wallProblemLine, wallStoppedNote, wordsShownMs, type Counts, type WallReport } from "./wall.js";

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
