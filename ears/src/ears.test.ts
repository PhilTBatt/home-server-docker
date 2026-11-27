import assert from "node:assert/strict";
import { test } from "node:test";
import { cancelledBeforeText, notYourVoice, voiceNotChecked, voiceTooQuiet, voiceCheckMs, type VoiceGate, claimMs, clearedByCancel, clearedByMute, createEars, failedBeforeText, flippedBeforeText, movedOn, mutedBeforeText, notTakenWhy, saysStopListening, secondsText, speechLine, startsMuted, stopListeningWhy, stoppedListening, thatOneEnded, wordsLine } from "./ears.js";
import type { Recording, Stopped } from "./recorder.js";
import type { VoiceResult } from "./voice-id.js";
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

async function until(done: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!done()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await tick();
  }
}

test("ears starts muted, says why, and refuses to record", () => {
  const { ears, lines, recordings } = setUp();
  assert.deepEqual(ears.view(), { state: "muted", reason: startsMuted, microphone: "pretend", last: null });
  assert.deepEqual(ears.start(), { ok: false, error: "ears is muted" });
  assert.deepEqual([lines, recordings.length], [[], 0]);
});

test("a recording whose speech was measured logs a line of its own after the stop, with when speech was first heard, how much and the longest pause, never the words", async () => {
  const lines: string[] = [];
  let end: (stopped: Stopped) => void = () => {};
  const ears = createEars({
    microphone: "pretend",
    record: () => ({ pid: 1, ended: new Promise<Stopped>((resolve) => (end = resolve)), stop: () => new Promise<Stopped>(() => {}) }),
    log: (line) => lines.push(line),
  });
  ears.unmute();
  ears.start();
  end({ reason: "it went quiet for 1.5 seconds after you spoke", failed: false, bytes: 2, ms: 4200, sound: Uint8Array.of(1, 2), speech: { firstMs: 1300, speechMs: 2100, longestPauseMs: 900 } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(lines.slice(-2), ["Recording stopped after 4.2 seconds: it went quiet for 1.5 seconds after you spoke.", "Speech in it: first heard after 1.3 seconds, 2.1 seconds of speech, longest pause between words 0.9 seconds."]);
  assert.equal(speechLine({ firstMs: 1000, speechMs: 100, longestPauseMs: 0 }), "Speech in it: first heard after 1 second, 0.1 seconds of speech, longest pause between words 0 seconds.");
});

test("unmuted, it records when asked and stops when asked, logging the start, the stop, why and how long, never the sound", async () => {
  const { ears, lines, recordings } = setUp();
  ears.unmute();
  assert.deepEqual(ears.view(), { state: "idle", reason: null, microphone: "pretend", last: null });
  const started = ears.start();
  assert.deepEqual(started, { ok: true, view: { state: "recording", reason: null, microphone: "pretend", last: null }, id: 1 });
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

test("when all it heard is stop listening, ears keeps no text, says why, and mutes itself until it's unmuted again", async () => {
  const whisper = pretendWhisper();
  const { ears, lines } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  whisper.asked[0].answer("Hey Jarvis, stop listening.");
  await stopping;
  await until(() => ears.view().state === "muted");
  assert.deepEqual(ears.view(), { state: "muted", reason: stopListeningWhy, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: stoppedListening } });
  assert.deepEqual(lines.slice(-3), ["Turned into text in 0 seconds.", "Heard its spoken code word to stop, so ears is muting itself.", "Muted: it heard its spoken code word to stop."], "the log names the code word, never what was said");
  assert.equal(stoppedListening, "you said stop listening, so ears muted itself. Unmute it on the server with bash host/ears.sh unmute");
  assert.deepEqual(ears.start(), { ok: false, error: "ears is muted" });
  await ears.unmute();
  assert.equal(ears.view().state, "idle");
  ears.start();
  const next = ears.stop();
  await tick();
  whisper.asked[1].answer("Stop listening to the radio.");
  assert.deepEqual([(await next).ok, ears.view().state, ears.view().last?.text], [true, "idle", "Stop listening to the radio."], "more than the code word isn't ears's to take, so it keeps the text");
});

test("stop listening is heard however it's written, with a greeting or a please, but only on its own", () => {
  for (const said of ["Stop listening.", "stop listening", "STOP LISTENING!", "Hey Jarvis, stop listening.", "Jarvis, stop listening please.", "OK Jarvis stop listening now", "Stop listening, thanks.", "Stop listening, thank you, Jarvis.", " stop   listening ", "Stop. Listening.", "Please stop listening.", "Stop listening for now.", "Stop listening for a bit, thanks.", "Thanks, stop listening.", "...vis. Stop listening.", "Hey Jarvis, okay, stop listening.", "No, stop listening.", "Actually, stop listening.", "Stop listening, cheers.", "Stop listening then.", "Stop listening, OK.", "Thanks Jarvis, stop listening."]) assert.equal(saysStopListening(said), true, said);
  for (const said of ["Stop listening to the radio.", "Don't stop listening.", "Can you stop listening?", "Stop.", "Listening.", "", "Hey Jarvis.", "Stop listening and play music.", "Stop listening please Jarvis do the lights."]) assert.equal(saysStopListening(said), false, said);
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

test("once the text is back, a new unmute leaves it alone, but a mute clears it, saying so", async () => {
  const whisper = pretendWhisper();
  const { ears, lines } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  whisper.asked[0].answer("Lights on.");
  await stopping;
  await ears.unmute();
  assert.deepEqual(ears.view().last, { seconds: 1.2, reason: "asked to stop", text: "Lights on.", textProblem: null });
  await ears.mute(null);
  assert.deepEqual(ears.view(), { state: "muted", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: clearedByMute } });
  assert.deepEqual(lines.slice(-2), ["Muted.", "Cleared the last recording's text, since it was muted."]);
  assert.equal(clearedByMute, "it was cleared by a mute");
  await ears.mute("again");
  assert.equal(lines.length, lines.lastIndexOf("Cleared the last recording's text, since it was muted.") + 1, "a second mute has nothing left to clear");
});

test("a mute with no text kept has nothing to clear, and logs only the mute", async () => {
  const { ears, lines } = setUp("card");
  await ears.unmute();
  ears.start();
  await ears.stop();
  await ears.mute(null);
  assert.deepEqual(ears.view().last, { seconds: 1.2, reason: "asked to stop", text: null, textProblem: null });
  assert.equal(lines.at(-1), "Muted.");
});

test("cancelling a recording ends it without sending it to Whisper, logging why", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, lines, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const cancelled = await ears.cancel();
  assert.deepEqual(cancelled, { ok: true, seconds: 1.2, view: { state: "idle", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to cancel", text: null, textProblem: null } } });
  assert.deepEqual(recordings[0].asked, ["asked to cancel"]);
  assert.equal(whisper.asked.length, 0);
  assert.equal(lines.at(-1), "Recording stopped after 1.2 seconds: asked to cancel.");
  assert.equal(ears.start().ok, true);
});

test("cancelling while it's being turned into text drops the text, even if it comes", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, lines } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  assert.equal(ears.view().state, "working");
  const cancelled = await ears.cancel();
  whisper.asked[0].answer("Too late.");
  await stopping;
  assert.equal(whisper.asked[0].signal.aborted, true);
  assert.deepEqual(cancelled, { ok: true, seconds: 1.2, view: { state: "idle", reason: null, microphone: "card", last: { seconds: 1.2, reason: "asked to stop", text: null, textProblem: cancelledBeforeText } } });
  assert.deepEqual(ears.view().last, { seconds: 1.2, reason: "asked to stop", text: null, textProblem: cancelledBeforeText });
  assert.equal(lines.at(-1), `Not turned into text: ${cancelledBeforeText}.`);
  assert.equal(cancelledBeforeText, "it was cancelled before it was turned into text");
});

test("cancelling while a stop is still ending the recording keeps it from Whisper, and answers once the stop is done", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  let release: () => void = () => {};
  recordings[0].stop = (reason) => {
    recordings[0].asked.push(reason);
    new Promise<void>((resolve) => (release = resolve)).then(() => recordings[0].end({ reason }));
    return recordings[0].ended;
  };
  const stopping = ears.stop();
  const cancelling = ears.cancel();
  await ears.unmute();
  release();
  const [stopped, cancelled] = await Promise.all([stopping, cancelling]);
  assert.equal(whisper.asked.length, 0);
  const last = { seconds: 1.2, reason: "asked to stop", text: null, textProblem: cancelledBeforeText };
  assert.deepEqual(stopped, { ok: true, seconds: 1.2, view: { state: "idle", reason: null, microphone: "card", last } });
  assert.deepEqual(cancelled, { ok: true, seconds: 1.2, view: { state: "idle", reason: null, microphone: "card", last } });
  assert.deepEqual(recordings[0].asked, ["asked to stop"], "the recorder is asked once, and the flip after the cancel doesn't change why");
});

test("whichever comes first while a stop is ending, a new unmute or a cancel, is the reason given", { timeout: 5_000 }, async () => {
  for (const [first, why] of [["unmute", flippedBeforeText], ["cancel", cancelledBeforeText]] as const) {
    const whisper = pretendWhisper();
    const { ears, recordings } = setUp("card", whisper.toText);
    await ears.unmute();
    ears.start();
    let release: () => void = () => {};
    recordings[0].stop = (reason) => {
      recordings[0].asked.push(reason);
      new Promise<void>((resolve) => (release = resolve)).then(() => recordings[0].end({ reason }));
      return recordings[0].ended;
    };
    const stopping = ears.stop();
    const both = first === "unmute" ? [ears.unmute(), ears.cancel()] : [ears.cancel(), ears.unmute()];
    release();
    await Promise.all([stopping, ...both]);
    assert.equal(whisper.asked.length, 0, first);
    assert.equal(ears.view().last?.textProblem, why, first);
  }
});

test("a cancel while a new unmute is ending a later recording isn't answered with an earlier stop", { timeout: 5_000 }, async () => {
  const { ears, recordings } = setUp("card");
  await ears.unmute();
  ears.start();
  await ears.stop();
  ears.start();
  let release: () => void = () => {};
  recordings[1].stop = (reason) => {
    recordings[1].asked.push(reason);
    new Promise<void>((resolve) => (release = resolve)).then(() => recordings[1].end({ reason, ms: 5000 }));
    return recordings[1].ended;
  };
  const flipping = ears.unmute();
  assert.deepEqual(await ears.cancel(), { ok: false, error: "ears isn't recording" });
  release();
  await flipping;
  assert.equal(ears.view().last?.seconds, 5);
});

test("cancelling once a recording has ended by itself and been turned into text clears the text, saying so", async () => {
  const whisper = pretendWhisper();
  const { ears, lines, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  recordings[0].end({ reason: "it reached the 30-second limit", ms: 30_000 });
  await tick();
  whisper.asked[0].answer("Words I meant to drop.");
  await tick();
  assert.equal(ears.view().last?.text, "Words I meant to drop.");
  assert.deepEqual(await ears.cancel(), { ok: true, seconds: 30, view: { state: "idle", reason: null, microphone: "card", last: { seconds: 30, reason: "it reached the 30-second limit", text: null, textProblem: clearedByCancel } } });
  assert.equal(lines.at(-1), "Cleared the last recording's text, since it was cancelled.");
  assert.equal(clearedByCancel, "it was cancelled after it was turned into text, so it was cleared");
  assert.deepEqual(await ears.cancel(), { ok: false, error: "ears isn't recording" }, "with nothing left to clear, a second cancel is refused");
  assert.equal(ears.start().ok, true);
});

test("a mute or a new unmute while a cancel is ending the recording leaves nothing sent to Whisper", { timeout: 5_000 }, async () => {
  for (const during of ["mute", "unmute"] as const) {
    const whisper = pretendWhisper();
    const { ears, recordings } = setUp("card", whisper.toText);
    await ears.unmute();
    ears.start();
    let release: () => void = () => {};
    recordings[0].stop = (reason) => {
      recordings[0].asked.push(reason);
      new Promise<void>((resolve) => (release = resolve)).then(() => recordings[0].end({ reason }));
      return recordings[0].ended;
    };
    const cancelling = ears.cancel();
    const other = during === "mute" ? ears.mute(null) : ears.unmute();
    release();
    await Promise.all([cancelling, other]);
    assert.equal(whisper.asked.length, 0, during);
    assert.equal(ears.view().state, during === "mute" ? "muted" : "idle", during);
    assert.deepEqual(recordings[0].asked, ["asked to cancel"], during);
  }
});

test("with nothing recording or being turned into text, cancelling is refused and nothing changes", async () => {
  const { ears, lines } = setUp("card");
  assert.deepEqual(await ears.cancel(), { ok: false, error: "ears isn't recording" });
  await ears.unmute();
  assert.deepEqual(await ears.cancel(), { ok: false, error: "ears isn't recording" });
  ears.start();
  await ears.stop();
  const before = lines.length;
  assert.deepEqual(await ears.cancel(), { ok: false, error: "ears isn't recording" });
  assert.equal(lines.length, before);
  assert.equal(ears.view().state, "idle");
});

test("whole seconds are said as one second or so many seconds, and tenths are kept", () => {
  assert.equal(secondsText(1000), "1 second");
  assert.equal(secondsText(1040), "1 second");
  assert.equal(secondsText(1060), "1.1 seconds");
  assert.equal(secondsText(2000), "2 seconds");
  assert.equal(secondsText(0), "0 seconds");
  assert.equal(secondsText(17_640), "17.6 seconds");
});

test("a recording or a text that takes a second is logged as 1 second", async () => {
  const whisper = pretendWhisper();
  const { ears, lines, recordings, clock } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start();
  recordings[0].stop = (reason) => {
    recordings[0].asked.push(reason);
    recordings[0].end({ reason, ms: 1000 });
    return recordings[0].ended;
  };
  const stopping = ears.stop();
  await tick();
  clock.at += 1000;
  whisper.asked[0].answer("Hi.");
  await stopping;
  assert.deepEqual(lines.slice(-2), ["Recording stopped after 1 second: asked to stop.", "Turned into text in 1 second."]);
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

function setUpCounted(toText?: ToText, claimAfterMs?: number) {
  const lines: string[] = [];
  const recordings: Pretend[] = [];
  const asked: string[] = [];
  let changes = 0;
  const ears = createEars({
    microphone: "card",
    record: (by) => {
      asked.push(by);
      const recording = pretendRecording();
      recordings.push(recording);
      return recording;
    },
    log: (line) => lines.push(line),
    toText,
    changed: () => void changes++,
    claimMs: claimAfterMs,
  });
  return { ears, lines, recordings, asked, changes: () => changes };
}

test("a recording is a push one unless the wake word started it, and each is numbered from 1", { timeout: 5_000 }, async () => {
  const { ears, lines, asked, recordings } = setUpCounted();
  assert.deepEqual([ears.current(), ears.lastId()], [null, null]);
  await ears.unmute();
  ears.start();
  assert.deepEqual(asked, ["push"]);
  assert.deepEqual(ears.current(), { id: 1, by: "push", claimed: true });
  assert.equal(lines.at(-1), "Recording started.");
  await ears.stop();
  assert.deepEqual([ears.current(), ears.lastId()], [null, 1]);
  ears.start("wake");
  assert.deepEqual(asked, ["push", "wake"]);
  assert.deepEqual(ears.current(), { id: 2, by: "wake", claimed: false });
  assert.equal(lines.at(-1), "Recording started by the wake word.");
  assert.equal(ears.lastId(), 1);
  recordings[1].end({ reason: "it went quiet for 1.5 seconds after you spoke" });
  await tick();
  assert.deepEqual([ears.current(), ears.lastId(), ears.view().last?.reason], [null, 2, "it went quiet for 1.5 seconds after you spoke"]);
});

test("a follow-up recording is taken by whoever asked for it from the start, so nobody needs to claim it and it isn't dropped for want of a claim", { timeout: 5_000 }, async () => {
  const { ears, lines, asked, recordings } = setUpCounted(undefined, 30);
  await ears.unmute();
  ears.start("follow");
  assert.deepEqual([asked, ears.current(), lines.at(-1)], [["follow"], { id: 1, by: "follow", claimed: true }, "Recording started to hear a follow-up."]);
  assert.equal(ears.claim(1).ok, false);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual([ears.view().state, ears.current()?.id], ["recording", 1]);
  recordings[0].end({ reason: "it went quiet for 1.5 seconds after you spoke" });
  await tick();
  assert.deepEqual([ears.current(), ears.lastId(), ears.view().last?.reason], [null, 1, "it went quiet for 1.5 seconds after you spoke"]);
});

test("what current gives is a copy", { timeout: 5_000 }, async () => {
  const { ears } = setUpCounted();
  await ears.unmute();
  ears.start("wake");
  const seen = ears.current();
  if (seen !== null) seen.claimed = true;
  assert.equal(ears.current()?.claimed, false);
  await ears.cancel();
});

test("a chat claims a wake-word recording once, by its number, while it's still recording", { timeout: 5_000 }, async () => {
  const { ears, lines } = setUpCounted();
  await ears.unmute();
  assert.deepEqual(ears.claim(1), { ok: false, error: "that wake-word recording isn't waiting to be taken" });
  ears.start("wake");
  for (const id of [0, 2, -1]) assert.equal(ears.claim(id).ok, false, String(id));
  const claimed = ears.claim(1);
  assert.equal(claimed.ok, true);
  assert.equal(lines.at(-1), "A Jarvis chat took the wake-word recording.");
  assert.deepEqual(ears.current(), { id: 1, by: "wake", claimed: true });
  assert.deepEqual(ears.claim(1), { ok: false, error: "that wake-word recording isn't waiting to be taken" });
  await ears.stop();
  ears.start();
  assert.equal(ears.claim(2).ok, false, "a push recording isn't claimed");
  await ears.stop();
});

test("a wake-word recording can't be claimed once it's ending", { timeout: 5_000 }, async () => {
  const { ears, recordings } = setUpCounted();
  await ears.unmute();
  ears.start("wake");
  const slow = recordings[0];
  const stopping = ears.stop();
  assert.equal(ears.claim(1).ok, false);
  slow.end({});
  await stopping;
});

test("a wake-word recording that no chat claims within 2 seconds is dropped without being turned into text", { timeout: 5_000 }, async () => {
  assert.deepEqual([claimMs, notTakenWhy], [2000, "no Jarvis chat took it within 2 seconds"]);
  const whisper = pretendWhisper();
  const { ears, recordings, lines } = setUpCounted(whisper.toText, 50);
  await ears.unmute();
  ears.start("wake");
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(recordings[0].asked, [notTakenWhy]);
  assert.deepEqual([ears.view().state, ears.view().last?.reason, ears.view().last?.text], ["idle", notTakenWhy, null]);
  assert.equal(whisper.asked.length, 0);
  assert.equal(lines.at(-1), `Recording stopped after 1.2 seconds: ${notTakenWhy}.`);
});

test("a talk-button recording waits to be taken like a wake-word one, says so in the log, and is dropped if no chat takes it", { timeout: 5_000 }, async () => {
  const { ears, lines, asked, recordings } = setUpCounted(undefined, 50);
  await ears.unmute();
  ears.start("button");
  assert.deepEqual([asked, ears.current(), lines.at(-1)], [["button"], { id: 1, by: "button", claimed: false }, "Recording started by the talk button."]);
  assert.equal(ears.speechHeard(), false, "a recording that can't tell has heard none");
  assert.equal(ears.claim(1).ok, true);
  assert.equal(lines.at(-1), "A Jarvis chat took the talk-button recording.");
  assert.deepEqual(ears.current(), { id: 1, by: "button", claimed: true });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual([ears.view().state, recordings[0].asked], ["recording", []], "a taken one isn't dropped");
  await ears.stop();
  ears.start("button");
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual([recordings[1].asked, ears.view().state, ears.view().last?.reason], [[notTakenWhy], "idle", notTakenWhy]);
});

test("ears passes on whether the recording under way has heard speech yet, and none when nothing is recording", { timeout: 5_000 }, async () => {
  const heard = { now: false };
  const ears = createEars({ microphone: "card", record: () => ({ ...pretendRecording(), speechHeard: () => heard.now }), log: () => {} });
  assert.equal(ears.speechHeard(), false);
  await ears.unmute();
  ears.start("button");
  assert.equal(ears.speechHeard(), false);
  heard.now = true;
  assert.equal(ears.speechHeard(), true);
  await ears.stop();
  assert.equal(ears.speechHeard(), false, "once it has ended, nothing is under way");
});

test("a claimed one, or one that ends or is stopped first, isn't dropped later", { timeout: 5_000 }, async () => {
  const { ears, recordings } = setUpCounted(undefined, 50);
  await ears.unmute();
  ears.start("wake");
  ears.claim(1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(recordings[0].asked, []);
  assert.equal(ears.view().state, "recording");
  await ears.stop();
  ears.start("wake");
  await ears.stop();
  ears.start();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(recordings[2].asked, [], "the timer from the stopped wake recording doesn't reach the next one");
  await ears.stop();
  ears.start("wake");
  recordings[3].end({});
  await tick();
  ears.start("wake");
  await new Promise((resolve) => setTimeout(resolve, 30));
  ears.claim(5);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(recordings[4].asked, []);
  await ears.stop();
});

test("a microphone failure outside a recording fails ears, and a mute, a failure or a recording already under way are left alone", { timeout: 5_000 }, async () => {
  const { ears, lines } = setUpCounted();
  ears.fail("the microphone stopped (x)");
  assert.equal(ears.view().state, "muted");
  await ears.unmute();
  ears.start();
  ears.fail("the microphone stopped (x)");
  assert.equal(ears.view().state, "recording");
  await ears.stop();
  ears.fail("the microphone stopped (the recorder ended by itself with code 1)");
  assert.deepEqual([ears.view().state, ears.view().reason], ["failed", "the microphone stopped (the recorder ended by itself with code 1)"]);
  assert.equal(lines.at(-1), "The microphone failed: the microphone stopped (the recorder ended by itself with code 1).");
  ears.fail("again");
  assert.equal(ears.view().reason, "the microphone stopped (the recorder ended by itself with code 1)");
  assert.equal(ears.start().ok, false);
  await ears.unmute();
  assert.equal(ears.view().state, "idle");
});

test("a failure while Whisper works leaves ears failed, and drops the text, so it can't turn up after the unmute that recovers it", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, lines } = setUpCounted(whisper.toText);
  await ears.unmute();
  ears.start();
  const stopping = ears.stop();
  await tick();
  ears.fail("the microphone stopped (y)");
  assert.equal(whisper.asked[0].signal.aborted, true);
  whisper.asked[0].answer("Lights.");
  await stopping;
  assert.deepEqual([ears.view().state, ears.view().last?.text, ears.view().last?.textProblem], ["failed", null, failedBeforeText]);
  assert.equal(failedBeforeText, "the microphone failed before it was turned into text");
  assert.equal(lines.at(-1), `Not turned into text: ${failedBeforeText}.`);
  await ears.unmute();
  assert.deepEqual([ears.view().state, ears.view().last?.text], ["idle", null]);
});

test("a wake-word recording that ended with no speech in it isn't sent to Whisper", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, recordings } = setUpCounted(whisper.toText);
  await ears.unmute();
  ears.start("wake");
  ears.claim(1);
  recordings[0].end({ reason: "nothing loud enough to be speech came within 5 seconds, so it wasn't sent to Whisper", unheard: true });
  await tick();
  assert.equal(whisper.asked.length, 0);
  assert.deepEqual([ears.view().state, ears.view().last?.text, ears.view().last?.reason, ears.lastId()], ["idle", null, "nothing loud enough to be speech came within 5 seconds, so it wasn't sent to Whisper", 1]);
  ears.start("wake");
  ears.claim(2);
  recordings[1].end({ reason: "it went quiet for 1.5 seconds after you spoke" });
  await tick();
  assert.equal(whisper.asked.length, 1);
  whisper.asked[0].answer("Hi.");
});

test("every change to what ears shows is reported", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, changes } = setUpCounted(whisper.toText);
  let seen = changes();
  const changed = (what: string) => {
    assert.ok(changes() > seen, what);
    seen = changes();
  };
  await ears.unmute();
  changed("unmute");
  ears.start("wake");
  changed("start");
  ears.claim(1);
  changed("claim");
  const stopping = ears.stop();
  await tick();
  changed("stop, as it starts turning into text");
  whisper.asked[0].answer("Hi.");
  await stopping;
  changed("the text");
  await ears.cancel();
  changed("cancel clearing the text");
  ears.start();
  seen = changes();
  await ears.cancel();
  changed("cancel of a recording");
  await ears.mute(null);
  changed("mute");
  await ears.unmute();
  changed("unmute again");
  ears.fail("z");
  changed("fail");
});

test("start gives the new recording's number, and stop or cancel naming it act on it just as they do without one", { timeout: 5_000 }, async () => {
  const { ears, recordings } = setUpCounted();
  await ears.unmute();
  const first = ears.start();
  assert.equal(first.ok && first.id, 1);
  const stopped = await ears.stop(1);
  assert.equal(stopped.ok, true);
  assert.deepEqual(recordings[0].asked, ["asked to stop"]);
  const second = ears.start();
  assert.equal(second.ok && second.id, 2);
  const cancelled = await ears.cancel(2);
  assert.equal(cancelled.ok, true);
  assert.deepEqual(recordings[1].asked, ["asked to cancel"]);
});

test("a chat naming its own recording that has already ended can't stop or cancel a newer one another chat took, and that one's text is left alone", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, recordings } = setUpCounted(whisper.toText);
  await ears.unmute();
  ears.start();
  recordings[0].end({ reason: "it reached the 30-second limit" });
  await until(() => whisper.asked.length === 1);
  whisper.asked[0].answer("Chat A's question.");
  await until(() => ears.view().state === "idle");
  ears.start("wake");
  assert.equal(ears.claim(2).ok, true);
  assert.deepEqual(await ears.stop(1), { ok: false, error: thatOneEnded });
  assert.deepEqual(await ears.cancel(1), { ok: false, error: thatOneEnded });
  assert.deepEqual([recordings[1].asked, ears.view().state, ears.current()?.id, ears.view().last?.text], [[], "recording", 2, "Chat A's question."]);
  const stopping = ears.stop(2);
  await until(() => whisper.asked.length === 2);
  whisper.asked[1].answer("Chat B's question.");
  assert.equal((await stopping).ok, true);
  assert.equal(ears.view().last?.text, "Chat B's question.");
});

