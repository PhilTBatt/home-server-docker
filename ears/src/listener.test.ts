import assert from "node:assert/strict";
import { test } from "node:test";
import type { EarsState } from "./ears.js";
import { frameBytes, frameLevel } from "./levels.js";
import { backgroundMs, beforeMs, behindBytes, createListener, gapMs, holdMs, lateMs, noRoomYet, presenceMs, retryMs, stillSpeaking, wakeHost, wakeOff, wakePort, wakeWord, type Listener, type ListenerDeps } from "./listener.js";
import type { Recording, Stopped } from "./recorder.js";
import type { Detector } from "./silero.js";
import type { By, Tap } from "./tap.js";
import type { WyomingEvent } from "./wyoming.js";
import type { WyomingConnection } from "./wyoming-client.js";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(done: () => boolean, ms = 2000): Promise<void> {
  const began = performance.now();
  while (!done()) {
    if (performance.now() - began > ms) throw new Error("waited too long");
    await pause(2);
  }
}

type FakeStream = Recording & { onSound: (sound: Buffer) => void; stopped: string[]; die(reason: string): void; finish(): void };

function fakeDetector() {
  const sent: WyomingEvent[] = [];
  const arrived: (WyomingEvent | null)[] = [];
  let waiting: (() => void) | null = null;
  let closed = false;
  let behind = 0;
  const connection: WyomingConnection = {
    send(event) {
      if (closed) return Promise.reject(new Error("The connection is closed"));
      sent.push(event);
      return Promise.resolve();
    },
    next() {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (arrived.length > 0) resolve(arrived.shift() as WyomingEvent | null);
          else if (closed) reject(new Error("closed at this end"));
          else waiting = check;
        };
        check();
      });
    },
    buffered: () => behind,
    close() {
      closed = true;
      const waiter = waiting;
      waiting = null;
      waiter?.();
    },
  };
  return {
    connection,
    sent,
    types: () => sent.map((event) => event.type),
    say(event: WyomingEvent | null) {
      arrived.push(event);
      const waiter = waiting;
      waiting = null;
      waiter?.();
    },
    detect(lateBy = 0) {
      let since = 0;
      for (const event of sent) {
        if (event.type === "audio-start") since = 0;
        if (event.type === "audio-chunk") since += event.payload?.length ?? 0;
      }
      this.say({ type: "detection", data: { name: "hey_jarvis", timestamp: Math.max(0, Math.floor(since / 32) - 100 - lateBy) }, payload: null });
    },
    behind(bytes: number) {
      behind = bytes;
    },
    get closed() {
      return closed;
    },
  };
}

function setUp(options: Partial<ListenerDeps> & { failConnects?: number; slowStop?: boolean } = {}) {
  const lines: string[] = [];
  const streams: FakeStream[] = [];
  const detectors: ReturnType<typeof fakeDetector>[] = [];
  const failed: string[] = [];
  const started: By[] = [];
  const earsState: { state: EarsState } = { state: "idle" };
  let changes = 0;
  let connects = 0;
  let listener: Listener | null = null;
  const taps: Recording[] = [];
  const created = createListener({
    ears: () => ({
      state: () => earsState.state,
      start(by) {
        started.push(by);
        if (earsState.state !== "idle") return { ok: false, error: `ears is ${earsState.state}` };
        earsState.state = "recording";
        taps.push((listener as Listener).tap(by));
        return { ok: true };
      },
      fail(why) {
        failed.push(why);
        if (earsState.state === "idle" || earsState.state === "working") earsState.state = "failed";
      },
    }),
    stream(onSound) {
      let finish: (stopped: Stopped) => void = () => {};
      const ended = new Promise<Stopped>((resolve) => (finish = resolve));
      const stopped: string[] = [];
      const end = (reason: string, failedEnd: boolean) => finish({ reason, failed: failedEnd, bytes: 0, ms: 0, sound: new Uint8Array(0) });
      const made: FakeStream = {
        pid: 99,
        ended,
        onSound,
        stopped,
        stop(reason) {
          stopped.push(reason);
          if (!(options.slowStop ?? false)) end(reason, false);
          return ended;
        },
        die: (reason) => end(reason, true),
        finish: () => end(stopped[0] ?? "x", false),
      };
      streams.push(made);
      return made;
    },
    async connect() {
      connects++;
      if (connects <= (options.failConnects ?? 0)) throw new Error("Couldn't reach the Wyoming server at openwakeword:10400 (ENOTFOUND)");
      const detector = fakeDetector();
      detectors.push(detector);
      return detector.connection;
    },
    log: (line) => lines.push(line),
    changed: () => void changes++,
    presenceMs: 60,
    holdMs: 300,
    gapMs: 60,
    retryMs: 60,
    settleMs: 0,
    quietForMs: 200,
    startWithinMs: 1000,
    ...options,
  });
  listener = created;
  const closing = created.close.bind(created);
  created.close = async () => {
    for (const tap of taps) await tap.stop("the test is over");
    await closing();
  };
  const original = created.tap.bind(created);
  created.tap = (by) => {
    const made = original(by);
    taps.push(made);
    return made;
  };
  const sound = (level: number, frames = 1) => {
    const piece = Buffer.alloc(frameBytes * frames);
    for (let index = 0; index < piece.length / 2; index++) piece.writeInt16LE(index % 2 === 0 ? level : -level, index * 2);
    return piece;
  };
  const connected = async (count = 1) => {
    await until(() => detectors.length >= count && detectors[count - 1].sent.length >= 1, 5000);
    await pause(1);
  };
  return { listener: created, lines, streams, detectors, failed, started, earsState, sound, connected, changes: () => changes, connects: () => connects };
}

