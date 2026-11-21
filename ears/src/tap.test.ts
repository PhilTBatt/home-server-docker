import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuietEnd, frameBytes } from "./levels.js";
import { startTap } from "./tap.js";

function loud(level: number, frames = 1): Uint8Array {
  const sound = new Uint8Array(frameBytes * frames);
  const view = new DataView(sound.buffer);
  for (let index = 0; index < sound.length / 2; index++) view.setInt16(index * 2, index % 2 === 0 ? level : -level, true);
  return sound;
}

test("a tap keeps the sound from before it started, then what's pushed, and hands it all back when it's stopped", { timeout: 5_000 }, async () => {
  const clock = { at: 100 };
  const tap = startTap({ by: "wake", before: Uint8Array.of(9, 9), now: () => clock.at });
  assert.deepEqual([tap.by, tap.pid], ["wake", undefined]);
  tap.push(Uint8Array.of(1, 2));
  const piece = Uint8Array.of(3, 4, 5, 6);
  tap.push(piece);
  piece.fill(0);
  clock.at = 1300;
  const stopped = await tap.stop("asked to stop");
  assert.deepEqual({ ...stopped, sound: [...stopped.sound] }, { reason: "asked to stop", failed: false, bytes: 6, ms: 1200, sound: [9, 9, 1, 2, 3, 4, 5, 6] });
  assert.equal(await tap.ended, stopped);
  tap.push(Uint8Array.of(7, 7));
  assert.equal(await tap.stop("again"), stopped);
  tap.fail("too late");
  assert.equal(await tap.ended, stopped);
});

test("a tap copies what it's pushed, so a Buffer the recorder uses again can't change it", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "push" });
  const piece = Buffer.from([1, 2, 3, 4]);
  tap.push(piece);
  piece.fill(0);
  assert.deepEqual([...(await tap.stop("asked to stop")).sound], [1, 2, 3, 4]);
});

test("a push tap has nothing from before, and a tap that fails says why", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "push" });
  tap.push(Uint8Array.of(1, 2, 3));
  tap.fail("the microphone stopped (the recorder ended by itself with code 1)");
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.failed, [...stopped.sound], stopped.bytes], ["the microphone stopped (the recorder ended by itself with code 1)", true, [1, 2], 3]);
});

test("a tap ends itself at its time limit", { timeout: 5_000 }, async () => {
  const began = performance.now();
  const stopped = await startTap({ by: "push", limitMs: 200 }).ended;
  assert.deepEqual([stopped.reason, stopped.failed], ["it reached the 0.2-second limit", false]);
  assert.ok(performance.now() - began >= 190);
});

test("a tap stopped early cancels its time limit, so nothing keeps the process waiting", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "push", limitMs: 60_000 });
  await tap.stop("asked to stop");
});

test("a tap that's pushed more than its limit allows keeps what fitted and ends", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "push", maxBytes: 5 });
  tap.push(Uint8Array.of(1, 2));
  tap.push(Uint8Array.of(3, 4));
  tap.push(Uint8Array.of(5, 6));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, [...stopped.sound], stopped.bytes], ["more sound came than the time limit allows", [1, 2, 3, 4], 6]);
  const roomy = startTap({ by: "push", limitMs: 1000 });
  roomy.push(new Uint8Array(40_000));
  roomy.push(new Uint8Array(1));
  assert.equal((await roomy.ended).reason, "more sound came than the time limit allows");
});

test("a wake tap ends itself when its quiet check says so, keeping the sound up to there", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, quietForMs: 300 }) });
  tap.push(loud(1000, 2));
  tap.push(loud(0, 2));
  let over = false;
  void tap.ended.then(() => (over = true));
  await Promise.resolve();
  assert.equal(over, false);
  tap.push(loud(0, 2));
  const stopped = await tap.ended;
  assert.equal(stopped.reason, "it went quiet for 0.3 seconds after you spoke");
  assert.equal(stopped.unheard, undefined, "it heard speech, so it goes to Whisper");
  assert.equal(stopped.sound.length, frameBytes * 6);
  tap.push(loud(1000));
  assert.equal((await tap.ended).sound.length, frameBytes * 6);
});

test("a tap's quiet check sees frames cut across pushes, and a push tap has no quiet check", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, quietForMs: 200 }) });
  const sound = new Uint8Array([...loud(1000), ...loud(0, 2)]);
  for (let at = 0; at < sound.length; at += 1000) tap.push(sound.subarray(at, at + 1000));
  assert.equal((await tap.ended).reason, "it went quiet for 0.2 seconds after you spoke");
  const push = startTap({ by: "push", limitMs: 100, maxBytes: 10_000_000 });
  push.push(loud(1000));
  for (let frame = 0; frame < 100; frame++) push.push(loud(0));
  assert.equal((await push.ended).reason, "it reached the 0.1-second limit");
});

test("a wake tap with no speech in it ends marked unheard, so it isn't sent to Whisper", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, startWithinMs: 300 }) });
  tap.push(loud(100, 3));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.unheard, stopped.failed], ["nothing loud enough to be speech came within 0.3 seconds, so it wasn't sent to Whisper", true, false]);
  const asked = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300 }) });
  asked.push(loud(100, 3));
  assert.equal((await asked.stop("asked to stop")).unheard, undefined, "stopped by Enter, it's sent whatever it holds");
});

test("a tap takes exactly its limit's worth, and ends only past it", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "push", maxBytes: 4 });
  tap.push(Uint8Array.of(1, 2, 3, 4));
  const stopped = await tap.stop("asked to stop");
  assert.deepEqual([stopped.reason, [...stopped.sound]], ["asked to stop", [1, 2, 3, 4]]);
});

test("a tap hands back whole samples only", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "push", before: Uint8Array.of(1) });
  tap.push(Uint8Array.of(2, 3, 4, 5));
  const stopped = await tap.stop("asked to stop");
  assert.deepEqual([...stopped.sound], [1, 2, 3, 4]);
});