test("naming a recording older than the last one is refused as gone, and changes nothing", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  const { ears, recordings } = setUpCounted(whisper.toText);
  await ears.unmute();
  ears.start();
  await ears.cancel();
  ears.start();
  await ears.cancel();
  ears.start();
  for (const call of [() => ears.stop(1), () => ears.cancel(1), () => ears.stop(9)]) assert.deepEqual(await call(), { ok: false, error: movedOn, gone: true });
  assert.deepEqual([recordings[2].asked, ears.view().state], [[], "recording"]);
  const stopping = ears.stop(3);
  await until(() => whisper.asked.length === 1);
  whisper.asked[0].answer("Hello.");
  await stopping;
  assert.deepEqual(await ears.cancel(1), { ok: false, error: movedOn, gone: true });
  assert.equal(ears.view().last?.text, "Hello.");
  assert.equal(movedOn, "ears has moved on to a newer recording, so that one is gone");
  assert.equal(thatOneEnded, "that recording has already ended");
});

test("naming the recording reaches it while it's being stopped, while Whisper works on it, and once its text is made", { timeout: 5_000 }, async () => {
  const whisper = pretendWhisper();
  let release: () => void = () => {};
  const lines: string[] = [];
  const ears = createEars({
    microphone: "card",
    record: () => {
      let finish: (stopped: Stopped) => void = () => {};
      const ended = new Promise<Stopped>((resolve) => (finish = resolve));
      return { pid: 7, ended, stop: (reason) => ((release = () => finish({ reason, failed: false, bytes: 3200, ms: 2000, sound: Uint8Array.of(1, 2) })), ended) };
    },
    log: (line) => lines.push(line),
    toText: whisper.toText,
  });
  await ears.unmute();
  ears.start();
  const stopping = ears.stop(1);
  const cancelled = ears.cancel(1);
  release();
  assert.equal((await stopping).ok, true);
  assert.equal((await cancelled).ok, true);
  assert.deepEqual([whisper.asked.length, ears.view().last?.textProblem], [0, cancelledBeforeText]);
  ears.start();
  const second = ears.stop(2);
  release();
  await until(() => whisper.asked.length === 1);
  assert.equal(ears.view().state, "working");
  assert.equal((await ears.cancel(2)).ok, true);
  await second;
  assert.deepEqual([ears.view().state, ears.view().last?.textProblem], ["idle", cancelledBeforeText]);
  ears.start();
  const third = ears.stop(3);
  release();
  await until(() => whisper.asked.length === 2);
  whisper.asked[1].answer("Kept.");
  await third;
  assert.equal(ears.view().last?.text, "Kept.");
  assert.equal((await ears.cancel(3)).ok, true);
  assert.deepEqual([ears.view().last?.text, ears.view().last?.textProblem], [null, clearedByCancel]);
});