test("ears listens for hey_jarvis on openwakeword's port 10400, and these are its timings", () => {
  assert.deepEqual([wakeWord, wakeHost, wakePort], ["hey_jarvis", "openwakeword", 10400]);
  assert.deepEqual([retryMs, presenceMs, holdMs, gapMs, beforeMs, backgroundMs, behindBytes, lateMs], [5000, 5000, 15000, 500, 500, 3000, 64000, 2000]);
  assert.deepEqual(wakeOff, { on: false, listening: false, held: false, problem: null });
});

test("nothing is opened until a Jarvis chat waits, and then the microphone opens and the wake-word server is asked for hey_jarvis", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, lines } = setUp();
  listener.update();
  await pause(20);
  assert.deepEqual([streams.length, detectors.length], [0, 0]);
  assert.deepEqual(listener.view(), { on: true, listening: false, held: false, problem: null });
  const done = listener.waiting();
  await connected(1);
  assert.equal(streams.length, 1);
  assert.deepEqual(detectors[0].sent[0], { type: "detect", data: { names: ["hey_jarvis"] }, payload: null });
  assert.deepEqual(lines, ["The microphone is open."]);
  done();
  done();
  await listener.close();
});

test("another wake word can be asked for", { timeout: 5_000 }, async () => {
  const { listener, connected, detectors } = setUp({ word: "hey_mycroft" });
  listener.waiting();
  await connected(1);
  assert.deepEqual(detectors[0].sent[0].data, { names: ["hey_mycroft"] });
  await listener.close();
});

test("sound is fed to the wake-word server between an audio-start and the next audio-stop, as 16-bit mono at 16,000 Hz", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, sound } = setUp();
  listener.waiting();
  await connected(1);
  streams[0].onSound(sound(100));
  streams[0].onSound(sound(100));
  const format = { rate: 16000, width: 2, channels: 1 };
  assert.deepEqual(detectors[0].types(), ["detect", "audio-start", "audio-chunk", "audio-chunk"]);
  assert.deepEqual([detectors[0].sent[1].data, detectors[0].sent[2].data, detectors[0].sent[2].payload?.length], [format, format, frameBytes]);
  assert.equal(listener.view().listening, true);
  await listener.close();
});

test("an odd byte at the end of a piece waits for the next, so the server only ever gets whole samples", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors } = setUp();
  listener.waiting();
  await connected(1);
  streams[0].onSound(Buffer.from([1, 2, 3]));
  streams[0].onSound(Buffer.from([4]));
  streams[0].onSound(Buffer.from([5]));
  streams[0].onSound(Buffer.from([6, 7, 8]));
  const chunks = detectors[0].sent.filter((event) => event.type === "audio-chunk").map((event) => [...(event.payload as Uint8Array)]);
  assert.deepEqual(chunks, [[1, 2], [3, 4], [5, 6, 7, 8]]);
  await listener.close();
});

test("a sound the stream keeps using afterwards can't change what was sent", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors } = setUp();
  listener.waiting();
  await connected(1);
  const piece = Buffer.from([1, 2, 3, 4]);
  streams[0].onSound(piece);
  piece.fill(0);
  assert.deepEqual([...(detectors[0].sent[2].payload as Uint8Array)], [1, 2, 3, 4]);
  await listener.close();
});

test("when no chat has waited for a while, the microphone closes and the wake-word server is let go", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, lines, sound } = setUp();
  const done = listener.waiting();
  await connected(1);
  streams[0].onSound(sound(100));
  done();
  await pause(20);
  assert.equal(streams[0].stopped.length, 0, "a short gap between waits keeps it open");
  await until(() => streams[0].stopped.length === 1, 5000);
  assert.deepEqual(streams[0].stopped, ["no Jarvis chat is listening for the wake word"]);
  assert.equal(detectors[0].closed, true);
  assert.deepEqual(detectors[0].types(), ["detect", "audio-start", "audio-chunk"], "it's let go without an audio-stop, which it would answer into a closed connection");
  assert.equal(lines.at(-1), "The microphone is closed: no Jarvis chat is listening for the wake word.");
  await listener.close();
});

