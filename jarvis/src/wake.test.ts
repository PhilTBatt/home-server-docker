import assert from "node:assert/strict";
import { test } from "node:test";
import type { EarsAnswer, EarsCall } from "./ears-client.js";
import { eager, holdEveryMs, holderId, oldEarsLine, retryMs, spokenOf, startWakeHold, waitAskMs, wakeStatus, watchWake, type WakeEvent } from "./wake.js";

function view(fields: Partial<EarsAnswer> = {}): EarsAnswer {
  return { status: 200, state: "idle", reason: null, error: null, seconds: null, last: null, version: 1, run: "aa", lastId: null, current: null, wake: { on: true, listening: true, held: false, problem: null }, ...fields };
}

const last = (text: string | null, textProblem: string | null = null) => ({ seconds: 3.2, reason: "it went quiet for 1.5 seconds after you spoke", text, textProblem });

type Step = EarsAnswer | Error | ((signal: AbortSignal | undefined) => Promise<EarsAnswer>);

function pretendEars(waits: Step[], claims: (EarsAnswer | Error)[] = []) {
  const asked: { method: string; path: string; ms: number }[] = [];
  const call: EarsCall = async (method, path, ms, signal) => {
    asked.push({ method, path, ms });
    if (path.startsWith("/wake/claim")) {
      const next = claims.shift();
      if (next === undefined) throw new Error("no claim set");
      if (next instanceof Error) throw next;
      return next;
    }
    const next = waits.shift();
    if (next === undefined) {
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(signal) : next;
  };
  return { asked, call };
}

async function take(events: AsyncGenerator<WakeEvent>, count: number): Promise<WakeEvent[]> {
  const got: WakeEvent[] = [];
  for (let index = 0; index < count; index++) {
    const next = await events.next();
    if (next.done === true) break;
    got.push(next.value);
  }
  return got;
}

const noPause = async () => {};

test("a chat waits on ears for up to 30 seconds at a time, tries again after 2 seconds, and holds the wake word every 5 seconds while he speaks", () => {
  assert.deepEqual([waitAskMs, retryMs, holdEveryMs], [30_000, 2_000, 5_000]);
});

test("the wake word's status says it's on, or why it's off and what to do", () => {
  assert.equal(wakeStatus(view()), "on: say Hey Jarvis");
  assert.equal(wakeStatus(view({ state: "recording" })), "on: say Hey Jarvis");
  assert.equal(wakeStatus(view({ state: "muted" })), "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute");
  assert.equal(wakeStatus(view({ state: "failed", reason: "the microphone stopped (x)" })), "off: ears failed (the microphone stopped (x)), so unmute it on the server with bash host/ears.sh unmute to start it again");
  assert.equal(wakeStatus(view({ state: "failed", reason: null })), "off: ears failed (no reason given), so unmute it on the server with bash host/ears.sh unmute to start it again");
  assert.equal(wakeStatus(view({ wake: { on: false, listening: false, held: false, problem: null } })), "off: ears has the wake word off, so set EARS_WAKE=on in ears/.env and start it again with bash host/ears.sh start");
  assert.equal(wakeStatus(view({ wake: null })), "off: ears has the wake word off, so set EARS_WAKE=on in ears/.env and start it again with bash host/ears.sh start");
  assert.equal(wakeStatus(view({ wake: { on: true, listening: false, held: false, problem: "the wake-word server can't be reached (ENOTFOUND)" } })), "off: the wake-word server can't be reached (ENOTFOUND)");
  assert.equal(wakeStatus(view({ status: 404, version: undefined })), oldEarsLine);
  assert.equal(wakeStatus(view({ version: null })), oldEarsLine);
  assert.equal(oldEarsLine, "off: this ears doesn't know the wake word yet, so start it again with bash host/ears.sh start, which rebuilds it");
  assert.equal(wakeStatus(view({ status: 500, error: "boom" })), "off: ears answered 500 (boom)");
  assert.equal(wakeStatus(view({ status: 502 })), "off: ears answered 502");
});

test("the watcher says the status when it changes, not otherwise, and waits from the version it last saw, naming the run", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([view({ version: 4 }), view({ version: 5 }), view({ version: 6, state: "muted" }), view({ version: 7, state: "idle" })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause });
  assert.deepEqual(await take(events, 3), [
    { kind: "status", line: "on: say Hey Jarvis" },
    { kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" },
    { kind: "status", line: "on: say Hey Jarvis" },
  ]);
  assert.deepEqual(ears.asked.slice(0, 4).map((one) => [one.method, one.path, one.ms]), [
    ["GET", "/wait?after=-1", 30_000],
    ["GET", "/wait?after=4&run=aa", 30_000],
    ["GET", "/wait?after=5&run=aa", 30_000],
    ["GET", "/wait?after=6&run=aa", 30_000],
  ]);
  signal.abort();
  assert.deepEqual(await take(events, 1), []);
});

test("a status the chat already showed isn't repeated", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([view({ version: 1 }), view({ version: 2, state: "muted" })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis" });
  assert.deepEqual(await take(events, 1), [{ kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" }]);
  signal.abort();
});

test("a wake-word recording nobody has taken is claimed, and once claimed it's a wake for the chat, then done when its text is there", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const clock = { at: 1000 };
  const recording = view({ version: 2, state: "recording", current: { id: 7, by: "wake", claimed: false }, lastId: 6, wake: { on: true, listening: false, held: false, problem: null } });
  const claimed = view({ version: 3, state: "recording", current: { id: 7, by: "wake", claimed: true }, lastId: 6 });
  const ears = pretendEars(
    [
      view({ version: 1 }),
      recording,
      view({ version: 4, state: "recording", current: { id: 7, by: "wake", claimed: true }, lastId: 6 }),
      () => {
        clock.at = 5000;
        return Promise.resolve(view({ version: 5, state: "working", lastId: 7, last: last(null) }));
      },
      () => {
        clock.at = 6200;
        return Promise.resolve(view({ version: 6, state: "idle", lastId: 7, last: last("What's the time?") }));
      },
    ],
    [claimed],
  );
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, now: () => clock.at });
  const got = await take(events, 3);
  assert.deepEqual(got.slice(0, 2), [{ kind: "status", line: "on: say Hey Jarvis" }, { kind: "wake", id: 7 }]);
  assert.deepEqual(got[2], { kind: "done", id: 7, answer: view({ version: 6, state: "idle", lastId: 7, last: last("What's the time?") }), textMs: 1200 });
  assert.deepEqual(ears.asked.filter((one) => one.method === "POST").map((one) => [one.path, one.ms]), [["/wake/claim?id=7", 4000]]);
  signal.abort();
});

test("a claim that loses to another chat, or fails, is left alone", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const recording = (version: number, id: number) => view({ version, state: "recording", current: { id, by: "wake", claimed: false } });
  const ears = pretendEars([recording(1, 1), recording(2, 2), view({ version: 3, state: "muted" })], [view({ status: 409, error: "that wake-word recording isn't waiting to be taken" }), new Error("Ears didn't answer within 4 seconds")]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause });
  assert.deepEqual(await take(events, 2), [{ kind: "status", line: "on: say Hey Jarvis" }, { kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" }]);
  assert.equal(ears.asked.filter((one) => one.method === "POST").length, 2);
  signal.abort();
});

test("push recordings and claimed ones aren't claimed", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 1, by: "push", claimed: false } }), view({ version: 2, state: "recording", current: { id: 2, by: "wake", claimed: true } }), view({ version: 3, state: "muted" })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause });
  await take(events, 2);
  assert.equal(ears.asked.filter((one) => one.method === "POST").length, 0);
  signal.abort();
});