test("a recording's last says how it was set to end when the recording says so, and nothing when it doesn't", { timeout: 5_000 }, async () => {
  const { ears, recordings } = setUpCounted();
  await ears.unmute();
  ears.start("wake");
  ears.claim(1);
  recordings[0].end({ reason: "the speech detector heard no speech for 1.5 seconds after you spoke", ender: "silero", pauseMs: 1500 });
  await until(() => ears.view().state === "idle");
  assert.deepEqual(ears.view().last, { seconds: 1.2, reason: "the speech detector heard no speech for 1.5 seconds after you spoke", text: null, textProblem: null, ender: "silero", pauseMs: 1500 });
  ears.start();
  await ears.stop();
  assert.equal(ears.view().last !== null && "ender" in ears.view().last!, false);
  assert.equal(ears.view().last !== null && "pauseMs" in ears.view().last!, false);
});

test("a recording that comes with its text already made isn't sent to Whisper again, and its code word to stop still counts", async () => {
  const whisper = pretendWhisper();
  const { ears, lines, recordings } = setUp("card", whisper.toText);
  await ears.unmute();
  ears.start("wake");
  recordings[0].end({ reason: "it went quiet for 0.7 seconds after you spoke", text: "What's the time?", words: { looks: 1, verdict: "done", by: "rules" }, speech: { firstMs: 900, speechMs: 1200, longestPauseMs: 100 } });
  await tick();
  await tick();
  assert.equal(whisper.asked.length, 0);
  assert.deepEqual([ears.view().state, ears.view().last?.text], ["idle", "What's the time?"]);
  assert.deepEqual(lines.slice(-4), ["Recording stopped after 1.2 seconds: it went quiet for 0.7 seconds after you spoke.", "Speech in it: first heard after 0.9 seconds, 1.2 seconds of speech, longest pause between words 0.1 seconds.", "Judged by your words: finished, by the rules (1 look).", "Turned into text in 0 seconds: the text made while you paused was used."]);
  assert.equal(lines.some((line) => line.includes("the time")), false);
  ears.start("wake");
  recordings[1].end({ text: "Stop listening.", words: { looks: 2, verdict: "done", by: "chat" } });
  await tick();
  await tick();
  assert.deepEqual([ears.view().state, ears.view().last?.text, ears.view().last?.textProblem], ["muted", null, stoppedListening]);
  const plain = setUp("card");
  await plain.ears.unmute();
  plain.ears.start("wake");
  plain.recordings[0].end({ text: "What's the time?" });
  await tick();
  assert.deepEqual([plain.ears.view().state, plain.ears.view().last?.text], ["idle", null], "with no Whisper set up, nothing is turned into text, as before");
});