test("while one wait goes on, the microphone stays open however long it lasts", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors } = setUp();
  const done = listener.waiting();
  await connected(1);
  await pause(200);
  assert.deepEqual(streams[0].stopped, []);
  done();
  await listener.close();
});

test("a mute or a failure closes the microphone and saying why, and nothing is fed while ears isn't idle", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, earsState, sound, lines } = setUp();
  listener.waiting();
  await connected(1);
  streams[0].onSound(sound(100));
  earsState.state = "working";
  streams[0].onSound(sound(100));
  assert.deepEqual(detectors[0].types(), ["detect", "audio-start", "audio-chunk", "audio-stop"]);
  assert.equal(listener.view().listening, false);
  listener.update();
  assert.deepEqual(streams[0].stopped, [], "the microphone stays open while Whisper works");
  earsState.state = "muted";
  listener.update();
  assert.deepEqual(streams[0].stopped, ["ears is muted"]);
  assert.equal(lines.at(-1), "The microphone is closed: ears is muted.");
  assert.equal(detectors[0].closed, true);
  earsState.state = "idle";
  listener.update();
  await connected(2);
  assert.equal(streams.length, 2);
  earsState.state = "failed";
  listener.update();
  assert.deepEqual(streams[1].stopped, ["ears is failed"]);
  await listener.close();
});

test("a hold stops the feeding at once, and it starts again half a second after the hold is let go, with a fresh start", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, sound } = setUp();
  listener.waiting();
  await connected(1);
  streams[0].onSound(sound(100));
  listener.hold("aa");
  assert.equal(listener.view().held, true);
  assert.deepEqual(detectors[0].types().slice(-1), ["audio-stop"]);
  streams[0].onSound(sound(100));
  assert.equal(detectors[0].types().filter((type) => type === "audio-chunk").length, 1, "nothing was fed while held");
  listener.release("aa");
  assert.equal(listener.view().held, false);
  streams[0].onSound(sound(100));
  assert.equal(detectors[0].types().filter((type) => type === "audio-chunk").length, 1, "nor in the gap after it");
  await pause(80);
  streams[0].onSound(sound(100));
  assert.deepEqual(detectors[0].types().slice(-2), ["audio-start", "audio-chunk"]);
  await listener.close();
});

test("a hold that isn't let go runs out by itself, and holding again stretches it", { timeout: 5_000 }, async () => {
  const { listener, connected, detectors } = setUp({ holdMs: 150 });
  listener.waiting();
  await connected(1);
  listener.hold("aa");
  await pause(100);
  listener.hold("aa");
  await pause(100);
  assert.equal(listener.view().held, true);
  await until(() => !listener.view().held, 500);
  listener.release("aa");
  assert.equal(listener.view().held, false);
  await listener.close();
});

test("letting go without a hold adds no gap", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, sound } = setUp({ gapMs: 5000 });
  listener.waiting();
  await connected(1);
  listener.release("aa");
  streams[0].onSound(sound(100));
  assert.deepEqual(detectors[0].types(), ["detect", "audio-start", "audio-chunk"]);
  await listener.close();
});

test("the wake word starts a recording, measuring the room first, and stops feeding the wake-word server while it records", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, started, sound, lines, earsState } = setUp();
  listener.waiting();
  await connected(1);
  for (let frame = 0; frame < 5; frame++) streams[0].onSound(sound(50));
  streams[0].onSound(sound(400));
  detectors[0].detect();
  await until(() => started.length === 1);
  assert.deepEqual(started, ["wake"]);
  assert.equal(lines.at(-1), "Heard the wake word. The room's background is 50, so speech is anything above 300.");
  assert.deepEqual(detectors[0].types().slice(-1), ["audio-stop"]);
  assert.equal(listener.view().listening, false);
  const fed = detectors[0].types().filter((type) => type === "audio-chunk").length;
  streams[0].onSound(sound(2000, 2));
  assert.equal(detectors[0].types().filter((type) => type === "audio-chunk").length, fed, "the recording isn't fed to the wake-word server");
  earsState.state = "idle";
  await listener.close();
});

test("the room is measured afresh after each pause, so a loud stretch before a hold doesn't count", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, sound, lines } = setUp();
  listener.waiting();
  await connected(1);
  for (let frame = 0; frame < 5; frame++) streams[0].onSound(sound(900));
  listener.hold("aa");
  listener.release("aa");
  await pause(80);
  streams[0].onSound(sound(30));
  detectors[0].detect();
  await until(() => lines.some((line) => line.startsWith("Heard the wake word.")));
  assert.equal(lines.at(-1), "Heard the wake word. The room's background is 30, so speech is anything above 300.");
  await listener.close();
});