test("a recording that ends by a mute, a failure or a cancel is done too, with whatever ears says", { timeout: 5_000 }, async () => {
  for (const ending of [view({ version: 3, state: "muted", lastId: 1, last: last(null, "it was cleared by a mute") }), view({ version: 3, state: "failed", reason: "the microphone stopped (x)", lastId: 1 }), view({ version: 3, state: "idle", lastId: 1, last: { seconds: 2, reason: "asked to cancel", text: null, textProblem: null } })]) {
    const signal = new AbortController();
    const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 1, by: "wake", claimed: false } }), ending], [view({ version: 2, state: "recording", current: { id: 1, by: "wake", claimed: true } })]);
    const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis", now: () => 0 });
    const got = await take(events, ending.state === "idle" ? 2 : 3);
    assert.deepEqual(got.at(-1), { kind: "done", id: 1, answer: ending, textMs: 0 }, ending.state ?? "");
    signal.abort();
  }
});

test("when ears can't be reached, that's the status, a recording the chat took is done, and it tries again after a pause", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const pauses: number[] = [];
  const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 3, by: "wake", claimed: false } }), new Error("Couldn't reach ears at http://ears:8090 (ENOTFOUND). Start it on the server with bash host/ears.sh start"), view({ version: 1, run: "bb" })], [view({ version: 2, state: "recording", current: { id: 3, by: "wake", claimed: true } })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: async (ms) => void pauses.push(ms), first: "on: say Hey Jarvis" });
  const got = await take(events, 4);
  assert.deepEqual(got[0], { kind: "wake", id: 3 });
  assert.deepEqual(got[1], { kind: "status", line: "off: Couldn't reach ears at http://ears:8090 (ENOTFOUND). Start it on the server with bash host/ears.sh start" });
  assert.equal(got[2].kind, "done");
  assert.deepEqual(got[2].kind === "done" && [got[2].id, got[2].answer.status, got[2].answer.error], [3, 503, "Couldn't reach ears at http://ears:8090 (ENOTFOUND). Start it on the server with bash host/ears.sh start"]);
  assert.deepEqual(got[3], { kind: "status", line: "on: say Hey Jarvis" });
  assert.deepEqual(pauses, [2000]);
  assert.equal(ears.asked.at(-1)?.path, "/wait?after=1&run=aa", "after a failure it carries on from what it knew");
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ears.asked.at(-1)?.path, "/wait?after=1&run=bb");
  signal.abort();
  await next;
});