test("the log says how your words were judged, in numbers and never in words, and only for a recording with speech in it", async () => {
  assert.equal(wordsLine({ looks: 0, verdict: null, by: null }), "Your words weren't looked at: it ended before a pause long enough to look.");
  assert.equal(wordsLine({ looks: 1, verdict: null, by: null }), "Your words weren't judged in time (1 look).");
  assert.equal(wordsLine({ looks: 3, verdict: null, by: null }), "Your words weren't judged in time (3 looks).");
  assert.equal(wordsLine({ looks: 2, verdict: "more", by: "rules" }), "Judged by your words: more to come, by the rules (2 looks).");
  assert.equal(wordsLine({ looks: 1, verdict: "unsure", by: "rules" }), "Judged by your words: unsure, by the rules (1 look).");
  assert.equal(wordsLine({ looks: 1, verdict: "done", by: "chat" }), "Judged by your words: finished, by a Jarvis chat (1 look).");
  const { ears, lines, recordings } = setUp("card");
  await ears.unmute();
  ears.start("wake");
  recordings[0].end({ unheard: true, words: { looks: 0, verdict: null, by: null } });
  await tick();
  assert.equal(lines.some((line) => line.includes("words")), false, "nothing was said, so there's no line about words");
});

const yours: VoiceResult = { verdict: "match", score: 0.84, speechMs: 2_000 };
const someoneElse: VoiceResult = { verdict: "different", score: 0.21, speechMs: 2_000 };
const tooLittle: VoiceResult = { verdict: "too short", score: null, speechMs: 600 };
const spoke = { speech: { firstMs: 900, speechMs: 1200, longestPauseMs: 100 } };