test("the sound kept from before the wake word is at least the half second asked for, from the end", { timeout: 5_000 }, async () => {
  const kept: Uint8Array[] = [];
  const { listener, connected, streams, detectors, earsState } = setUp({ beforeMs: 100 });
  const original = listener.tap.bind(listener);
  listener.tap = (by) => {
    const made = original(by);
    void made.stop("asked to stop").then((stopped) => kept.push(stopped.sound));
    return made;
  };
  listener.waiting();
  await connected(1);
  for (const value of [1, 2, 3, 4, 5]) streams[0].onSound(Buffer.alloc(1600, value));
  detectors[0].detect();
  await until(() => kept.length === 1);
  assert.equal(kept[0].length, 3200);
  assert.deepEqual([kept[0][0], kept[0][3199]], [4, 5]);
  earsState.state = "idle";
  await listener.close();
});

test("a wake-word recording ends itself once it's quiet after speech, and a push one doesn't", { timeout: 5_000 }, async () => {
  const ends: string[] = [];
  const { listener, connected, streams, detectors, earsState, sound } = setUp();
  const original = listener.tap.bind(listener);
  listener.tap = (by) => {
    const made = original(by);
    void made.ended.then((stopped) => ends.push(`${by}: ${stopped.reason}`));
    return made;
  };
  listener.waiting();
  await connected(1);
  streams[0].onSound(sound(20, 3));
  detectors[0].detect();
  await until(() => earsState.state === "recording");
  streams[0].onSound(sound(3000, 2));
  streams[0].onSound(sound(10, 2));
  await until(() => ends.length === 1);
  assert.deepEqual(ends, ["wake: it went quiet for 0.2 seconds after you spoke"]);
  earsState.state = "recording";
  const push = listener.tap("push");
  streams[0].onSound(sound(3000, 2));
  streams[0].onSound(sound(10, 20));
  await pause(20);
  assert.equal(ends.length, 1);
  await push.stop("asked to stop");
  earsState.state = "idle";
  await listener.close();
});

test("with the speech detector, a wake-word recording is judged by it, not by loudness, each with a fresh detector, and a push one isn't judged", { timeout: 5_000 }, async () => {
  const ends: string[] = [];
  let made = 0;
  const detector = (): Detector => {
    made++;
    return { frame: async (sound) => (new DataView(sound.buffer, sound.byteOffset, sound.length).getInt16(0, true) === 77 ? [0.9] : [0.1]) };
  };
  const { listener, connected, streams, detectors, earsState, sound } = setUp({ detector });
  const original = listener.tap.bind(listener);
  listener.tap = (by) => {
    const made = original(by);
    void made.ended.then((stopped) => ends.push(`${by}: ${stopped.reason} (${stopped.ender ?? "no ender"})`));
    return made;
  };
  listener.waiting();
  await connected(1);
  streams[0].onSound(sound(20, 3));
  detectors[0].detect();
  await until(() => earsState.state === "recording");
  streams[0].onSound(sound(77, 2));
  streams[0].onSound(sound(9000, 3));
  await until(() => ends.length === 1);
  assert.deepEqual(ends, ["wake: the speech detector heard no speech for 0.2 seconds after you spoke (silero)"]);
  assert.equal(made, 1);
  earsState.state = "recording";
  const push = listener.tap("push");
  streams[0].onSound(sound(77, 2));
  await push.stop("asked to stop");
  earsState.state = "idle";
  assert.deepEqual([made, ends.at(-1)], [1, "push: asked to stop (no ender)"]);
  streams[0].onSound(sound(20, 3));
  detectors[0].detect();
  await until(() => earsState.state === "recording");
  assert.equal(made, 2);
  await listener.close();
});

test("without the speech detector a wake-word recording ends on loudness and says so", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, earsState, sound } = setUp();
  const ends: string[] = [];
  const original = listener.tap.bind(listener);
  listener.tap = (by) => {
    const made = original(by);
    void made.ended.then((stopped) => ends.push(stopped.ender ?? "none"));
    return made;
  };
  listener.waiting();
  await connected(1);
  streams[0].onSound(sound(20, 3));
  detectors[0].detect();
  await until(() => earsState.state === "recording");
  streams[0].onSound(sound(3000, 2));
  streams[0].onSound(sound(10, 3));
  await until(() => ends.length === 1);
  assert.deepEqual(ends, ["loudness"]);
  await listener.close();
});

test("a speech detector that fails is logged once, and that recording ends on loudness against the room before the wake word", { timeout: 5_000 }, async () => {
  const detector = (): Detector => ({ frame: async () => Promise.reject(new Error("model broke")) });
  const { listener, lines, connected, streams, detectors, earsState, sound } = setUp({ detector });
  const ends: string[] = [];
  const original = listener.tap.bind(listener);
  listener.tap = (by) => {
    const made = original(by);
    void made.ended.then((stopped) => ends.push(stopped.reason));
    return made;
  };
  listener.waiting();
  await connected(1);
  streams[0].onSound(sound(200, 3));
  detectors[0].detect();
  await until(() => earsState.state === "recording");
  streams[0].onSound(sound(700, 2));
  streams[0].onSound(sound(500, 3));
  await until(() => ends.length === 1);
  assert.deepEqual(ends, ["it went quiet for 0.2 seconds after you spoke"]);
  assert.deepEqual(lines.filter((line) => line.startsWith("The speech detector")), ["The speech detector failed (model broke), so this recording ends on loudness instead."]);
  await listener.close();
});