test("an ears without the wake word's routes is said once, and asked again after a pause", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const pauses: number[] = [];
  const old = { status: 404, state: null, reason: null, error: "No such route", seconds: null, last: null };
  const plain = { status: 200, state: "idle", reason: null, error: null, seconds: null, last: null };
  const ears = pretendEars([old, old, plain]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: async (ms) => void pauses.push(ms) });
  assert.deepEqual(await take(events, 1), [{ kind: "status", line: oldEarsLine }]);
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(pauses, [2000, 2000, 2000]);
  assert.ok(ears.asked.every((one) => one.path === "/wait?after=-1"));
  signal.abort();
  assert.deepEqual(await next, { done: true, value: undefined });
});

test("a restarted ears is noticed by its new run, and a recording the chat took from the old one is done as lost", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([view({ version: 1, run: "aa", state: "recording", current: { id: 2, by: "wake", claimed: false } }), view({ version: 0, run: "cc", state: "muted" })], [view({ version: 2, run: "aa", state: "recording", current: { id: 2, by: "wake", claimed: true } })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis" });
  const got = await take(events, 3);
  assert.deepEqual(got[0], { kind: "wake", id: 2 });
  assert.deepEqual(got[1], { kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" });
  assert.deepEqual(got[2].kind === "done" && [got[2].id, got[2].answer.status, got[2].answer.error, got[2].textMs], [2, 409, "ears started again, so the recording was lost", 0]);
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ears.asked.at(-1)?.path, "/wait?after=0&run=cc");
  signal.abort();
  await next;
});

test("the watcher stops at once when called off, even in the middle of a wait", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([view({ version: 1 })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis" });
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 10));
  signal.abort();
  assert.deepEqual(await next, { done: true, value: undefined });
});

test("by default the watcher pauses for real between tries, and a call-off ends the pause", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([new Error("down")]);
  const events = watchWake({ call: ears.call, signal: signal.signal, retryMs: 60_000 });
  assert.deepEqual(await take(events, 1), [{ kind: "status", line: "off: down" }]);
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const began = performance.now();
  signal.abort();
  assert.deepEqual(await next, { done: true, value: undefined });
  assert.ok(performance.now() - began < 1000);
});

function pretendHolds() {
  const told: string[] = [];
  const call: EarsCall = async (method, path) => {
    told.push(`${method} ${path}`);
    return view();
  };
  return { told, call };
}

test("while he speaks the wake word is held, renewed, and let go once every answer's speech is over", { timeout: 5_000 }, async () => {
  const { told, call } = pretendHolds();
  const hold = startWakeHold(call, "ab12", 30);
  let first: () => void = () => {};
  let second: () => void = () => {};
  hold.during(() => new Promise<void>((resolve) => (first = resolve)));
  hold.during(() => new Promise<void>((resolve) => (second = resolve)));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(told[0], "POST /wake/hold?by=ab12");
  assert.ok(told.filter((line) => line === "POST /wake/hold?by=ab12").length >= 2, told.join(", "));
  first();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(told.includes("POST /wake/release?by=ab12"), false);
  second();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(told.at(-1), "POST /wake/release?by=ab12");
  const count = told.length;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(told.length, count, "no more holds once it's let go");
  hold.close();
});