function setUpVoice(mode: VoiceGate["mode"], answers: (VoiceResult | Error)[]) {
  const lines: string[] = [];
  const recordings: Pretend[] = [];
  const checked: number[] = [];
  const turned: number[] = [];
  const ears = createEars({
    microphone: "card",
    record: () => {
      const recording = pretendRecording();
      recordings.push(recording);
      return recording;
    },
    log: (line) => lines.push(line),
    toText: async (sound) => (turned.push(sound.length), "What's the time?"),
    voice: {
      mode,
      threshold: 0.5,
      check: async (sound) => {
        checked.push(sound.length);
        const next = answers.shift() ?? yours;
        if (next instanceof Error) throw next;
        return next;
      },
    },
  });
  const said = async (by: "wake" | "follow" | "button" | "push") => {
    ears.start(by);
    recordings[recordings.length - 1].end({ reason: "it went quiet for 1.5 seconds after you spoke", ...spoke });
    for (let turn = 0; turn < 6; turn++) await tick();
    return ears.view().last;
  };
  return { ears, lines, recordings, checked, turned, said };
}

test("with voice ID to observe, each recording's voice is scored before Whisper and the score is logged, and nothing is blocked, not even a different voice or a check that failed", async () => {
  const { ears, lines, checked, turned, said } = setUpVoice("observe", [yours, someoneElse, tooLittle, new Error("the model broke")]);
  await ears.unmute();
  assert.deepEqual([(await said("wake"))?.text, (await said("wake"))?.text, (await said("follow"))?.text, (await said("wake"))?.text], ["What's the time?", "What's the time?", "What's the time?", "What's the time?"]);
  assert.deepEqual([checked.length, turned.length], [4, 4]);
  assert.deepEqual(lines.filter((line) => line.startsWith("Voice: ")), [
    "Voice: Best score: 0.84, a voiceprint's. At the threshold of 0.5, that counts as a voiceprint.",
    "Voice: Best score: 0.21. At the threshold of 0.5, that counts as nobody's voiceprint.",
    "Voice: Speech was heard for only 0.6 seconds, under the 1 second a voice needs to be compared fairly.",
    "Voice: couldn't be checked (the model broke).",
  ]);
  assert.equal(lines.some((line) => line.startsWith("Not turned into text")), false);
  const at = lines.indexOf("Voice: Best score: 0.84, a voiceprint's. At the threshold of 0.5, that counts as a voiceprint.");
  assert.match(lines[at + 1], /^Turned into text in /, "the voice is checked first, then Whisper is asked");
});