test("a follow-up recording is judged like a wake-word one against the room from the last wake word, with no settling time and its own wait for speech", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, earsState, sound } = setUp({ settleMs: 800, startWithinMs: 5_000 });
  const follow = (withinMs: number): Tap => {
    let made: Tap | null = null;
    const result = listener.follow(withinMs, () => {
      earsState.state = "recording";
      made = listener.tap("follow");
      return { ok: true as const, id: 1 };
    });
    assert.deepEqual(result, { ok: true, id: 1 });
    return made as unknown as Tap;
  };
  listener.waiting();
  await connected(1);
  for (let frame = 0; frame < 5; frame++) streams[0].onSound(sound(400));
  detectors[0].detect();
  await until(() => earsState.state === "recording");
  streams[0].onSound(sound(9000, 10));
  streams[0].onSound(sound(10, 3));
  await until(() => listener.view().listening === false && earsState.state === "recording");
  earsState.state = "idle";
  streams[0].onSound(sound(3000, 5));
  assert.equal(listener.view().listening, true);
  const heard = follow(300);
  streams[0].onSound(sound(1300, 1));
  streams[0].onSound(sound(10, 2));
  const stopped = await heard.ended;
  assert.deepEqual([stopped.reason, stopped.unheard], ["it went quiet for 0.2 seconds after you spoke", undefined], "speech straight away counts, with no settling time, and against the room before the wake word rather than the loud stretch since");
  earsState.state = "idle";
  const quiet = follow(300);
  streams[0].onSound(sound(1000, 3));
  const dropped = await quiet.ended;
  assert.deepEqual([dropped.reason, dropped.unheard, dropped.ender], ["nothing loud enough to be speech came within 0.3 seconds, so it wasn't sent to Whisper", true, "loudness"], "1000 is under three times the room of 400 heard before the wake word, and the wait is the one asked for");
  earsState.state = "idle";
  await listener.close();
});

test("a follow-up is refused for ears's own reason when it isn't idle, while any chat holds the wake word, or before ears has heard the room, starting nothing, and allowed once it's let go", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, sound, earsState } = setUp();
  listener.waiting();
  await connected(1);
  earsState.state = "muted";
  assert.deepEqual(listener.follow(5_000, () => ({ ok: false as const, error: "ears is muted" })), { ok: false, error: "ears is muted" }, "when ears isn't idle, its own reason comes first");
  earsState.state = "idle";
  let asked = 0;
  assert.deepEqual(listener.follow(5_000, () => (asked++, { ok: true as const, id: 1 })), { ok: false, error: noRoomYet });
  assert.equal(noRoomYet, "ears hasn't heard the room yet, so it couldn't tell speech from it");
  streams[0].onSound(sound(50));
  listener.hold("a1");
  assert.deepEqual(listener.follow(5_000, () => (asked++, { ok: true as const, id: 1 })), { ok: false, error: stillSpeaking });
  assert.equal(asked, 0);
  listener.release("a1");
  await pause(80);
  streams[0].onSound(sound(50));
  assert.deepEqual(listener.follow(5_000, () => (asked++, { ok: true as const, id: 2 })), { ok: true, id: 2 });
  assert.equal(stillSpeaking, "a Jarvis chat is still speaking, so ears can't listen for a follow-up yet");
  await listener.close();
});

test("a follow-up before any wake word measures the room from what's been heard since listening began, and with the speech detector is judged by a fresh one", { timeout: 5_000 }, async () => {
  let made = 0;
  const detector = (): Detector => {
    made++;
    return { frame: async (sound) => (new DataView(sound.buffer, sound.byteOffset, sound.length).getInt16(0, true) === 77 ? [0.9] : [0.1]) };
  };
  const { listener, connected, streams, earsState, sound } = setUp({ detector });
  listener.waiting();
  await connected(1);
  for (let frame = 0; frame < 5; frame++) streams[0].onSound(sound(500));
  let following: Tap | null = null;
  assert.equal(listener.follow(1_000, () => ((earsState.state = "recording"), (following = listener.tap("follow")), { ok: true as const, id: 3 })).ok, true);
  const tap = following as unknown as Tap;
  streams[0].onSound(sound(77, 2));
  streams[0].onSound(sound(9000, 2));
  const stopped = await tap.ended;
  assert.deepEqual([stopped.reason, stopped.ender, made], ["the speech detector heard no speech for 0.2 seconds after you spoke", "silero", 1]);
  earsState.state = "idle";
  await listener.close();
});

