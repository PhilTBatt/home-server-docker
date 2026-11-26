import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuietEnd, createSpeechEnd, frameBytes } from "./levels.js";
import type { Detector } from "./silero.js";
import { detectorBehindMs, startTap } from "./tap.js";

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

test("a wake tap's stop carries what its speech check measured, only once it has heard speech, and a push tap's carries none", { timeout: 5_000 }, async () => {
  const tap = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, quietForMs: 300 }) });
  tap.push(loud(0));
  tap.push(loud(1000, 2));
  tap.push(loud(0));
  tap.push(loud(1000));
  tap.push(loud(0, 3));
  assert.deepEqual((await tap.ended).speech, { firstMs: 200, speechMs: 300, longestPauseMs: 100 });
  const silent = startTap({ by: "follow", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, startWithinMs: 300 }) });
  silent.push(loud(0, 3));
  assert.equal("speech" in (await silent.ended), false);
  const early = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0 }) });
  early.push(loud(0, 2));
  assert.equal("speech" in (await early.stop("asked to stop")), false);
  const spoken = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0 }) });
  spoken.push(loud(1000));
  assert.deepEqual((await spoken.stop("asked to cancel")).speech, { firstMs: 100, speechMs: 100, longestPauseMs: 0 });
  const push = startTap({ by: "push" });
  push.push(loud(1000, 3));
  assert.equal("speech" in (await push.stop("asked to stop")), false);
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

function pretendDetector(chances: (frame: Uint8Array) => number[] | Promise<number[]>) {
  const judged: number[] = [];
  const detector: Detector = {
    async frame(sound) {
      judged.push(new DataView(sound.buffer, sound.byteOffset, sound.length).getInt16(0, true));
      return chances(sound);
    },
  };
  return { detector, judged };
}

const speechIn = (frame: Uint8Array) => (Math.abs(new DataView(frame.buffer, frame.byteOffset, frame.length).getInt16(0, true)) >= 1000 ? [0.9] : [0.1]);

test("a wake tap with the speech detector ends when it hears no speech for long enough after you spoke, keeping the sound, and says so", { timeout: 5_000 }, async () => {
  const { detector, judged } = pretendDetector(speechIn);
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 300 }), fallback: () => assert.fail("it fell back") }, ender: "silero" });
  tap.push(loud(1000, 2));
  tap.push(loud(5, 3));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.unheard, stopped.ender, stopped.sound.length], ["the speech detector heard no speech for 0.3 seconds after you spoke", undefined, "silero", frameBytes * 5]);
  assert.deepEqual(judged, [1000, 1000, 5, 5, 5]);
  assert.deepEqual(stopped.speech, { firstMs: 100, speechMs: 200, longestPauseMs: 0 }, "the detector's tenths are measured too");
});

test("the speech detector judges loud sound that isn't speech as quiet, so a fan or the kettle doesn't keep a recording going", { timeout: 5_000 }, async () => {
  const { detector } = pretendDetector(() => [0.05]);
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, startWithinMs: 300 }), fallback: () => true }, ender: "silero" });
  tap.push(loud(8000, 3));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.unheard], ["the speech detector heard no speech within 0.3 seconds, so it wasn't sent to Whisper", true]);
});

test("frames are judged one at a time in order even when the detector is slow, and nothing judged after the tap ends counts", { timeout: 5_000 }, async () => {
  let release: () => void = () => {};
  let calls = 0;
  const { detector, judged } = pretendDetector(async (frame) => {
    calls++;
    if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
    return speechIn(frame);
  });
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 100 }), fallback: () => false }, ender: "silero" });
  tap.push(loud(1000));
  tap.push(loud(5, 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(judged, [1000]);
  const stopped = await tap.stop("asked to stop");
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(stopped.reason, "asked to stop");
  assert.deepEqual(judged, [1000]);
});

test("a detector that fails says why once, isn't asked again, and the rest of that recording ends on loudness", { timeout: 5_000 }, async () => {
  const said: string[] = [];
  const levels: number[] = [];
  let calls = 0;
  const detector: Detector = {
    async frame() {
      calls++;
      throw new Error("the model\nbroke");
    },
  };
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 300 }), fallback: (level) => (levels.push(level), level > 300), failed: (why) => void said.push(why) }, ender: "silero" });
  tap.push(loud(1000, 2));
  tap.push(loud(5, 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  tap.push(loud(5));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.ender], ["it went quiet for 0.3 seconds after you spoke", "silero"]);
  assert.deepEqual([calls, said, levels], [1, ["the model broke"], [1000, 1000, 5, 5, 5]]);
});

