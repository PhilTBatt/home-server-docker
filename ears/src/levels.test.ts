import assert from "node:assert/strict";
import { test } from "node:test";
import { backgroundLevel, createFrames, createQuietEnd, frameBytes, frameLevel, frameMs, quietestShare, quietForMs, settleMs, speakingAtLeast, speakingLevel, speakingTimes, startWithinMs } from "./levels.js";

function samples(values: number[]): Uint8Array {
  const sound = new Uint8Array(values.length * 2);
  const view = new DataView(sound.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return sound;
}

function steady(level: number, count = frameBytes / 2): Uint8Array {
  return samples(Array.from({ length: count }, (_, index) => (index % 2 === 0 ? level : -level)));
}

test("a frame is a tenth of a second of 16-bit sound at 16,000 Hz, and the settings for ending after the wake word are these", () => {
  assert.deepEqual([frameMs, frameBytes], [100, 3200]);
  assert.deepEqual([quietestShare, speakingTimes, speakingAtLeast, settleMs, startWithinMs, quietForMs], [0.2, 3, 300, 800, 5000, 1500]);
});

test("a frame's level is the root mean square of its samples, rounded, and an odd last byte is left out", () => {
  assert.equal(frameLevel(new Uint8Array(0)), 0);
  assert.equal(frameLevel(steady(0)), 0);
  assert.equal(frameLevel(steady(1000)), 1000);
  assert.equal(frameLevel(steady(-32768, 4)), 32768);
  assert.equal(frameLevel(samples([3, 4])), 4);
  assert.equal(frameLevel(samples([0, 0, 0, 1000])), 500);
  const odd = new Uint8Array(5);
  odd.set(samples([1000, 1000]), 0);
  odd[4] = 0x7f;
  assert.equal(frameLevel(odd), 1000);
  const inside = new Uint8Array(10);
  inside.set(samples([600, 800]), 3);
  assert.equal(frameLevel(inside.subarray(3, 7)), 707);
});

test("the room's background is the level a fifth of the way up the frames heard before the wake word", () => {
  assert.equal(backgroundLevel([]), 0);
  assert.equal(backgroundLevel([70]), 70);
  assert.equal(backgroundLevel([90, 10, 50, 30, 70]), 10);
  assert.equal(backgroundLevel([100, 60, 20, 80, 40, 3000, 5000, 4000, 2000, 1000, 90]), 60);
  const levels = [5, 1, 3];
  backgroundLevel(levels);
  assert.deepEqual(levels, [5, 1, 3]);
});

test("speech is anything three times the background, and never below 300", () => {
  assert.equal(speakingLevel(0), 300);
  assert.equal(speakingLevel(99), 300);
  assert.equal(speakingLevel(100), 300);
  assert.equal(speakingLevel(101), 303);
  assert.equal(speakingLevel(400), 1200);
});

test("frames are cut from sound however it arrives, and the leftover waits for the next piece", () => {
  const frames = createFrames(4);
  assert.deepEqual(frames.push(samples([100])), []);
  assert.deepEqual(frames.push(samples([100, 200, 200, 300])), [100, 200]);
  assert.deepEqual(frames.push(samples([300])), [300]);
  assert.deepEqual(frames.push(samples([1, 1, 1, 1, 1, 1, 1])), [1, 1, 1]);
  frames.clear();
  assert.deepEqual(frames.push(samples([400])), []);
  assert.deepEqual(frames.push(samples([400])), [400]);
  const whole = createFrames();
  assert.deepEqual(whole.push(steady(250, 4000)), [250, 250]);
  assert.deepEqual(whole.push(steady(250, 800)), [250]);
});

function run(quiet: ReturnType<typeof createQuietEnd>, levels: number[]): { at: number | null; why: string | null; spoke?: boolean } {
  for (const [index, level] of levels.entries()) {
    const ended = quiet.push(level);
    if (ended !== null) return { at: (index + 1) * frameMs, why: ended.reason, spoke: ended.spoke };
  }
  return { at: null, why: null };
}

const spoke = (at: number, seconds = "1.5 seconds") => ({ at, why: `it went quiet for ${seconds} after you spoke`, spoke: true });
const silent = (at: number, seconds = "5 seconds") => ({ at, why: `nothing loud enough to be speech came within ${seconds}, so it wasn't sent to Whisper`, spoke: false });

test("after speech, a wake-word recording ends once it has been quiet for a second and a half", () => {
  const quiet = createQuietEnd({ speakingAbove: 300 });
  const levels = [...Array(10).fill(50), ...Array(12).fill(2000), ...Array(14).fill(50), 50, 50];
  assert.deepEqual(run(quiet, levels), spoke(3700));
});

test("a pause shorter than that doesn't end it, and speech after the pause counts", () => {
  const quiet = createQuietEnd({ speakingAbove: 300 });
  const levels = [...Array(10).fill(0), ...Array(5).fill(900), ...Array(14).fill(0), ...Array(5).fill(900), ...Array(20).fill(0)];
  assert.deepEqual(run(quiet, levels), spoke(4900));
});

test("only sound above the speaking level counts as speech, so a level exactly at it is quiet", () => {
  const quiet = createQuietEnd({ speakingAbove: 600, startWithinMs: 2000 });
  assert.deepEqual(run(quiet, Array(30).fill(600)), silent(2000, "2 seconds"));
  const louder = createQuietEnd({ speakingAbove: 600, startWithinMs: 2000 });
  assert.deepEqual(run(louder, [...Array(9).fill(0), 601, ...Array(30).fill(0)]), spoke(2500));
});

test("loud sound in the first 0.8 seconds is the end of the wake word or the chime, so it doesn't count as speech", () => {
  const quiet = createQuietEnd({ speakingAbove: 300 });
  const early = run(quiet, [...Array(8).fill(5000), ...Array(60).fill(0)]);
  assert.deepEqual(early, silent(5000));
  const justAfter = createQuietEnd({ speakingAbove: 300 });
  assert.deepEqual(run(justAfter, [...Array(8).fill(0), 5000, ...Array(60).fill(0)]), spoke(2400));
});

test("with no speech at all it ends after 5 seconds, and each setting can be changed", () => {
  assert.deepEqual(run(createQuietEnd({ speakingAbove: 300 }), Array(80).fill(10)), silent(5000));
  assert.deepEqual(run(createQuietEnd({ speakingAbove: 300, startWithinMs: 1000 }), Array(80).fill(10)), silent(1000, "1 second"));
  assert.deepEqual(run(createQuietEnd({ speakingAbove: 300, settleMs: 0, quietForMs: 1000 }), [400, ...Array(20).fill(0)]), spoke(1100, "1 second"));
  assert.deepEqual(run(createQuietEnd({ speakingAbove: 300, settleMs: 300 }), [0, 0, 0, 400, ...Array(20).fill(0)]), spoke(1900));
});