test("a detection that arrives when nothing is being fed is ignored, and logged so false wakes can still be counted", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, started, lines, earsState, sound } = setUp();
  listener.waiting();
  await connected(1);
  detectors[0].detect();
  await until(() => lines.includes("Heard the wake word while it wasn't being listened for, so it was ignored."));
  assert.deepEqual(started, []);
  streams[0].onSound(sound(100));
  earsState.state = "working";
  listener.update();
  detectors[0].detect();
  await until(() => lines.filter((line) => line.startsWith("Heard the wake word while")).length === 2);
  assert.deepEqual(started, []);
  earsState.state = "idle";
  await listener.close();
});

test("ears refusing the wake word's recording is logged", { timeout: 5_000 }, async () => {
  const lines: string[] = [];
  const detector = fakeDetector();
  let onSound: ((sound: Buffer) => void) | null = null;
  const listener = createListener({
    ears: () => ({ state: () => "idle", start: () => ({ ok: false, error: "ears is still ending the last recording" }), fail: () => {} }),
    stream(heard) {
      onSound = heard;
      return { pid: 1, ended: new Promise(() => {}), stop: () => new Promise(() => {}) };
    },
    connect: async () => detector.connection,
    log: (line) => lines.push(line),
    changed: () => {},
  });
  listener.waiting();
  await until(() => onSound !== null && detector.sent.length === 1);
  (onSound as unknown as (sound: Buffer) => void)(Buffer.alloc(3200));
  detector.detect();
  await until(() => lines.some((line) => line.startsWith("Couldn't record")));
  assert.equal(lines.at(-1), "Couldn't record after the wake word: ears is still ending the last recording.");
  void listener.close();
});

test("a push recording opens the microphone even with no chat waiting, and closes it after", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, sound, earsState } = setUp();
  earsState.state = "recording";
  const push = listener.tap("push");
  assert.equal(streams.length, 1);
  streams[0].onSound(sound(500, 2));
  const stopped = push.stop("asked to stop");
  earsState.state = "idle";
  assert.equal((await stopped).sound.length, frameBytes * 2);
  await until(() => streams[0].stopped.length === 1);
  assert.deepEqual(streams[0].stopped, ["no Jarvis chat is listening for the wake word"]);
  await listener.close();
});

test("while any chat holds the wake word, a recording that's already running hears silence instead of him, and hears the room again once it's let go", { timeout: 5_000 }, async () => {
  const { listener, streams, sound, earsState } = setUp();
  earsState.state = "recording";
  const push = listener.tap("push");
  streams[0].onSound(sound(500, 2));
  listener.hold("bb");
  streams[0].onSound(sound(4000, 3));
  listener.release("bb");
  streams[0].onSound(sound(700, 1));
  const stopped = push.stop("asked to stop");
  earsState.state = "idle";
  const kept = (await stopped).sound;
  assert.equal(kept.length, frameBytes * 6);
  const levels = [0, 1, 2, 3, 4, 5].map((index) => frameLevel(kept.subarray(index * frameBytes, (index + 1) * frameBytes)));
  assert.deepEqual(levels, [500, 500, 0, 0, 0, 700]);
  await listener.close();
});

test("a hold that has run out no longer silences a running recording", { timeout: 5_000 }, async () => {
  const { listener, streams, sound, earsState } = setUp({ holdMs: 30 });
  earsState.state = "recording";
  const push = listener.tap("push");
  listener.hold("bb");
  streams[0].onSound(sound(4000, 1));
  await pause(60);
  streams[0].onSound(sound(900, 1));
  const stopped = push.stop("asked to stop");
  earsState.state = "idle";
  const kept = (await stopped).sound;
  assert.deepEqual([frameLevel(kept.subarray(0, frameBytes)), frameLevel(kept.subarray(frameBytes))], [0, 900]);
  await listener.close();
});

test("a microphone that stops by itself fails the recording if there is one, or ears if there isn't", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, failed, detectors, earsState, lines } = setUp();
  listener.waiting();
  await connected(1);
  streams[0].die("the recorder ended by itself with code 1: no such card");
  await until(() => failed.length === 1);
  assert.deepEqual(failed, ["the microphone stopped (the recorder ended by itself with code 1: no such card)"]);
  assert.equal(lines.at(-1), "The microphone is closed: the microphone stopped (the recorder ended by itself with code 1: no such card).");
  earsState.state = "recording";
  const push = listener.tap("push");
  await until(() => streams.length === 2);
  streams[1].die("the recorder was ended by SIGKILL");
  const stopped = await push.ended;
  assert.deepEqual([stopped.reason, stopped.failed], ["the microphone stopped (the recorder was ended by SIGKILL)", true]);
  assert.equal(failed.length, 1);
  earsState.state = "failed";
  await listener.close();
});