test("a detector whose oldest waiting frame has waited more than a second is given up on, saying so once, and the frames waiting for it and the rest are judged on loudness, in order, until it ends", { timeout: 5_000 }, async () => {
  assert.equal(detectorBehindMs, 1_000);
  const clock = { at: 0 };
  const said: string[] = [];
  const levels: number[] = [];
  const { detector, judged } = pretendDetector(() => new Promise<number[]>(() => {}));
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 300 }), fallback: (level) => (levels.push(level), level > 300), failed: (why) => void said.push(why) }, ender: "silero", now: () => clock.at });
  clock.at = 5_000;
  tap.push(loud(1000, 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  clock.at = 6_000;
  tap.push(loud(5, 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual([said, levels, judged], [[], [], [1000]], "a second behind is still waited for, timed from when the frame came");
  clock.at = 6_001;
  tap.push(loud(5, 3));
  tap.push(loud(7));
  assert.deepEqual(said, ["it fell more than 1 second behind"]);
  assert.deepEqual(levels, [1000, 1000, 5, 5, 5], "nothing is judged after the end");
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.unheard, stopped.ender], ["it went quiet for 0.3 seconds after you spoke", undefined, "silero"]);
  assert.deepEqual(judged, [1000]);
});

test("an answer the detector gives after it was given up on is ignored", { timeout: 5_000 }, async () => {
  const answers: ((chances: number[]) => void)[] = [];
  const detector: Detector = { frame: () => new Promise<number[]>((resolve) => answers.push(resolve)) };
  const levels: number[] = [];
  const clock = { at: 0 };
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 1_000 }), fallback: (level) => (levels.push(level), level > 300) }, ender: "silero", now: () => clock.at });
  tap.push(loud(1000, 2));
  await new Promise((resolve) => setTimeout(resolve, 10));
  clock.at = 1_001;
  tap.push(loud(5, 9));
  assert.deepEqual([answers.length, levels.length], [1, 11]);
  answers[0]([0.1]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  let ended = false;
  void tap.ended.then(() => (ended = true));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ended, false, "the late answer didn't count as a tenth of quiet");
  tap.push(loud(5));
  assert.equal((await tap.ended).reason, "it went quiet for 1 second after you spoke");
  assert.equal(levels.length, 12);
});

test("more than a second of sound arriving at once is still judged by the detector, since none of it has waited", { timeout: 5_000 }, async () => {
  const said: string[] = [];
  const { detector, judged } = pretendDetector(speechIn);
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 300 }), fallback: () => assert.fail("it fell back"), failed: (why) => void said.push(why) }, ender: "silero", now: () => 0 });
  tap.push(loud(1000, 12));
  tap.push(loud(5, 3));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, said, judged.length], ["the speech detector heard no speech for 0.3 seconds after you spoke", [], 15]);
});

test("a detector that's slow but keeps within a second is waited for, and never given up on", { timeout: 5_000 }, async () => {
  const said: string[] = [];
  const { detector, judged } = pretendDetector(async (frame) => (await new Promise((resolve) => setTimeout(resolve, 5)), speechIn(frame)));
  const tap = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 300 }), fallback: () => assert.fail("it fell back"), failed: (why) => void said.push(why) }, ender: "silero" });
  tap.push(loud(1000, 2));
  tap.push(loud(5, 8));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, said], ["the speech detector heard no speech for 0.3 seconds after you spoke", []]);
  assert.deepEqual(judged, [1000, 1000, 5, 5, 5]);
});

test("a wake tap names how it was set to end, however it ended, a push tap names nothing, and the detector isn't asked when there's only the loudness check", { timeout: 5_000 }, async () => {
  const loudness = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, quietForMs: 100 }), ender: "loudness" });
  loudness.push(loud(1000));
  loudness.push(loud(0));
  assert.equal((await loudness.ended).ender, "loudness");
  const { detector } = pretendDetector(() => [0.9]);
  const sent = startTap({ by: "wake", judged: { detector, end: createSpeechEnd({ by: "silero" }), fallback: () => true }, ender: "silero" });
  assert.deepEqual([(await sent.stop("asked to stop")).ender, (await startTap({ by: "wake", quiet: null, ender: "loudness" }).stop("asked to stop")).ender], ["silero", "loudness"]);
  const push = startTap({ by: "push" });
  assert.equal("ender" in (await push.stop("asked to stop")), false);
});

