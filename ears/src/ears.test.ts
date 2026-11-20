import assert from "node:assert/strict";
import { test } from "node:test";
import { createEars, flippedBeforeText, mutedBeforeText, startsMuted } from "./ears.js";
import type { Recording, Stopped } from "./recorder.js";
import type { ToText } from "./whisper.js";

type Pretend = Recording & { asked: string[]; end(stopped: Partial<Stopped>): void };

function pretendRecording(): Pretend {
  let finish: (stopped: Stopped) => void = () => {};
  const ended = new Promise<Stopped>((resolve) => (finish = resolve));
  const asked: string[] = [];
  let result: Stopped | null = null;
  const end = (stopped: Partial<Stopped>) => {
    if (result !== null) return;
    result = { reason: "x", failed: false, bytes: 3200, ms: 1234, sound: Uint8Array.of(1, 2, 3, 4), ...stopped };
    finish(result);
  };
  return {
    pid: 42,
    asked,
    ended,
    end,
    stop(reason) {
      asked.push(reason);
      end({ reason });
      return ended;
    },
  };
}

function setUp(microphone: "pretend" | "card" | null = "pretend", toText?: ToText) {
  const lines: string[] = [];
  const recordings: Pretend[] = [];
  const clock = { at: 1000 };
  const ears = createEars({
    microphone,
    record: () => {
      const recording = pretendRecording();
      recordings.push(recording);
      return recording;
    },
    log: (line) => lines.push(line),
    toText,
    now: () => clock.at,
  });
  return { ears, lines, recordings, clock };
}

type Turning = { sound: Uint8Array; signal: AbortSignal; answer(text: string): void; fail(error: Error): void };

function pretendWhisper() {
  const asked: Turning[] = [];
  const toText: ToText = (sound, signal) =>
    new Promise<string>((resolve, reject) => {
      asked.push({ sound, signal, answer: resolve, fail: reject });
    });
  return { asked, toText };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("ears starts muted, says why, and refuses to record", () => {
  const { ears, lines, recordings } = setUp();
  assert.deepEqual(ears.view(), { state: "muted", reason: startsMuted, microphone: "pretend", last: null });
  assert.deepEqual(ears.start(), { ok: false, error: "ears is muted" });
  assert.deepEqual([lines, recordings.length], [[], 0]);
});

test("unmuted, it records when asked and stops when asked, logging the start, the stop, why and how long, never the sound", async () => {
  const { ears, lines, recordings } = setUp();
  ears.unmute();
  assert.deepEqual(ears.view(), { state: "idle", reason: null, microphone: "pretend", last: null });
  const started = ears.start();
  assert.deepEqual(started, { ok: true, view: { state: "recording", reason: null, microphone: "pretend", last: null } });
  assert.equal(recordings.length, 1);
  assert.deepEqual(ears.start(), { ok: false, error: "ears is already recording" });
  const stopped = await ears.stop();
  assert.deepEqual(stopped, { ok: true, seconds: 1.2, view: { state: "idle", reason: null, microphone: "pretend", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: null } } });
  assert.deepEqual(recordings[0].asked, ["asked to stop"]);
  assert.deepEqual(lines, ["Unmuted.", "Recording started.", "Recording stopped after 1.2 seconds: asked to stop."]);
  assert.deepEqual(await ears.stop(), { ok: false, error: "ears isn't recording" });
});

test("it stays idle between recordings, and records again", async () => {
  const { ears, recordings } = setUp();
  ears.unmute();
  for (let round = 0; round < 3; round++) {
    assert.equal(ears.start().ok, true);
    assert.equal((await ears.stop()).ok, true);
  }
  assert.equal(recordings.length, 3);
  assert.equal(ears.view().state, "idle");
});

test("muting ends the recording at once: muted straight away, the recorder told to stop, and the stop logged", async () => {
  const { ears, lines, recordings } = setUp();
  ears.unmute();
  ears.start();
  const muting = ears.mute(null);
  assert.equal(ears.view().state, "muted");
  assert.deepEqual(ears.start(), { ok: false, error: "ears is muted" });
  await muting;
  assert.deepEqual(recordings[0].asked, ["muted"]);
  assert.deepEqual(ears.view(), { state: "muted", reason: null, microphone: "pretend", last: { seconds: 1.2, reason: "muted", text: null, textProblem: null } });
  assert.deepEqual(lines.slice(-2), ["Muted.", "Recording stopped after 1.2 seconds: muted."]);
  assert.deepEqual(await ears.stop(), { ok: false, error: "ears isn't recording" });
});

test("a mute with a reason keeps it, and muting again logs nothing new", async () => {
  const { ears, lines } = setUp();
  ears.unmute();
  await ears.mute("ears is shutting down");
  await ears.mute(null);
  assert.deepEqual(ears.view().state, "muted");
  assert.deepEqual(lines, ["Unmuted.", "Muted: ears is shutting down."]);
});