test("a wake-word server that can't be reached is a problem that's said once, tried again every few seconds, and cleared when it answers, and the microphone waits for it", { timeout: 5_000 }, async () => {
  const { listener, connected, lines, detectors, connects, streams } = setUp({ failConnects: 2 });
  listener.waiting();
  await until(() => connects() === 1);
  await until(() => listener.view().problem !== null);
  assert.equal(streams.length, 0);
  assert.equal(listener.view().problem, "the wake-word server can't be reached (Couldn't reach the Wyoming server at openwakeword:10400 (ENOTFOUND))");
  await connected(1);
  assert.equal(connects(), 3);
  assert.equal(listener.view().problem, null);
  assert.equal(streams.length, 1);
  assert.deepEqual(
    lines.filter((line) => line.startsWith("The wake word")),
    ["The wake word isn't working: the wake-word server can't be reached (Couldn't reach the Wyoming server at openwakeword:10400 (ENOTFOUND)).", "The wake word is working again."],
  );
  await listener.close();
});

test("a wake-word server that closes the connection or stops taking sound is let go and tried again", { timeout: 5_000 }, async () => {
  const { listener, connected, detectors, streams, sound } = setUp();
  listener.waiting();
  await connected(1);
  detectors[0].say(null);
  await until(() => listener.view().problem !== null);
  assert.equal(listener.view().problem, "the wake-word server stopped answering (it closed the connection)");
  assert.deepEqual(streams[0].stopped, ["the wake-word server can't be used"], "the microphone isn't kept open for nothing");
  await connected(2);
  assert.equal(streams.length, 2);
  detectors[1].behind(64_001);
  streams[1].onSound(sound(100));
  assert.equal(listener.view().problem, "the wake-word server stopped answering (it stopped taking the sound it was sent)");
  assert.equal(detectors[1].closed, true);
  assert.equal(listener.view().listening, false);
  await connected(3);
  detectors[2].behind(64_000);
  streams[2].onSound(sound(100));
  assert.equal(listener.view().listening, true);
  await listener.close();
});

test("a wake-word server that breaks the protocol is let go", { timeout: 5_000 }, async () => {
  const lines: string[] = [];
  let made = 0;
  const listener = createListener({
    ears: () => ({ state: () => "idle", start: () => ({ ok: true }), fail: () => {} }),
    stream: () => ({ pid: 1, ended: new Promise(() => {}), stop: () => Promise.resolve({ reason: "x", failed: false, bytes: 0, ms: 0, sound: new Uint8Array(0) }) }),
    async connect() {
      made++;
      return {
        send: () => Promise.resolve(),
        next: () => Promise.reject(new Error("The Wyoming server sent a header that isn't JSON")),
        buffered: () => 0,
        close: () => {},
      };
    },
    log: (line) => lines.push(line),
    changed: () => {},
    retryMs: 10_000,
  });
  listener.waiting();
  await until(() => listener.view().problem !== null);
  assert.equal(listener.view().problem, "the wake-word server stopped answering (The Wyoming server sent a header that isn't JSON)");
  await pause(30);
  assert.equal(made, 1, "it waits before trying again");
  await listener.close();
});

test("closing lets everything go, and nothing is opened afterwards", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors } = setUp();
  listener.waiting();
  await connected(1);
  await listener.close();
  assert.deepEqual(streams[0].stopped, ["ears is shutting down"]);
  assert.equal(detectors[0].closed, true);
  listener.waiting();
  listener.update();
  await pause(20);
  assert.deepEqual([streams.length, detectors.length], [1, 1]);
});

test("every change it makes is reported, so a waiting chat hears of it", { timeout: 5_000 }, async () => {
  const { listener, connected, detectors, streams, sound, changes } = setUp();
  const before = changes();
  listener.waiting();
  await connected(1);
  const opened = changes();
  assert.ok(opened > before);
  streams[0].onSound(sound(100));
  assert.ok(changes() > opened, "starting to feed is reported");
  const feeding = changes();
  listener.hold("aa");
  assert.ok(changes() > feeding, "a hold is reported");
  await listener.close();
});

test("a microphone isn't opened again until the last one has really ended, since only one program can have it", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, earsState } = setUp({ slowStop: true });
  const done = listener.waiting();
  await connected(1);
  earsState.state = "muted";
  listener.update();
  assert.deepEqual(streams[0].stopped, ["ears is muted"]);
  earsState.state = "idle";
  listener.update();
  await connected(2);
  await pause(20);
  assert.equal(streams.length, 1, "the new one waits for the old one to end");
  streams[0].finish();
  await until(() => streams.length === 2);
  done();
  const closed = listener.close();
  streams[1].finish();
  await closed;
});

test("a microphone that dies during a recording isn't replaced by a spare one", { timeout: 5_000 }, async () => {
  const { listener, streams, earsState, lines } = setUp();
  earsState.state = "recording";
  const push = listener.tap("push");
  assert.equal(streams.length, 1);
  streams[0].die("the recorder was ended by SIGKILL");
  await push.ended;
  await pause(10);
  assert.equal(streams.length, 1);
  assert.equal(lines.filter((line) => line === "The microphone is open.").length, 1);
  earsState.state = "failed";
  await listener.close();
});