function wordsTap(options: { judging?: boolean; usualMs?: number; by?: "wake" | "follow" | "button" } = {}) {
  const asked: { sound: Uint8Array; signal: AbortSignal; answer: (text: string) => void; fail: () => void }[] = [];
  let changes = 0;
  const usualMs = options.usualMs ?? 1500;
  const tap = startTap({
    by: options.by ?? "wake",
    quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, quietForMs: usualMs }),
    words: {
      toText: (sound, signal) => new Promise<string>((resolve, reject) => asked.push({ sound, signal, answer: resolve, fail: () => reject(new Error("no Whisper")) })),
      usualMs,
      judging: () => options.judging === true,
      changed: () => changes++,
    },
  });
  let stopped: Awaited<typeof tap.ended> | null = null;
  void tap.ended.then((end) => (stopped = end));
  const quiet = async (frames: number) => {
    for (let frame = 0; frame < frames && stopped === null; frame++) {
      tap.push(loud(0));
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  const speak = async (frames = 3) => {
    tap.push(loud(1000, frames));
    await new Promise((resolve) => setImmediate(resolve));
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { tap, asked, quiet, speak, settle, ended: () => stopped, changes: () => changes };
}

test("with the word check, a tap looks at what's been said once the pause reaches 0.4 seconds, handing over all the sound so far", { timeout: 5_000 }, async () => {
  const { tap, asked, quiet, speak } = wordsTap();
  await speak(3);
  await quiet(3);
  assert.equal(asked.length, 0, "0.3 seconds of quiet isn't long enough to look");
  await quiet(1);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].sound.length, frameBytes * 7);
  await quiet(5);
  assert.equal(asked.length, 1, "one look for each pause");
  await tap.stop("done");
});

test("words that read as finished end the recording 0.7 seconds after the last speech, and their text is handed on so Whisper isn't asked twice", { timeout: 5_000 }, async () => {
  const { asked, quiet, speak, settle, ended } = wordsTap();
  await speak();
  await quiet(4);
  asked[0].answer("  What's   the weather? ");
  await settle();
  assert.equal(ended(), null, "0.4 seconds isn't 0.7 yet");
  await quiet(2);
  assert.equal(ended(), null);
  await quiet(1);
  const stopped = ended();
  assert.equal(stopped?.reason, "it went quiet for 0.7 seconds after you spoke");
  assert.deepEqual([stopped?.text, stopped?.words], ["What's the weather?", { looks: 1, verdict: "done", by: "rules" }]);
  const late = wordsTap();
  await late.speak();
  await late.quiet(10);
  late.asked[0].answer("What's the weather?");
  await late.settle();
  await late.quiet(1);
  assert.equal(late.ended()?.reason, "it went quiet for 0.7 seconds after you spoke", "an answer that comes after 0.7 seconds ends it on the next frame");
  const slow = wordsTap({ usualMs: 500 });
  await slow.speak();
  await slow.quiet(4);
  slow.asked[0].answer("What's the weather?");
  await slow.settle();
  await slow.quiet(1);
  assert.equal(slow.ended()?.reason, "it went quiet for 0.5 seconds after you spoke", "a usual pause shorter than 0.7 seconds is kept");
});