test("a recording that ends at its limit leaves ears idle, saying why the last one stopped", async () => {
  const { ears, lines, recordings } = setUp();
  ears.unmute();
  ears.start();
  recordings[0].end({ reason: "it reached the 30-second limit", ms: 30_004 });
  await tick();
  assert.deepEqual(ears.view(), { state: "idle", reason: null, microphone: "pretend", last: { seconds: 30, reason: "it reached the 30-second limit", text: null, textProblem: null } });
  assert.equal(lines.at(-1), "Recording stopped after 30 seconds: it reached the 30-second limit.");
  assert.equal(ears.start().ok, true);
});

test("a recorder that fails leaves ears failed, recording nothing until it's unmuted again", async () => {
  const { ears, lines, recordings } = setUp();
  ears.unmute();
  ears.start();
  recordings[0].end({ reason: "the recorder ended by itself with code 1", failed: true, ms: 80 });
  await tick();
  assert.deepEqual(ears.view(), { state: "failed", reason: "the recorder ended by itself with code 1", microphone: "pretend", last: { seconds: 0.1, reason: "the recorder ended by itself with code 1", text: null, textProblem: null } });
  assert.equal(lines.at(-1), "Recording failed after 0.1 seconds: the recorder ended by itself with code 1.");
  assert.deepEqual(ears.start(), { ok: false, error: "ears failed (the recorder ended by itself with code 1), so it records nothing until it's unmuted again" });
  ears.unmute();
  assert.equal(ears.view().state, "idle");
  assert.equal(ears.start().ok, true);
});

test("a failed ears can be muted, and stays muted until unmuted", async () => {
  const { ears, recordings } = setUp();
  ears.unmute();
  ears.start();
  recordings[0].end({ reason: "boom", failed: true });
  await tick();
  await ears.mute(null);
  assert.equal(ears.view().state, "muted");
  assert.deepEqual(ears.start(), { ok: false, error: "ears is muted" });
});

test("a recorder that fails while being asked to stop leaves ears failed", async () => {
  const { ears, recordings } = setUp();
  ears.unmute();
  ears.start();
  recordings[0].stop = (reason) => {
    recordings[0].asked.push(reason);
    recordings[0].end({ reason: "the recorder was ended by SIGKILL", failed: true });
    return recordings[0].ended;
  };
  const stopped = await ears.stop();
  assert.equal(stopped.ok && stopped.view.state, "failed");
});

test("a recorder that can't even be started leaves ears failed, saying why", () => {
  const lines: string[] = [];
  const ears = createEars({
    microphone: "pretend",
    record: () => {
      throw new Error("spawn EAGAIN");
    },
    log: (line) => lines.push(line),
  });
  ears.unmute();
  assert.deepEqual(ears.start(), { ok: false, error: "ears failed (the recorder couldn't start: spawn EAGAIN)" });
  assert.deepEqual(ears.view().state, "failed");
  assert.equal(lines.at(-1), "Recording failed to start: the recorder couldn't start: spawn EAGAIN.");
});

test("with no microphone set, unmuting works but recording is refused, and nothing is started", () => {
  const { ears, recordings } = setUp(null);
  ears.unmute();
  assert.deepEqual(ears.start(), { ok: false, error: "no microphone is set, so there's nothing to record from" });
  assert.deepEqual([ears.view().state, ears.view().microphone, recordings.length], ["idle", null, 0]);
});

test("unmuting while idle changes nothing and logs nothing", async () => {
  const { ears, lines } = setUp();
  await ears.unmute();
  await ears.unmute();
  assert.equal(ears.view().state, "idle");
  assert.deepEqual(lines, ["Unmuted."]);
});

test("a new unmute while recording ends the recording, since a mute may have come and gone between two looks at the switch", async () => {
  const { ears, lines, recordings } = setUp();
  await ears.unmute();
  ears.start();
  await ears.unmute();
  assert.deepEqual(recordings[0].asked, ["the switch was flipped while it was recording, so a mute may have come and gone"]);
  assert.deepEqual([ears.view().state, ears.view().last?.reason], ["idle", "the switch was flipped while it was recording, so a mute may have come and gone"]);
  assert.equal(lines.at(-1), "Recording stopped after 1.2 seconds: the switch was flipped while it was recording, so a mute may have come and gone.");
  assert.equal(ears.start().ok, true);
});