test("with voice ID required, a wake-word or follow-up recording in a different voice isn't turned into text and says why, and your voice, too little speech, the talk button and /talk all go through", async () => {
  const { ears, lines, turned, said } = setUpVoice("require", [someoneElse, someoneElse, yours, tooLittle, someoneElse, someoneElse]);
  await ears.unmute();
  const blocked = await said("wake");
  assert.deepEqual([blocked?.text, blocked?.textProblem, ears.view().state, turned.length], [null, notYourVoice, "idle", 0]);
  assert.equal(notYourVoice, "the voice in it didn't match any voiceprint");
  assert.deepEqual(lines.slice(-2), ["Voice: Best score: 0.21. At the threshold of 0.5, that counts as nobody's voiceprint.", `Not turned into text: ${notYourVoice}.`]);
  assert.deepEqual([(await said("follow"))?.textProblem, turned.length], [notYourVoice, 0]);
  assert.deepEqual([(await said("wake"))?.text, (await said("follow"))?.text, turned.length], ["What's the time?", "What's the time?", 2], "your voice, and speech too short to judge");
  assert.deepEqual([(await said("button"))?.text, (await said("push"))?.text, turned.length], ["What's the time?", "What's the time?", 4], "started by hand, so not blocked, though still scored");
  assert.equal(lines.filter((line) => line.startsWith("Voice: ")).length, 6);
});

