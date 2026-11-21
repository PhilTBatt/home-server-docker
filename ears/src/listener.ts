import type { EarsState } from "./ears.js";
import { backgroundLevel, createFrames, createQuietEnd, createSpeechEnd, frameMs, quietForMs, speakingLevel } from "./levels.js";
import { bytesPerSecond, recordingRate, type Recording } from "./recorder.js";
import type { Detector } from "./silero.js";
import { startTap, type By, type Tap } from "./tap.js";
import type { WyomingConnection } from "./wyoming-client.js";

export const wakeWord = "hey_jarvis";
export const wakeHost = "openwakeword";
export const wakePort = 10400;
export const retryMs = 5_000;
export const presenceMs = 5_000;
export const holdMs = 15_000;
export const gapMs = 500;
export const beforeMs = 500;
export const backgroundMs = 3_000;
export const behindBytes = 2 * bytesPerSecond;
export const lateMs = 2_000;

const format = { rate: recordingRate, width: 2, channels: 1 };

export type WakeView = { on: boolean; listening: boolean; held: boolean; problem: string | null };

export const wakeOff: WakeView = { on: false, listening: false, held: false, problem: null };

export type ListenerEars = { state(): EarsState; start(by: By): { ok: true } | { ok: false; error: string }; fail(why: string): void };

export type ListenerDeps = {
  ears: () => ListenerEars;
  stream: (onSound: (sound: Buffer) => void) => Recording;
  connect: (signal: AbortSignal) => Promise<WyomingConnection>;
  log: (line: string) => void;
  changed: () => void;
  now?: () => number;
  word?: string;
  retryMs?: number;
  presenceMs?: number;
  holdMs?: number;
  gapMs?: number;
  beforeMs?: number;
  backgroundMs?: number;
  behindBytes?: number;
  lateMs?: number;
  settleMs?: number;
  startWithinMs?: number;
  quietForMs?: number;
  limitMs?: number;
  detector?: () => Detector;
};

export type Listener = {
  view(): WakeView;
  tap(by: By): Tap;
  update(): void;
  waiting(): () => void;
  hold(by: string): void;
  release(by: string): void;
  follow<T>(withinMs: number, start: () => T): T | { ok: false; error: string };
  close(): Promise<void>;
};

export const stillSpeaking = "a Jarvis chat is still speaking, so ears can't listen for a follow-up yet";
export const noRoomYet = "ears hasn't heard the room yet, so it couldn't tell speech from it";

function reasonOf(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error)).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/ {2,}/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

function joined(pieces: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let at = 0;
  for (const piece of pieces) {
    whole.set(piece, at);
    at += piece.length;
  }
  return whole;
}