test("a detection the server sends more than 2 seconds behind the sound, or with no time, or from before the last restart, is ignored and logged", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, started, lines, sound } = setUp();
  listener.waiting();
  await connected(1);
  for (let frame = 0; frame < 40; frame++) streams[0].onSound(sound(50));
  detectors[0].detect(2001);
  await until(() => lines.some((line) => line.startsWith("Heard the wake word, but too late")));
  assert.match(lines.at(-1) ?? "", /^Heard the wake word, but too late to trust \(2\d\d\d ms behind\), so it was ignored\.$/);
  detectors[0].say({ type: "detection", data: { name: "hey_jarvis" }, payload: null });
  await until(() => lines.at(-1) === "Heard the wake word, but too late to trust (no time given), so it was ignored.");
  detectors[0].say({ type: "detection", data: { name: "hey_jarvis", timestamp: 999_999 }, payload: null });
  await until(() => lines.filter((line) => line.startsWith("Heard the wake word, but too late")).length === 3);
  assert.deepEqual(started, []);
  detectors[0].detect(1800);
  await until(() => started.length === 1);
  await listener.close();
});

test("a detection's time is counted from the latest audio-start, so one after a hold isn't taken as late", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, started, sound } = setUp({ gapMs: 0 });
  listener.waiting();
  await connected(1);
  for (let frame = 0; frame < 40; frame++) streams[0].onSound(sound(50));
  listener.hold("aa");
  streams[0].onSound(sound(50));
  listener.release("aa");
  for (let frame = 0; frame < 10; frame++) streams[0].onSound(sound(50));
  assert.equal(detectors[0].types().filter((type) => type === "audio-start").length, 2);
  detectors[0].detect();
  await until(() => started.length === 1);
  await listener.close();
});

test("holds are kept per chat: one letting go doesn't end another's, and the gap starts when the last lets go", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, sound } = setUp({ gapMs: 40 });
  listener.waiting();
  await connected(1);
  listener.hold("aa");
  listener.hold("bb");
  listener.release("aa");
  assert.equal(listener.view().held, true);
  streams[0].onSound(sound(100));
  assert.equal(detectors[0].types().includes("audio-chunk"), false);
  listener.release("cc");
  assert.equal(listener.view().held, true);
  listener.release("bb");
  assert.equal(listener.view().held, false);
  streams[0].onSound(sound(100));
  assert.equal(detectors[0].types().includes("audio-chunk"), false, "the gap after the last one");
  await pause(60);
  streams[0].onSound(sound(100));
  assert.equal(detectors[0].types().includes("audio-chunk"), true);
  await listener.close();
});

test("a chat letting go while another still holds starts no gap, so when the other's hold runs out it listens at once", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, sound } = setUp({ holdMs: 100, gapMs: 1_000 });
  listener.waiting();
  await connected(1);
  listener.hold("aa");
  listener.hold("bb");
  listener.release("aa");
  await pause(150);
  assert.equal(listener.view().held, false);
  streams[0].onSound(sound(100));
  assert.equal(detectors[0].types().includes("audio-chunk"), true);
  await listener.close();
});

test("one chat's hold runs out on its own, while another's goes on", { timeout: 5_000 }, async () => {
  const { listener, connected } = setUp({ holdMs: 100 });
  listener.waiting();
  await connected(1);
  listener.hold("aa");
  await pause(60);
  listener.hold("bb");
  await pause(60);
  assert.equal(listener.view().held, true);
  await until(() => !listener.view().held, 1000);
  await listener.close();
});

test("the room is measured from the last 3 seconds only", { timeout: 5_000 }, async () => {
  const { listener, connected, streams, detectors, lines } = setUp();
  listener.waiting();
  await connected(1);
  const level = (value: number) => {
    const piece = Buffer.alloc(3200);
    for (let index = 0; index < 1600; index++) piece.writeInt16LE(index % 2 === 0 ? value : -value, index * 2);
    return piece;
  };
  for (let frame = 0; frame < 30; frame++) streams[0].onSound(level(50));
  for (let frame = 0; frame < 30; frame++) streams[0].onSound(level(1000));
  detectors[0].detect();
  await until(() => lines.some((line) => line.startsWith("Heard the wake word.")));
  assert.equal(lines.find((line) => line.startsWith("Heard the wake word.")), "Heard the wake word. The room's background is 1000, so speech is anything above 3000.");
  await listener.close();
});

test("a chat's wait that's ended twice counts once, so a second chat still keeps the microphone open", { timeout: 5_000 }, async () => {
  const { listener, connected, streams } = setUp();
  const first = listener.waiting();
  await connected(1);
  first();
  first();
  const second = listener.waiting();
  await pause(150);
  assert.deepEqual(streams[0].stopped, []);
  second();
  await listener.close();
});

test("a hold running out is reported even with no sound coming in, so a waiting chat hears of it", { timeout: 5_000 }, async () => {
  const { listener, connected, changes } = setUp({ holdMs: 50 });
  listener.waiting();
  await connected(1);
  listener.hold("aa");
  const before = changes();
  await pause(120);
  assert.ok(changes() > before);
  await listener.close();
});