test("a voice check that fails blocks a wake-word recording when voice ID is required, saying it couldn't be checked, and a mute while the voice is being checked drops the recording as it would during Whisper", async () => {
  const { ears, lines, turned, said, recordings } = setUpVoice("require", [new Error("the model broke")]);
  await ears.unmute();
  const failed = await said("wake");
  assert.deepEqual([failed?.text, failed?.textProblem, turned.length], [null, voiceNotChecked, 0]);
  assert.equal(voiceNotChecked, "the voice in it couldn't be checked against the voiceprints, and voice ID is required");
  assert.deepEqual(lines.slice(-2), ["Voice: couldn't be checked (the model broke).", `Not turned into text: ${voiceNotChecked}.`]);
  let release: (result: VoiceResult) => void = () => {};
  const slowLines: string[] = [];
  const slowTurned: number[] = [];
  const slow = createEars({
    microphone: "card",
    record: () => {
      const recording = pretendRecording();
      recordings.push(recording);
      return recording;
    },
    log: (line) => slowLines.push(line),
    toText: async (sound) => (slowTurned.push(sound.length), "What's the time?"),
    voice: { mode: "require", threshold: 0.5, check: () => new Promise<VoiceResult>((resolve) => (release = resolve)) },
  });
  await slow.unmute();
  slow.start("wake");
  recordings[recordings.length - 1].end({ reason: "it went quiet for 1.5 seconds after you spoke", ...spoke });
  await tick();
  await tick();
  assert.equal(slow.view().state, "working", "checking the voice counts as working on it");
  await slow.mute(null);
  release(yours);
  await tick();
  await tick();
  assert.deepEqual([slow.view().state, slow.view().last?.text ?? null, slowTurned.length], ["muted", null, 0]);
  assert.equal(slowLines.some((line) => line.startsWith("Voice: ")), false, "a check that was called off says nothing");
});