test("words that read as unfinished make it wait 3.5 seconds, or the usual pause if that's longer, and speaking again starts over", { timeout: 5_000 }, async () => {
  const { asked, quiet, speak, settle, ended } = wordsTap();
  await speak();
  await quiet(4);
  asked[0].answer("Add milk, eggs and");
  await settle();
  await quiet(30);
  assert.equal(ended(), null, "3.4 seconds of quiet, well past the usual 1.5");
  await quiet(1);
  assert.equal(ended()?.reason, "it went quiet for 3.5 seconds after you spoke");
  assert.deepEqual([ended()?.text, ended()?.words], ["Add milk, eggs and", { looks: 1, verdict: "more", by: "rules" }]);
  const long = wordsTap({ usualMs: 4000 });
  await long.speak();
  await long.quiet(4);
  long.asked[0].answer("and");
  await long.settle();
  await long.quiet(36);
  assert.equal(long.ended()?.reason, "it went quiet for 4 seconds after you spoke");
  const again = wordsTap();
  await again.speak();
  await again.quiet(4);
  again.asked[0].answer("Add milk, eggs and");
  await again.settle();
  await again.quiet(20);
  await again.speak(2);
  await again.quiet(4);
  assert.equal(again.asked.length, 2, "the new pause is looked at afresh");
  assert.equal(again.asked[1].sound.length, frameBytes * 33);
  await again.quiet(10);
  assert.equal(again.ended(), null);
  await again.quiet(1);
  assert.equal(again.ended()?.reason, "it went quiet for 1.5 seconds after you spoke", "with no answer for the new pause, the usual pause applies again");
  assert.deepEqual([again.ended()?.text, again.ended()?.words], [undefined, { looks: 2, verdict: null, by: null }]);
});

test("unsure words keep the usual pause, and a look that fails or answers too late changes nothing", { timeout: 5_000 }, async () => {
  const unsure = wordsTap();
  await unsure.speak();
  await unsure.quiet(4);
  unsure.asked[0].answer("turn the lights off");
  await unsure.settle();
  assert.equal(unsure.tap.asking(), null, "no chat is judging, so nothing is asked");
  await unsure.quiet(11);
  assert.equal(unsure.ended()?.reason, "it went quiet for 1.5 seconds after you spoke");
  assert.deepEqual([unsure.ended()?.text, unsure.ended()?.words], ["turn the lights off", { looks: 1, verdict: "unsure", by: "rules" }]);
  const failing = wordsTap();
  await failing.speak();
  await failing.quiet(4);
  failing.asked[0].fail();
  await failing.settle();
  await failing.quiet(11);
  assert.deepEqual([failing.ended()?.reason, failing.ended()?.text, failing.ended()?.words], ["it went quiet for 1.5 seconds after you spoke", undefined, { looks: 1, verdict: null, by: null }]);
  const stale = wordsTap();
  await stale.speak();
  await stale.quiet(4);
  await stale.speak(1);
  assert.equal(stale.asked[0].signal.aborted, true, "speaking again calls the look off");
  stale.asked[0].answer("What's the weather?");
  await stale.settle();
  await stale.quiet(8);
  assert.equal(stale.ended(), null, "the stale answer didn't shorten the new pause");
  const ending = wordsTap();
  await ending.speak();
  await ending.quiet(4);
  const stopped = await ending.tap.stop("asked to stop");
  assert.equal(ending.asked[0].signal.aborted, true, "ending calls the look off");
  ending.asked[0].answer("What's the weather?");
  await ending.settle();
  assert.deepEqual([stopped.text, stopped.words], [undefined, { looks: 1, verdict: null, by: null }]);
});

test("with a chat judging, unsure words are put to it, the recording waits up to 1.5 seconds more for its answer, and its answer is taken once", { timeout: 5_000 }, async () => {
  const { tap, asked, quiet, speak, settle, ended, changes } = wordsTap({ judging: true });
  await speak();
  await quiet(6);
  asked[0].answer("turn the lights off");
  await settle();
  assert.deepEqual(tap.asking(), { n: 1, text: "turn the lights off" });
  assert.equal(changes(), 1);
  await quiet(14);
  assert.equal(ended(), null, "2 seconds of quiet: the chat has until 0.6 + 1.5");
  assert.equal(tap.judge(2, "done"), false, "not the question that's waiting");
  assert.equal(tap.judge(1, "more"), true);
  assert.equal(tap.asking(), null);
  assert.equal(tap.judge(1, "done"), false, "already answered");
  assert.equal(changes(), 2);
  await quiet(14);
  assert.equal(ended(), null);
  await quiet(1);
  assert.equal(ended()?.reason, "it went quiet for 3.5 seconds after you spoke");
  assert.deepEqual(ended()?.words, { looks: 1, verdict: "more", by: "chat" });
  assert.equal(tap.asking(), null);
  assert.equal(tap.judge(1, "done"), false, "it has ended");
  const done = wordsTap({ judging: true });
  await done.speak();
  await done.quiet(4);
  done.asked[0].answer("turn the lights off");
  await done.settle();
  await done.quiet(5);
  assert.equal(done.tap.judge(1, "done"), true);
  await done.quiet(1);
  assert.deepEqual([done.ended()?.reason, done.ended()?.text, done.ended()?.words], ["it went quiet for 0.7 seconds after you spoke", "turn the lights off", { looks: 1, verdict: "done", by: "chat" }]);
  const silent = wordsTap({ judging: true });
  await silent.speak();
  await silent.quiet(4);
  silent.asked[0].answer("turn the lights off");
  await silent.settle();
  await silent.quiet(14);
  assert.equal(silent.ended(), null, "1.8 seconds: still inside the chat's 1.5 from when it was asked at 0.4");
  await silent.quiet(1);
  assert.equal(silent.ended()?.reason, "it went quiet for 1.9 seconds after you spoke", "a chat that never answers costs at most its 1.5 seconds");
  const moved = wordsTap({ judging: true });
  await moved.speak();
  await moved.quiet(4);
  moved.asked[0].answer("turn the lights off");
  await moved.settle();
  await moved.speak(1);
  assert.equal(moved.tap.asking(), null, "speaking again withdraws the question");
  assert.equal(moved.tap.judge(1, "done"), false);
  assert.equal(moved.changes(), 2);
  await moved.tap.stop("done");
});