test("a speech that fails still lets go, and a hold, its renewals and the release go to ears one after another", { timeout: 5_000 }, async () => {
  const order: string[] = [];
  let slow: () => void = () => {};
  const call: EarsCall = async (_method, path) => {
    order.push(`start ${path}`);
    if (path === "/wake/hold?by=ab12" && order.length === 1) await new Promise<void>((resolve) => (slow = resolve));
    order.push(`end ${path}`);
    return view();
  };
  const hold = startWakeHold(call, "ab12", 60_000);
  hold.during(() => Promise.reject(new Error("player broke")));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, ["start /wake/hold?by=ab12"], "the release waits for the hold to be answered");
  slow();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, ["start /wake/hold?by=ab12", "end /wake/hold?by=ab12", "start /wake/release?by=ab12", "end /wake/release?by=ab12"]);
  hold.close();
});

test("ears not answering a hold doesn't stop the next one", { timeout: 5_000 }, async () => {
  let calls = 0;
  const call: EarsCall = async () => {
    calls++;
    throw new Error("Ears didn't answer within 4 seconds");
  };
  const hold = startWakeHold(call, "ab12", 20);
  hold.during(() => new Promise(() => {}));
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.ok(calls >= 3, String(calls));
  hold.close();
});

test("closing lets go of a hold still on, once, and nothing more is held after", { timeout: 5_000 }, async () => {
  const { told, call } = pretendHolds();
  const hold = startWakeHold(call, "ab12", 60_000);
  let speaking: () => void = () => {};
  hold.during(() => new Promise<void>((resolve) => (speaking = resolve)));
  hold.close();
  hold.close();
  speaking();
  hold.during(() => Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(told, ["POST /wake/hold?by=ab12", "POST /wake/release?by=ab12"]);
  const idle = pretendHolds();
  const unused = startWakeHold(idle.call, "ab12");
  unused.close();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(idle.told, []);
});

test("an answer's speech is over only when the speech it ends with is over, however many times it started again", { timeout: 5_000 }, async () => {
  const queues: { done: Promise<void>; finish: () => void }[] = [];
  const fresh = () => {
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => (finish = resolve));
    queues.push({ done, finish });
  };
  fresh();
  const speech = { done: () => queues.at(-1)?.done as Promise<void> };
  let over = false;
  void spokenOf(speech)().then(() => (over = true));
  fresh();
  queues[0].finish();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(over, false);
  queues[1].finish();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(over, true);
  const failed = Promise.reject(new Error("the player broke"));
  failed.catch(() => {});
  await spokenOf({ done: () => failed })();
});

test("each chat names its holds with its own id, so ears keeps them apart", { timeout: 5_000 }, async () => {
  const ids = new Set(Array.from({ length: 50 }, () => holderId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^[0-9a-f]{16}$/);
  const { told, call } = pretendHolds();
  const hold = startWakeHold(call);
  hold.during(() => Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(told[0], /^POST \/wake\/hold\?by=[0-9a-f]{16}$/);
  assert.equal(told[1], told[0].replace("hold", "release"));
  hold.close();
});

test("the pump keeps reading the watcher while nobody is taking its events, and hands them over in order", { timeout: 5_000 }, async () => {
  let made = 0;
  async function* source() {
    for (let index = 1; index <= 3; index++) {
      made++;
      yield index;
    }
  }
  const pumped = eager(source());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(made, 3, "all were read before anyone asked");
  const got: number[] = [];
  for await (const value of pumped) got.push(value);
  assert.deepEqual(got, [1, 2, 3]);
});

test("the pump hands over events that come later, and passes on a failure once the events before it are taken", { timeout: 5_000 }, async () => {
  let release: () => void = () => {};
  async function* source() {
    yield "a";
    await new Promise<void>((resolve) => (release = resolve));
    yield "b";
    throw new Error("the watcher broke");
  }
  const pumped = eager(source())[Symbol.asyncIterator]();
  assert.deepEqual(await pumped.next(), { done: false, value: "a" });
  const waiting = pumped.next();
  release();
  assert.deepEqual(await waiting, { done: false, value: "b" });
  await assert.rejects(pumped.next(), { message: "the watcher broke" });
});