export function createListener(deps: ListenerDeps): Listener {
  const now = deps.now ?? (() => performance.now());
  const word = deps.word ?? wakeWord;
  const keepBefore = ((deps.beforeMs ?? beforeMs) / 1000) * bytesPerSecond;
  const keepLevels = Math.max(1, Math.round((deps.backgroundMs ?? backgroundMs) / frameMs));
  const frames = createFrames();
  let stream: Recording | null = null;
  let tap: Tap | null = null;
  let detector: WyomingConnection | null = null;
  let connecting: AbortController | null = null;
  let retryAt = -Infinity;
  let problem: string | null = null;
  let feeding = false;
  let waits = 0;
  let lastWaitEnd = -Infinity;
  const holds = new Map<string, number>();
  let gapUntil = -Infinity;
  let closing: Promise<void> | null = null;
  let sentBytes = 0;
  let carry: number | null = null;
  let before: Uint8Array[] = [];
  let beforeBytes = 0;
  let levels: number[] = [];
  let pendingWake: { before: Uint8Array; background: number } | null = null;
  let pendingFollow: { withinMs: number; background: number } | null = null;
  let lastBackground: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const present = (at = now()) => waits > 0 || at < lastWaitEnd + (deps.presenceMs ?? presenceMs);
  const heldUntil = () => {
    const at = now();
    for (const [by, until] of holds) if (until <= at) holds.delete(by);
    return holds.size === 0 ? -Infinity : Math.max(...holds.values());
  };
  const held = () => now() < heldUntil();
  const live = (state: EarsState) => state === "idle" || state === "recording" || state === "working";
  const canFeed = () => !closed && tap === null && stream !== null && detector !== null && present() && !held() && now() >= gapUntil && deps.ears().state() === "idle";

  const setProblem = (text: string) => {
    if (text === problem) return;
    problem = text;
    deps.log(`The wake word isn't working: ${text}.`);
  };
  const forget = () => {
    frames.clear();
    before = [];
    beforeBytes = 0;
    levels = [];
  };
  const send = (connection: WyomingConnection, type: string, payload: Uint8Array | null = null) => {
    connection.send({ type, data: type === "audio-stop" ? {} : { ...format }, payload }).catch((error: unknown) => lost(connection, reasonOf(error)));
  };
  const startFeeding = (connection: WyomingConnection) => {
    feeding = true;
    sentBytes = 0;
    forget();
    send(connection, "audio-start");
    deps.changed();
  };
  const stopFeeding = () => {
    if (!feeding) return;
    feeding = false;
    forget();
    if (detector !== null) send(detector, "audio-stop");
    deps.changed();
  };
  const lost = (connection: WyomingConnection, why: string) => {
    if (detector !== connection) return;
    detector = null;
    feeding = false;
    forget();
    connection.close();
    setProblem(`the wake-word server stopped answering (${why})`);
    retryAt = now() + (deps.retryMs ?? retryMs);
    update();
  };
  const dropDetector = () => {
    const connection = detector;
    detector = null;
    feeding = false;
    forget();
    connection?.close();
  };
  const onDetection = (timestamp: unknown) => {
    if (!feeding) {
      deps.log("Heard the wake word while it wasn't being listened for, so it was ignored.");
      return;
    }
    const late = (sentBytes / bytesPerSecond) * 1000 - (typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : Number.NaN);
    if (!(late >= 0 && late <= (deps.lateMs ?? lateMs))) {
      deps.log(`Heard the wake word, but too late to trust (${Number.isNaN(late) ? "no time given" : `${Math.round(late)} ms behind`}), so it was ignored.`);
      return;
    }
    const background = backgroundLevel(levels);
    const sound = joined(before);
    deps.log(`Heard the wake word. The room's background is ${background}, so speech is anything above ${speakingLevel(background)}.`);
    lastBackground = background;
    pendingWake = { before: sound, background };
    const started = deps.ears().start("wake");
    pendingWake = null;
    if (!started.ok) deps.log(`Couldn't record after the wake word: ${started.error}.`);
  };
  const readDetections = async (connection: WyomingConnection) => {
    try {
      for (;;) {
        const event = await connection.next();
        if (event === null) {
          lost(connection, "it closed the connection");
          return;
        }
        if (event.type === "detection" && detector === connection) onDetection(event.data.timestamp);
      }
    } catch (error) {
      lost(connection, reasonOf(error));
    }
  };
  const connectDetector = async () => {
    const calledOff = new AbortController();
    connecting = calledOff;
    try {
      const connection = await deps.connect(calledOff.signal);
      if (calledOff.signal.aborted || closed) {
        connection.close();
        return;
      }
      await connection.send({ type: "detect", data: { names: [word] }, payload: null });
      if (calledOff.signal.aborted || closed) {
        connection.close();
        return;
      }
      detector = connection;
      if (problem !== null) {
        problem = null;
        deps.log("The wake word is working again.");
      }
      void readDetections(connection);
    } catch (error) {
      if (calledOff.signal.aborted) return;
      setProblem(`the wake-word server can't be reached (${reasonOf(error)})`);
      retryAt = now() + (deps.retryMs ?? retryMs);
    } finally {
      if (connecting === calledOff) connecting = null;
      update();
    }
  };
  const onSound = (chunk: Buffer) => {
    let sound: Uint8Array = chunk;
    if (carry !== null) {
      sound = new Uint8Array(chunk.length + 1);
      sound[0] = carry;
      sound.set(chunk, 1);
      carry = null;
    }
    if (sound.length % 2 === 1) {
      carry = sound[sound.length - 1];
      sound = sound.subarray(0, sound.length - 1);
    }
    if (sound.length === 0) return;
    if (tap !== null) {
      tap.push(held() ? new Uint8Array(sound.length) : sound);
      return;
    }
    const connection = detector;
    if (connection === null || !canFeed()) {
      stopFeeding();
      return;
    }
    if (!feeding) startFeeding(connection);
    const copy = new Uint8Array(sound);
    send(connection, "audio-chunk", copy);
    sentBytes += copy.length;
    before.push(copy);
    beforeBytes += copy.length;
    while (before.length > 1 && beforeBytes - before[0].length >= keepBefore) beforeBytes -= (before.shift() as Uint8Array).length;
    levels.push(...frames.push(copy));
    if (levels.length > keepLevels) levels = levels.slice(-keepLevels);
    if (connection.buffered() > (deps.behindBytes ?? behindBytes)) lost(connection, "it stopped taking the sound it was sent");
  };
  const openStream = () => {
    carry = null;
    const opened = deps.stream((chunk) => {
      if (stream === opened) onSound(chunk);
    });
    stream = opened;
    deps.log("The microphone is open.");
    void opened.ended.then((end) => {
      if (stream !== opened) return;
      stream = null;
      stopFeeding();
      const why = `the microphone stopped (${end.reason})`;
      deps.log(`The microphone is closed: ${why}.`);
      const failing = tap;
      tap = null;
      if (failing !== null) failing.fail(why);
      else deps.ears().fail(why);
      update();
    });
  };
  const closeStream = (why: string) => {
    const open = stream;
    if (open === null) return closing ?? Promise.resolve();
    stream = null;
    stopFeeding();
    deps.log(`The microphone is closed: ${why}.`);
    const done = open.stop(why).then(
      () => {},
      () => {},
    );
    closing = done;
    void done.then(() => {
      if (closing !== done) return;
      closing = null;
      update();
    });
    return done;
  };
  const schedule = (at = now()) => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (closed) return;
    const times = [heldUntil(), gapUntil, waits === 0 ? lastWaitEnd + (deps.presenceMs ?? presenceMs) : -Infinity, detector === null && connecting === null ? retryAt : -Infinity].filter((time) => time > at && Number.isFinite(time));
    if (times.length === 0) return;
    timer = setTimeout(update, Math.max(1, Math.ceil(Math.min(...times) - at)));
  };
  function update() {
    if (closed) return;
    const at = now();
    const state = deps.ears().state();
    const here = present(at);
    const wanted = here && live(state);
    if (!wanted) {
      connecting?.abort();
      connecting = null;
      dropDetector();
    }
    const hearing = wanted && detector !== null;
    if ((tap !== null || hearing) && stream === null && closing === null) openStream();
    if (tap === null && !hearing && stream !== null) void closeStream(!live(state) ? `ears is ${state}` : !here ? "no Jarvis chat is listening for the wake word" : "the wake-word server can't be used");
    if (wanted && detector === null && connecting === null && now() >= retryAt) void connectDetector();
    if (feeding && !canFeed()) stopFeeding();
    schedule(at);
    deps.changed();
  }

  return {
    view: () => ({ on: true, listening: feeding, held: held(), problem }),
    tap(by) {
      const follow = by === "follow" ? pendingFollow : null;
      const wake = by === "wake" ? pendingWake : follow === null ? null : { before: undefined, background: follow.background };
      const timings = follow === null ? { settleMs: deps.settleMs, startWithinMs: deps.startWithinMs, quietForMs: deps.quietForMs } : { settleMs: 0, startWithinMs: follow.withinMs, quietForMs: deps.quietForMs };
      const detector = deps.detector;
      const started = startTap({
        by,
        before: wake?.before,
        quiet: wake === null || detector !== undefined ? null : createQuietEnd({ speakingAbove: speakingLevel(wake.background), ...timings }),
        judged:
          wake === null || detector === undefined
            ? null
            : {
                detector: detector(),
                end: createSpeechEnd({ by: "silero", ...timings }),
                fallback: (level) => level > speakingLevel(wake.background),
                failed: (why) => deps.log(`The speech detector failed (${why}), so this recording ends on loudness instead.`),
              },
        ender: wake === null ? undefined : detector === undefined ? "loudness" : "silero",
        pauseMs: wake === null ? undefined : (deps.quietForMs ?? quietForMs),
        limitMs: deps.limitMs,
        now,
      });
      tap = started;
      void started.ended.then(() => {
        if (tap === started) tap = null;
        update();
      });
      update();
      return started;
    },
    update,
    waiting() {
      waits++;
      update();
      let done = false;
      return () => {
        if (done) return;
        done = true;
        waits--;
        lastWaitEnd = now();
        update();
      };
    },
    hold(by) {
      holds.set(by, now() + (deps.holdMs ?? holdMs));
      update();
    },
    release(by) {
      const was = held();
      holds.delete(by);
      if (was && !held()) gapUntil = now() + (deps.gapMs ?? gapMs);
      update();
    },
    follow(withinMs, start) {
      if (deps.ears().state() !== "idle") return start();
      if (held()) return { ok: false, error: stillSpeaking };
      const background = lastBackground ?? (levels.length === 0 ? null : backgroundLevel(levels));
      if (background === null) return { ok: false, error: noRoomYet };
      pendingFollow = { withinMs, background };
      try {
        return start();
      } finally {
        pendingFollow = null;
      }
    },
    async close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      connecting?.abort();
      dropDetector();
      await closeStream("ears is shutting down");
    },
  };
}