test("nothing new can start while a recording is still ending, and a slow stop can't mark a later state wrong", async () => {
  const { ears, recordings } = setUp();
  await ears.unmute();
  ears.start();
  let release: () => void = () => {};
  recordings[0].stop = (reason) => {
    recordings[0].asked.push(reason);
    new Promise<void>((resolve) => (release = resolve)).then(() => recordings[0].end({ reason }));
    return recordings[0].ended;
  };
  const stopping = ears.stop();
  const muting = ears.mute(null);
  await ears.unmute();
  assert.equal(ears.view().state, "idle");
  assert.deepEqual(ears.start(), { ok: false, error: "ears is still ending the last recording" });
  assert.equal(recordings.length, 1);
  release();
  await stopping;
  await muting;
  assert.equal(ears.view().state, "idle");
  assert.equal(ears.start().ok, true);
  assert.equal(recordings.length, 2);
  assert.equal(ears.view().state, "recording");
});

test("a stop arriving while a mute is still ending the recording finds nothing to stop", async () => {
  const { ears, recordings } = setUp();
  ears.unmute();
  ears.start();
  let release: () => void = () => {};
  recordings[0].stop = (reason) => {
    recordings[0].asked.push(reason);
    new Promise<void>((resolve) => (release = resolve)).then(() => recordings[0].end({ reason }));
    return recordings[0].ended;
  };
  const muting = ears.mute(null);
  assert.deepEqual(await ears.stop(), { ok: false, error: "ears isn't recording" });
  release();
  await muting;
  assert.deepEqual(recordings[0].asked, ["muted"]);
});

test("a mute arriving while a stop is still ending the recording wins, and the recorder is asked once", async () => {
  const { ears, recordings } = setUp();
  ears.unmute();
  ears.start();
  let release: () => void = () => {};
  recordings[0].stop = (reason) => {
    recordings[0].asked.push(reason);
    new Promise<void>((resolve) => (release = resolve)).then(() => recordings[0].end({ reason }));
    return recordings[0].ended;
  };
  const stopping = ears.stop();
  assert.equal(ears.view().state, "recording");
  assert.deepEqual(ears.start(), { ok: false, error: "ears is already recording" });
  let muted = false;
  const muting = ears.mute(null).then(() => (muted = true));
  await tick();
  assert.equal(muted, false, "the mute waits for the recording it's ending to be over");
  release();
  await muting;
  const stopped = await stopping;
  assert.equal(stopped.ok && stopped.view.state, "muted");
  assert.deepEqual(recordings[0].asked, ["asked to stop"]);
});

test("with Whisper, a stopped recording is turned into text: working meanwhile, then idle with the text, and the stop answers once it's there", async () => {
  const whisper = pretendWhisper();
  const { ears, lines, recordings, clock } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  assert.deepEqual(whisper.asked.map((turning) => [...turning.sound]), [[1, 2, 3, 4]]);
  assert.equal(ears.view().state, "working");
  assert.deepEqual(ears.view().last, { seconds: 1.2, reason: "asked to stop", text: null, textProblem: null });
  clock.at += 2345;
  whisper.asked[0].answer("Turn the lights on.");
  const stopped = await stopping;
  assert.deepEqual(stopped, { ok: true, seconds: 1.2, view: { state: "idle", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: "Turn the lights on.", textProblem: null } } });
  assert.deepEqual(lines.slice(-2), ["Recording stopped after 1.2 seconds: asked to stop.", "Turned into text in 2.3 seconds."]);
  assert.equal(lines.some((line) => line.includes("lights")), false);
  assert.equal(whisper.asked[0].signal.aborted, false);
});

test("nothing new is recorded while the last recording is being turned into text", async () => {
  const whisper = pretendWhisper();
  const { ears, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  assert.deepEqual(ears.start(), { ok: false, error: "ears is still turning the last recording into text" });
  assert.deepEqual(await ears.stop(), { ok: false, error: "ears isn't recording" });
  assert.equal(recordings.length, 1);
  whisper.asked[0].answer("Done.");
  await stopping;
  assert.equal(ears.start().ok, true);
  assert.equal(recordings.length, 2);
});

test("a recording that reaches its limit is turned into text too, with nobody waiting for it", async () => {
  const whisper = pretendWhisper();
  const { ears, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  recordings[0].end({ reason: "it reached the 30-second limit", ms: 30_004, sound: Uint8Array.of(9, 9) });
  await tick();
  assert.equal(ears.view().state, "working");
  assert.deepEqual([...whisper.asked[0].sound], [9, 9]);
  whisper.asked[0].answer("Long one.");
  await tick();
  assert.deepEqual(ears.view(), { state: "idle", reason: null, microphone: "card", last: { seconds: 30, reason: "it reached the 30-second limit", text: "Long one.", textProblem: null } });
});

test("a mute while it's being turned into text drops it: muted at once, Whisper called off, and no text kept even if it comes anyway", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, lines } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  await ears.mute(null);
  assert.equal(whisper.asked[0].signal.aborted, true);
  whisper.asked[0].answer("Too late.");
  await stopping;
  await tick();
  assert.deepEqual(ears.view(), { state: "muted", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: mutedBeforeText } });
  assert.equal(mutedBeforeText, "it was muted before it was turned into text");
  assert.equal(lines.some((line) => line.startsWith("Turned into text")), false);
  assert.deepEqual(lines.slice(-2), ["Muted.", "Not turned into text: it was muted before it was turned into text."]);
});