test("a tap with no pause check, like /talk's, never looks at the words, and one that heard no speech hands on no text", { timeout: 5_000 }, async () => {
  let asked = 0;
  const words = { toText: async () => (asked++, "hello."), usualMs: 1500 };
  const push = startTap({ by: "push", words });
  push.push(loud(1000, 3));
  push.push(loud(0, 10));
  await new Promise((resolve) => setImmediate(resolve));
  const stopped = await push.stop("asked to stop");
  assert.deepEqual([asked, stopped.words, stopped.text, push.asking(), push.judge(1, "done")], [0, undefined, undefined, null, false]);
  const unheard = startTap({ by: "wake", quiet: createQuietEnd({ speakingAbove: 300, settleMs: 0, startWithinMs: 500, quietForMs: 1500 }), words });
  unheard.push(loud(0, 5));
  const ended = await unheard.ended;
  assert.deepEqual([asked, ended.unheard, ended.text, ended.words], [0, true, undefined, { looks: 0, verdict: null, by: null }]);
});

test("the speech detector's taps look at the words the same way", { timeout: 5_000 }, async () => {
  const answers: ((text: string) => void)[] = [];
  const detector: Detector = { frame: async (frame) => (new DataView(frame.buffer, frame.byteOffset).getInt16(0, true) !== 0 ? [0.9] : [0.01]) };
  const tap = startTap({
    by: "wake",
    judged: { detector, end: createSpeechEnd({ by: "silero", settleMs: 0, quietForMs: 1500 }), fallback: () => false },
    words: { toText: () => new Promise<string>((resolve) => answers.push(resolve)), usualMs: 1500 },
  });
  const flush = async () => {
    for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setImmediate(resolve));
  };
  tap.push(loud(1000, 3));
  tap.push(loud(0, 4));
  await flush();
  assert.equal(answers.length, 1);
  answers[0]("That's all.");
  await flush();
  tap.push(loud(0, 3));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.text], ["the speech detector heard no speech for 0.7 seconds after you spoke", "That's all."]);
});

test("words the rules can judge are never put to a chat, a recording that failed gives no text, and a recording that's over asks nothing", { timeout: 5_000 }, async () => {
  const first = wordsTap({ judging: true });
  await first.speak();
  await first.quiet(4);
  first.asked[0].answer("What time is it?");
  await first.settle();
  assert.equal(first.tap.asking(), null, "the rules said finished, so there's nothing to ask");
  first.tap.fail("the microphone stopped (x)");
  const failed = await first.tap.ended;
  assert.deepEqual([failed.failed, failed.text, failed.words], [true, undefined, { looks: 1, verdict: "done", by: "rules" }]);
  const second = wordsTap({ judging: true });
  await second.speak();
  await second.quiet(4);
  second.asked[0].answer("turn the lights off");
  await second.settle();
  assert.deepEqual(second.tap.asking(), { n: 1, text: "turn the lights off" });
  await second.tap.stop("asked to stop");
  assert.equal(second.tap.asking(), null);
  assert.equal(second.tap.judge(1, "done"), false);
});