test("with voice ID required, speech too quiet for the voice check to find is blocked in a wake-word recording, saying so, and a check that takes too long counts as one that failed", async () => {
  const tooQuiet: VoiceResult = { verdict: "no speech", score: null, speechMs: 0 };
  const { ears, lines, turned, said } = setUpVoice("require", [tooQuiet, tooQuiet]);
  await ears.unmute();
  const blocked = await said("wake");
  assert.deepEqual([blocked?.text, blocked?.textProblem, turned.length], [null, voiceTooQuiet, 0]);
  assert.equal(voiceTooQuiet, "the speech in it was too quiet to check against the voiceprints, and voice ID is required");
  assert.deepEqual(lines.slice(-2), ["Voice: No speech was heard, so there was nothing to compare.", `Not turned into text: ${voiceTooQuiet}.`]);
  assert.deepEqual([(await said("button"))?.text, turned.length], ["What's the time?", 1], "the talk button is never blocked");
  assert.equal(voiceCheckMs, 10_000);
  const slowLines: string[] = [];
  const recordings: Pretend[] = [];
  const slow = createEars({
    microphone: "card",
    record: () => {
      const recording = pretendRecording();
      recordings.push(recording);
      return recording;
    },
    log: (line) => slowLines.push(line),
    toText: async () => "What's the time?",
    voice: { mode: "require", threshold: 0.5, limitMs: 100, check: () => new Promise<VoiceResult>(() => {}) },
  });
  await slow.unmute();
  slow.start("wake");
  recordings[0].end({ reason: "it went quiet for 1.5 seconds after you spoke", ...spoke });
  await until(() => slow.view().state === "idle" && slow.view().last?.textProblem !== null);
  assert.deepEqual([slow.view().last?.text, slow.view().last?.textProblem], [null, voiceNotChecked]);
  assert.deepEqual(slowLines.slice(-2), ["Voice: couldn't be checked (it took longer than 0.1 seconds).", `Not turned into text: ${voiceNotChecked}.`]);
});

test("each scored recording tells Jarvis who it was in last.voice, the owner or another voiceprint or nobody, with the best score and never the numbers, and an unscored one has none", async () => {
  const visitor: VoiceResult = { verdict: "match", score: 0.8123, speechMs: 2_000, who: "visitor", owner: false, against: 2 };
  const owner: VoiceResult = { verdict: "match", score: 0.9, speechMs: 2_000, who: "voiceprint", owner: true, against: 2 };
  const nobody: VoiceResult = { verdict: "different", score: 0.2, speechMs: 2_000, who: null, owner: false, against: 2 };
  const short: VoiceResult = { verdict: "too short", score: null, speechMs: 400, who: null, owner: false };
  const { ears, lines, said } = setUpVoice("observe", [visitor, owner, nobody, short]);
  await ears.unmute();
  assert.deepEqual((await said("wake"))?.voice, { who: "visitor", owner: false, score: 0.812 });
  assert.deepEqual((await said("wake"))?.voice, { who: "voiceprint", owner: true, score: 0.9 });
  assert.deepEqual((await said("wake"))?.voice, { who: null, owner: false, score: 0.2 });
  const unscored = await said("wake");
  assert.equal(unscored !== null && "voice" in unscored, false);
  assert.ok(lines.includes("Voice: Best score of 2 voiceprints: 0.81, visitor's. At the threshold of 0.5, that counts as visitor."));
  assert.ok(lines.includes("Voice: Best score of 2 voiceprints: 0.90, voiceprint's. At the threshold of 0.5, that counts as voiceprint, the owner."));
});

test("with voice ID required, a voice matching any voiceprint gets through, and with guests on every voice does, still scored and reported, until guests go off again", async () => {
  const visitor: VoiceResult = { verdict: "match", score: 0.7, speechMs: 2_000, who: "visitor", owner: false, against: 2 };
  const nobody: VoiceResult = { verdict: "different", score: 0.1, speechMs: 2_000, who: null, owner: false, against: 2 };
  const quiet: VoiceResult = { verdict: "no speech", score: null, speechMs: 0, who: null, owner: false };
  const { ears, lines, turned, said } = setUpVoice("require", [visitor, nobody, nobody, quiet, nobody]);
  await ears.unmute();
  assert.equal(ears.guestsOn(), false);
  assert.equal((await said("wake"))?.text, "What's the time?");
  assert.equal((await said("wake"))?.textProblem, notYourVoice);
  ears.guests(true);
  assert.equal(ears.guestsOn(), true);
  assert.ok(lines.includes("Guests: on, so every voice gets through, still scored."));
  const let_through = await said("follow");
  assert.deepEqual([let_through?.text, let_through?.voice], ["What's the time?", { who: null, owner: false, score: 0.1 }]);
  assert.ok(lines.includes("Let through: guests are on, so every voice gets through."));
  assert.equal((await said("wake"))?.text, "What's the time?", "too quiet to check gets through too while guests are on");
  ears.guests(true);
  assert.equal(lines.filter((line) => line.startsWith("Guests: on")).length, 1, "setting it again changes nothing");
  ears.guests(false);
  assert.ok(lines.includes("Guests: off, so voice ID blocks voices that match no voiceprint again."));
  assert.equal((await said("wake"))?.textProblem, notYourVoice);
  assert.equal(turned.length, 3);
});