test("a new unmute while it's being turned into text drops it too, since a mute may have come and gone", async () => {
  const whisper = pretendWhisper();
  const { ears, lines } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  await ears.unmute();
  assert.equal(whisper.asked[0].signal.aborted, true);
  whisper.asked[0].fail(new Error("called off"));
  await stopping;
  assert.deepEqual(ears.view(), { state: "idle", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: flippedBeforeText } });
  assert.equal(flippedBeforeText, "the switch was flipped before it was turned into text, so a mute may have come and gone");
  assert.equal(lines.at(-1), `Not turned into text: ${flippedBeforeText}.`);
  assert.equal(ears.start().ok, true);
});

test("a new unmute while a stop is still ending the recording keeps it from Whisper too, saying why", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, lines, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  let release: () => void = () => {};
  recordings[0].stop = (reason) => {
    recordings[0].asked.push(reason);
    new Promise<void>((resolve) => (release = resolve)).then(() => recordings[0].end({ reason }));
    return recordings[0].ended;
  };
  const stopping = ears.stop();
  await ears.unmute();
  release();
  const stopped = await stopping;
  assert.equal(whisper.asked.length, 0);
  assert.deepEqual(stopped, { ok: true, seconds: 1.2, view: { state: "idle", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: flippedBeforeText } } });
  assert.equal(lines.at(-1), `Not turned into text: ${flippedBeforeText}.`);
  assert.equal(ears.start().ok, true);
  const again = ears.stop();
  await tick();
  assert.equal(whisper.asked.length, 1, "the next stop is heard again");
  whisper.asked[0].answer("Lights on.");
  await again;
  assert.equal(ears.view().last?.text, "Lights on.");
});

test("a mute that lands just as the text arrives, before ears has taken it, still drops it", async () => {
  let arrived: Promise<string> = Promise.resolve("");
  let answer: (text: string) => void = () => {};
  const { ears, lines } = setUp("card", () => (arrived = new Promise<string>((resolve) => (answer = resolve))));
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  const muting = arrived.then(() => ears.mute(null));
  answer("Too late.");
  await muting;
  await stopping;
  assert.deepEqual(ears.view(), { state: "muted", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: mutedBeforeText } });
  assert.equal(lines.some((line) => line.startsWith("Turned into text")), false);
});

test("once the text is back, a mute or a new unmute leaves it alone", async () => {
  const whisper = pretendWhisper();
  const { ears } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  whisper.asked[0].answer("Lights on.");
  await stopping;
  await ears.unmute();
  assert.deepEqual(ears.view().last, { seconds: 1.2, reason: "asked to stop", text: "Lights on.", textProblem: null });
  await ears.mute(null);
  assert.deepEqual(ears.view(), { state: "muted", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: "Lights on.", textProblem: null } });
});

test("a recording ended by a mute, a new unmute or its recorder failing is never turned into text", async () => {
  const whisper = pretendWhisper();
  const { ears, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  await ears.mute(null);
  await ears.unmute();
  ears.start();
  await ears.unmute();
  ears.start();
  recordings[2].end({ reason: "the recorder ended by itself with code 1", failed: true });
  await tick();
  assert.equal(whisper.asked.length, 0);
  assert.equal(ears.view().state, "failed");
});

test("Whisper failing leaves ears idle, with the problem kept and logged, tidied and cut short", async () => {
  const whisper = pretendWhisper();
  const { ears, lines } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  whisper.asked[0].fail(new Error(`Couldn't reach the Wyoming server at whisper:10300\u0007 (ENOTFOUND)${"x".repeat(300)}`));
  const stopped = await stopping;
  assert.equal(stopped.ok && stopped.view.state, "idle");
  const problem = ears.view().last?.textProblem ?? "";
  assert.equal(problem.length, 200);
  assert.ok(problem.startsWith("Couldn't reach the Wyoming server at whisper:10300 (ENOTFOUND)xx"));
  assert.ok(problem.endsWith("…"));
  assert.equal(lines.at(-1), `Couldn't turn it into text: ${problem}.`);
  assert.equal(ears.start().ok, true);
});

test("what the state shows of the last recording is a copy, so nothing outside can change it", async () => {
  const whisper = pretendWhisper();
  const { ears } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  const seen = ears.view().last;
  whisper.asked[0].answer("Hello.");
  await stopping;
  assert.equal(seen?.text, null);
  if (seen !== null) seen.text = "changed";
  assert.equal(ears.view().last?.text, "Hello.");
});
