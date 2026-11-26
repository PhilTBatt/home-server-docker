import assert from "node:assert/strict";
import { test } from "node:test";
import type { EarsAnswer, EarsCall } from "./ears-client.js";
import { busyClaimMs, createFollowAsk, eager, holdEveryMs, holderId, oldEarsLine, oldFollowWhy, retryMs, spokenOf, startWakeHold, stopOnCutIn, waitAskMs, wakeStatus, watchWake, type WakeEvent } from "./wake.js";

function view(fields: Partial<EarsAnswer> = {}): EarsAnswer {
  return { status: 200, state: "idle", reason: null, error: null, seconds: null, last: null, version: 1, run: "aa", lastId: null, current: null, wake: { on: true, listening: true, held: false, problem: null }, ...fields };
}

const last = (text: string | null, textProblem: string | null = null) => ({ seconds: 3.2, reason: "it went quiet for 1.5 seconds after you spoke", text, textProblem });

type Step = EarsAnswer | Error | ((signal: AbortSignal | undefined) => Promise<EarsAnswer>);

function pretendEars(waits: Step[], claims: (EarsAnswer | Error)[] = []) {
  const asked: { method: string; path: string; ms: number }[] = [];
  const call: EarsCall = async (method, path, ms, signal) => {
    asked.push({ method, path, ms });
    if (path.startsWith("/wake/claim") || path.startsWith("/wake/follow")) {
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

test("a chat that's busy waits a second before it claims a wake, so an idle chat gets it first, and an idle one claims at once", { timeout: 5_000 }, async () => {
  assert.equal(busyClaimMs, 1_000);
  for (const busy of [true, false]) {
    const signal = new AbortController();
    const order: string[] = [];
    const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 4, by: "wake", claimed: false } })], [view({ version: 2, state: "recording", current: { id: 4, by: "wake", claimed: true } })]);
    const call: EarsCall = async (method, path, ms, signal) => {
      if (path.startsWith("/wake/claim")) order.push("claim");
      return ears.call(method, path, ms, signal);
    };
    const events = watchWake({ call, signal: signal.signal, wait: async (ms) => void order.push(`wait ${ms}`), first: "on: say Hey Jarvis", busy: () => busy });
    assert.deepEqual(await take(events, 1), [{ kind: "wake", id: 4 }]);
    assert.deepEqual(order, busy ? ["wait 1000", "claim"] : ["claim"]);
    signal.abort();
  }
});

test("a busy chat that loses the claim while it waits, or is called off, leaves the recording alone", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 4, by: "wake", claimed: false } }), view({ version: 3, state: "muted" })], [view({ status: 409, error: "that wake-word recording isn't waiting to be taken" })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis", busy: () => true, busyClaimMs: 5 });
  assert.deepEqual(await take(events, 1), [{ kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" }]);
  assert.deepEqual(ears.asked.filter((one) => one.method === "POST").map((one) => one.path), ["/wake/claim?id=4"]);
  signal.abort();
  const off = new AbortController();
  const quiet = pretendEars([view({ version: 1, state: "recording", current: { id: 5, by: "wake", claimed: false } })]);
  const stopped = watchWake({ call: quiet.call, signal: off.signal, wait: async () => off.abort(), first: "on: say Hey Jarvis", busy: () => true });
  assert.deepEqual(await stopped.next(), { done: true, value: undefined });
  assert.equal(quiet.asked.filter((one) => one.method === "POST").length, 0);
});

test("a watcher called off while it has a wake recording it claimed cancels that recording by its number, and one with none cancels nothing", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const posts: string[] = [];
  const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 6, by: "wake", claimed: false } })], [view({ version: 2, state: "recording", current: { id: 6, by: "wake", claimed: true } })]);
  const call: EarsCall = async (method, path, ms, signal) => {
    if (method === "POST") posts.push(`${path} ${signal === undefined ? "no signal" : "signal"}`);
    if (path.startsWith("/recording/cancel")) return view({ status: 200 });
    return ears.call(method, path, ms, signal);
  };
  const events = watchWake({ call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis" });
  assert.deepEqual(await take(events, 1), [{ kind: "wake", id: 6 }]);
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 5));
  signal.abort();
  assert.deepEqual(await next, { done: true, value: undefined });
  assert.deepEqual(posts, ["/wake/claim?id=6 signal", "/recording/cancel?id=6 no signal"]);
  const none = new AbortController();
  const quiet: string[] = [];
  const plain = pretendEars([view({ version: 1 })]);
  const idle = watchWake({ call: async (method, path, ms, signal) => (method === "POST" && quiet.push(path), plain.call(method, path, ms, signal)), signal: none.signal, wait: noPause, first: "on: say Hey Jarvis" });
  const waiting = idle.next();
  await new Promise((resolve) => setTimeout(resolve, 5));
  none.abort();
  await waiting;
  assert.deepEqual(quiet, []);
});

test("a follow-up asked for cuts the long wait short, is started in ears with the wait asked for, and is the chat's at once, with no claim, then done like a wake", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const follow = createFollowAsk();
  const clock = { at: 1000 };
  let cutShort = false;
  const ears = pretendEars(
    [
      view({ version: 1 }),
      (waitSignal) =>
        new Promise((_resolve, reject) =>
          waitSignal?.addEventListener("abort", () => {
            cutShort = true;
            reject(waitSignal.reason);
          }, { once: true }),
        ),
      view({ version: 2, state: "recording", current: { id: 8, by: "follow", claimed: true }, lastId: 7 }),
      () => {
        clock.at = 4000;
        return Promise.resolve(view({ version: 3, state: "working", lastId: 8, last: last(null) }));
      },
      () => {
        clock.at = 4800;
        return Promise.resolve(view({ version: 4, state: "idle", lastId: 8, last: last("And tomorrow?") }));
      },
    ],
    [{ status: 200, state: "recording", reason: null, error: null, seconds: null, last: null, lastId: 7, id: 8 }],
  );
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, now: () => clock.at, follow });
  assert.deepEqual(await take(events, 1), [{ kind: "status", line: "on: say Hey Jarvis" }]);
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 5));
  follow.ask(5000);
  assert.deepEqual((await next).value, { kind: "wake", id: 8, follow: true });
  assert.equal(cutShort, true, "the wait that was going on was cut short");
  assert.deepEqual(await take(events, 1), [{ kind: "done", id: 8, answer: view({ version: 4, state: "idle", lastId: 8, last: last("And tomorrow?") }), textMs: 800 }]);
  assert.deepEqual(ears.asked.filter((one) => one.method === "POST").map((one) => [one.path, one.ms]), [["/wake/follow?within=5000", 4000]]);
  assert.deepEqual(ears.asked.filter((one) => one.method === "GET").map((one) => one.path), ["/wait?after=-1", "/wait?after=1&run=aa", "/wait?after=1&run=aa", "/wait?after=2&run=aa", "/wait?after=3&run=aa"], "the wait that was cut short is asked again from the same version");
  signal.abort();
});

test("a follow-up ears refuses, or an ears too old for them, or one that doesn't answer, is said with why, and the watcher carries on", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const follow = createFollowAsk();
  follow.ask(5000);
  const refused = { status: 409, state: "idle", reason: null, error: "a Jarvis chat is still speaking, so ears can't listen for a follow-up yet", seconds: null, last: null };
  const old = { status: 404, state: null, reason: null, error: "Not found", seconds: null, last: null };
  const ears = pretendEars([view({ version: 1 }), view({ version: 2 }), view({ version: 3 }), view({ version: 4, state: "muted" })], [refused, old, new Error("Ears didn't answer within 4 seconds")]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis", follow });
  assert.deepEqual(await take(events, 1), [{ kind: "no follow-up", why: "a Jarvis chat is still speaking, so ears can't listen for a follow-up yet" }]);
  follow.ask(5000);
  assert.deepEqual(await take(events, 1), [{ kind: "no follow-up", why: oldFollowWhy }]);
  assert.equal(oldFollowWhy, "this ears doesn't know follow-ups yet, so start it again with bash host/ears.sh start, which rebuilds it");
  follow.ask(5000);
  assert.deepEqual(await take(events, 1), [{ kind: "no follow-up", why: "Ears didn't answer within 4 seconds" }]);
  assert.deepEqual(await take(events, 1), [{ kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" }], "it goes on waiting after each");
  signal.abort();
});

test("when asking for a follow-up fails or is called off, a follow-up ears started anyway is cancelled by its number, and nothing else is", { timeout: 5_000 }, async () => {
  const run = async (stray: EarsAnswer["current"], callOff: boolean) => {
    const signal = new AbortController();
    const follow = createFollowAsk();
    const posts: string[] = [];
    const call: EarsCall = async (method, path, _ms, callSignal) => {
      if (method === "POST") posts.push(`${path} ${callSignal === undefined ? "no signal" : "signal"}`);
      if (path.startsWith("/wake/follow")) {
        if (callOff) signal.abort();
        throw new Error("Ears didn't answer within 4 seconds");
      }
      if (path === "/wait?after=-1") return view({ version: 9, state: stray === null ? "idle" : "recording", current: stray });
      if (path.startsWith("/recording/cancel")) return view({ version: 10 });
      return new Promise((_resolve, reject) => callSignal?.addEventListener("abort", () => reject(callSignal.reason), { once: true }));
    };
    follow.ask(5000);
    const events = watchWake({ call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis", follow });
    const got = callOff ? [] : await take(events, 1);
    if (callOff) assert.deepEqual(await events.next(), { done: true, value: undefined });
    signal.abort();
    return { posts, got };
  };
  const failed = await run({ id: 12, by: "follow", claimed: true }, false);
  assert.deepEqual(failed.posts, ["/wake/follow?within=5000 signal", "/recording/cancel?id=12 no signal"]);
  assert.deepEqual(failed.got, [{ kind: "no follow-up", why: "Ears didn't answer within 4 seconds" }]);
  assert.deepEqual((await run({ id: 13, by: "wake", claimed: true }, false)).posts, ["/wake/follow?within=5000 signal"], "another chat's wake recording is left alone");
  assert.deepEqual((await run(null, false)).posts, ["/wake/follow?within=5000 signal"]);
  assert.deepEqual((await run({ id: 14, by: "follow", claimed: true }, true)).posts, ["/wake/follow?within=5000 signal", "/recording/cancel?id=14 no signal"], "called off while asking, it still cleans up");
});

test("a follow-up asked for while the chat already has a recording is let go without asking ears, and one is asked for only once", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const follow = createFollowAsk();
  const ears = pretendEars(
    [view({ version: 1, state: "recording", current: { id: 6, by: "wake", claimed: false } }), view({ version: 3, state: "recording", current: { id: 6, by: "wake", claimed: true } }), view({ version: 4, state: "idle", lastId: 6, last: last("Hi.") }), view({ version: 5 })],
    [view({ version: 2, state: "recording", current: { id: 6, by: "wake", claimed: true } })],
  );
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis", follow });
  assert.deepEqual(await take(events, 1), [{ kind: "wake", id: 6 }]);
  follow.ask(5000);
  assert.deepEqual((await take(events, 1))[0].kind, "done");
  assert.equal(follow.take(), null, "it was taken and let go");
  assert.deepEqual(ears.asked.filter((one) => one.method === "POST").map((one) => one.path), ["/wake/claim?id=6"]);
  signal.abort();
});

test("asking for a follow-up keeps only the latest, and a watcher that starts listening after it was asked hears of it at once", () => {
  const follow = createFollowAsk();
  assert.equal(follow.take(), null);
  follow.ask(3000);
  follow.ask(5000);
  let poked = 0;
  const unhook = follow.onAsk(() => poked++);
  assert.equal(poked, 1);
  assert.equal(follow.take(), 5000);
  assert.equal(follow.take(), null);
  follow.ask(4000);
  assert.equal(poked, 2);
  unhook();
  follow.ask(4000);
  assert.equal(poked, 2, "a watcher that stopped listening isn't poked");
});

test("a rise in the wake words ears ignored as late is passed on with the latest one's lateness, but not the count found at the start or after a restart, nor anything from an older ears", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const plain = { on: true, listening: true, held: false, problem: null };
  const at = (version: number, count: number | null, behindMs: number | null, run = "aa") => ({ ...view({ version, run }), wake: count === null ? plain : { ...plain, late: { count, behindMs } } });
  const ears = pretendEars([at(1, 4, 2900), at(2, 4, 2900), at(3, 5, 2909), at(4, 7, null), at(5, 9, 3100, "bb"), at(6, 10, 3200, "bb"), at(7, null, null, "bb"), at(8, 11, 3300, "bb"), view({ version: 9, state: "muted", run: "bb" })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis" });
  assert.deepEqual(await take(events, 5), [{ kind: "late", behindMs: 2909 }, { kind: "late", behindMs: null }, { kind: "late", behindMs: 3200 }, { kind: "late", behindMs: 3300 }, { kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" }]);
  signal.abort();
});

test("a watcher whose recording is done, or lost to a restart, has nothing to cancel when it's called off, and a cancel that fails is let go", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const posts: string[] = [];
  const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 2, by: "wake", claimed: false } }), view({ version: 3, state: "idle", lastId: 2, last: last("Hi.") })], [view({ version: 2, state: "recording", current: { id: 2, by: "wake", claimed: true } })]);
  const events = watchWake({ call: async (method, path, ms, signal) => (method === "POST" && posts.push(path), ears.call(method, path, ms, signal)), signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis", now: () => 0 });
  const got = await take(events, 2);
  assert.equal(got[1].kind, "done");
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 5));
  signal.abort();
  await next;
  assert.deepEqual(posts, ["/wake/claim?id=2"]);
  const failing = new AbortController();
  const claims = pretendEars([view({ version: 1, state: "recording", current: { id: 3, by: "wake", claimed: false } })], [view({ version: 2, state: "recording", current: { id: 3, by: "wake", claimed: true } })]);
  const broken = watchWake({ call: async (method, path, ms, signal) => (path.startsWith("/recording/cancel") ? Promise.reject(new Error("Couldn't reach ears")) : claims.call(method, path, ms, signal)), signal: failing.signal, wait: noPause, first: "on: say Hey Jarvis" });
  assert.deepEqual(await take(broken, 1), [{ kind: "wake", id: 3 }]);
  const after = broken.next();
  await new Promise((resolve) => setTimeout(resolve, 5));
  failing.abort();
  assert.deepEqual(await after, { done: true, value: undefined });
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

test("a talk-button recording nobody has taken is claimed the same way, and is a wake marked as the button's", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars(
    [view({ version: 1 }), view({ version: 2, state: "recording", current: { id: 9, by: "button", claimed: false }, lastId: 8 }), view({ version: 4, state: "idle", lastId: 9, last: last("What's the time?") })],
    [view({ version: 3, state: "recording", current: { id: 9, by: "button", claimed: true }, lastId: 8 })],
  );
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis" });
  const got = await take(events, 2);
  assert.deepEqual(got.map((event) => (event.kind === "done" ? [event.kind, event.id, event.answer.last?.text] : event)), [{ kind: "wake", id: 9, button: true }, ["done", 9, "What's the time?"]]);
  assert.deepEqual(ears.asked.filter((one) => one.method === "POST").map((one) => one.path), ["/wake/claim?id=9"]);
  signal.abort();
});

test("a recording that something else stopped, seen between its end and Whisper starting, isn't done until ears has its text", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const clock = { at: 1000 };
  const ears = pretendEars(
    [
      view({ version: 1 }),
      view({ version: 2, state: "recording", current: { id: 5, by: "button", claimed: false }, lastId: 4 }),
      () => {
        clock.at = 3000;
        return Promise.resolve(view({ version: 4, state: "recording", current: null, lastId: 5, last: last(null) }));
      },
      () => {
        clock.at = 3500;
        return Promise.resolve(view({ version: 5, state: "working", lastId: 5, last: last(null) }));
      },
      () => {
        clock.at = 4300;
        return Promise.resolve(view({ version: 6, state: "idle", lastId: 5, last: last("What's the time?") }));
      },
    ],
    [view({ version: 3, state: "recording", current: { id: 5, by: "button", claimed: true }, lastId: 4 })],
  );
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, now: () => clock.at, first: "on: say Hey Jarvis" });
  const got = await take(events, 2);
  assert.deepEqual(got[1], { kind: "done", id: 5, answer: view({ version: 6, state: "idle", lastId: 5, last: last("What's the time?") }), textMs: 1300 }, "the text's time counts from when the recording was first seen to have ended");
  signal.abort();
});

test("a recording seen as ended while ears has already started a newer one is done with what ears says", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars(
    [view({ version: 1 }), view({ version: 2, state: "recording", current: { id: 5, by: "wake", claimed: false }, lastId: 4 }), view({ version: 4, state: "recording", current: { id: 6, by: "push", claimed: true }, lastId: 5, last: last(null) })],
    [view({ version: 3, state: "recording", current: { id: 5, by: "wake", claimed: true }, lastId: 4 })],
  );
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: "on: say Hey Jarvis" });
  const got = await take(events, 2);
  assert.deepEqual(got[1].kind === "done" && [got[1].id, got[1].answer.version], [5, 4]);
  signal.abort();
});

test("push recordings, follow-ups and claimed ones aren't claimed", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 1, by: "push", claimed: false } }), view({ version: 2, state: "recording", current: { id: 2, by: "wake", claimed: true } }), view({ version: 3, state: "recording", current: { id: 3, by: "follow", claimed: false } }), view({ version: 4, state: "muted" })]);
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

test("with a quick check, the watcher tells ears it will judge, asks the check once for each question about its own recording, and passes the answer to ears without holding up the watching", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const recording = (version: number, asking?: { id: number; n: number; text: string }) => view({ version, state: "recording", current: { id: 7, by: "wake", claimed: true }, lastId: 7, ...(asking === undefined ? {} : { asking }) });
  let answer: (verdict: "done" | "more" | null) => void = () => {};
  const checked: string[] = [];
  const turns: EarsAnswer[] = [view({ version: 9, state: "recording", current: { id: 7, by: "wake", claimed: true } })];
  const ears = pretendEars(
    [view({ version: 1, state: "recording", current: { id: 7, by: "wake", claimed: false } }), recording(3, { id: 7, n: 1, text: "turn the lights off" }), recording(4, { id: 7, n: 1, text: "turn the lights off" }), recording(5), view({ version: 6, state: "idle", lastId: 7, last: last("Turn the lights off.") })],
    [view({ version: 2, state: "recording", current: { id: 7, by: "wake", claimed: true } })],
  );
  const call: EarsCall = async (method, path, ms, callSignal) => {
    if (path.startsWith("/wake/turn")) {
      ears.asked.push({ method, path, ms });
      return turns.shift() ?? view({ status: 409, error: "gone" });
    }
    return ears.call(method, path, ms, callSignal);
  };
  let now = 1_000;
  const events = watchWake({ call, signal: signal.signal, wait: noPause, now: () => now, judge: (text) => (checked.push(text), new Promise((resolve) => (answer = resolve))) });
  assert.deepEqual(await take(events, 2), [{ kind: "status", line: "on: say Hey Jarvis" }, { kind: "wake", id: 7 }]);
  const next = events.next();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(checked, ["turn the lights off"], "asked once, though ears showed the question twice");
  assert.deepEqual(ears.asked.filter((one) => one.path.startsWith("/wait")).map((one) => one.path), ["/wait?after=-1&judge=on", "/wait?after=1&run=aa&judge=on", "/wait?after=3&run=aa&judge=on", "/wait?after=4&run=aa&judge=on", "/wait?after=5&run=aa&judge=on"], "the watching went on while the check was out");
  now = 1_430;
  assert.deepEqual((await next).value, { kind: "done", id: 7, answer: view({ version: 6, state: "idle", lastId: 7, last: last("Turn the lights off.") }), textMs: 0 }, "the recording was done before the check answered");
  answer("done");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ears.asked.filter((one) => one.path.startsWith("/wake/turn")), [{ method: "POST", path: "/wake/turn?id=7&n=1&verdict=done", ms: 4_000 }]);
  signal.abort();
});

test("the quick check's answer is passed on as a note once ears has it, saying how long it took and whether ears used it, and only while that recording is the watcher's", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const recording = (version: number, asking?: { id: number; n: number; text: string }) => view({ version, state: "recording", current: { id: 7, by: "wake", claimed: true }, lastId: 7, ...(asking === undefined ? {} : { asking }) });
  const hold: ((answer: EarsAnswer) => void)[] = [];
  const held = () => new Promise<EarsAnswer>((resolve) => hold.push(resolve));
  const turnReplies: (EarsAnswer | Error)[] = [recording(5), view({ status: 409, error: "gone" }), new Error("ears is away")];
  const ears = pretendEars(
    [view({ version: 1, state: "recording", current: { id: 7, by: "wake", claimed: false } }), recording(3, { id: 7, n: 1, text: "what's on" }), held, recording(6, { id: 7, n: 2, text: "what's on at" }), held, recording(8, { id: 7, n: 3, text: "what's on at the" }), held, recording(10, { id: 7, n: 4, text: "what's on at the cinema" }), held, recording(11, { id: 8, n: 1, text: "not this chat's" }), view({ version: 12, state: "idle", lastId: 7, last: last("What's on at the cinema?") }), held],
    [view({ version: 2, state: "recording", current: { id: 7, by: "wake", claimed: true } })],
  );
  const posted: string[] = [];
  const call: EarsCall = async (method, path, ms, callSignal) => {
    if (!path.startsWith("/wake/turn")) return ears.call(method, path, ms, callSignal);
    posted.push(path);
    const reply = turnReplies.shift() ?? view({ status: 409 });
    if (reply instanceof Error) throw reply;
    return reply;
  };
  let now = 0;
  const verdicts: ("done" | "more" | null)[] = ["more", "done", "done", null];
  const checked: string[] = [];
  const events = watchWake({ call, signal: signal.signal, wait: noPause, now: () => now, judge: async (text) => (checked.push(text), (now += 400), verdicts.shift() ?? null) });
  await take(events, 2);
  const pass = async () => {
    const next = events.next();
    await new Promise((resolve) => setImmediate(resolve));
    hold.shift()?.(recording(99));
    return (await next).value;
  };
  assert.deepEqual(await pass(), { kind: "turn", id: 7, verdict: "more", ms: 400, counted: true });
  assert.deepEqual(await pass(), { kind: "turn", id: 7, verdict: "done", ms: 400, counted: false }, "ears had moved on");
  assert.deepEqual(await pass(), { kind: "turn", id: 7, verdict: "done", ms: 400, counted: false }, "ears couldn't be told");
  assert.deepEqual(await pass(), { kind: "turn", id: 7, verdict: null, ms: 400, counted: false }, "no answer in time, so ears isn't told anything");
  assert.deepEqual(posted, ["/wake/turn?id=7&n=1&verdict=more", "/wake/turn?id=7&n=2&verdict=done", "/wake/turn?id=7&n=3&verdict=done"]);
  assert.equal((await events.next()).value?.kind, "done");
  assert.deepEqual(checked, ["what's on", "what's on at", "what's on at the", "what's on at the cinema"], "another recording's question isn't this chat's to answer");
  signal.abort();
});

test("an answer from the quick check that comes after its recording is done is told to ears, which refuses it, and no note is passed on", { timeout: 5_000 }, async () => {
  const signal = new AbortController();
  const recording = (version: number, asking?: { id: number; n: number; text: string }) => view({ version, state: "recording", current: { id: 7, by: "wake", claimed: true }, lastId: 7, ...(asking === undefined ? {} : { asking }) });
  let answer: (verdict: "done" | "more" | null) => void = () => {};
  let release: (later: EarsAnswer) => void = () => {};
  const ears = pretendEars(
    [view({ version: 1, state: "recording", current: { id: 7, by: "wake", claimed: false } }), recording(3, { id: 7, n: 1, text: "turn the lights off" }), view({ version: 4, state: "idle", lastId: 7, last: last("Turn the lights off.") }), () => new Promise<EarsAnswer>((resolve) => (release = resolve)), view({ version: 6, state: "muted" })],
    [view({ version: 2, state: "recording", current: { id: 7, by: "wake", claimed: true } })],
  );
  const posted: string[] = [];
  const call: EarsCall = async (method, path, ms, callSignal) => {
    if (!path.startsWith("/wake/turn")) return ears.call(method, path, ms, callSignal);
    posted.push(path);
    return view({ status: 409, error: "gone" });
  };
  const events = watchWake({ call, signal: signal.signal, wait: noPause, judge: () => new Promise((resolve) => (answer = resolve)) });
  assert.deepEqual((await take(events, 3)).map((event) => event.kind), ["status", "wake", "done"]);
  const next = events.next();
  await new Promise((resolve) => setImmediate(resolve));
  answer("done");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posted, ["/wake/turn?id=7&n=1&verdict=done"]);
  release(view({ version: 5, state: "idle", lastId: 7, last: last("Turn the lights off.") }));
  assert.deepEqual((await next).value, { kind: "status", line: "off while ears is muted, so unmute it on the server with bash host/ears.sh unmute" }, "the late answer made no note");
  signal.abort();
});

test("without a quick check the watcher never says it will judge and never answers a question, and a check still running when the watcher is called off is called off too", { timeout: 5_000 }, async () => {
  const off = new AbortController();
  const recording = (version: number) => view({ version, state: "recording", current: { id: 7, by: "wake", claimed: true }, lastId: 7, asking: { id: 7, n: 1, text: "turn the lights off" } });
  const plain = pretendEars([view({ version: 1, state: "recording", current: { id: 7, by: "wake", claimed: false } }), recording(3)], [view({ version: 2, state: "recording", current: { id: 7, by: "wake", claimed: true } })]);
  const cancelling = (ears: { call: EarsCall }): EarsCall => async (method, path, ms, signal) => (path.startsWith("/recording/cancel") ? view() : ears.call(method, path, ms, signal));
  const events = watchWake({ call: cancelling(plain), signal: off.signal, wait: noPause });
  await take(events, 2);
  const next = events.next();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(plain.asked.map((one) => one.path), ["/wait?after=-1", "/wake/claim?id=7", "/wait?after=1&run=aa", "/wait?after=3&run=aa"]);
  off.abort();
  await next;
  const second = new AbortController();
  let checkSignal: AbortSignal | null = null;
  const judged = pretendEars([view({ version: 1, state: "recording", current: { id: 7, by: "wake", claimed: false } }), recording(3)], [view({ version: 2, state: "recording", current: { id: 7, by: "wake", claimed: true } })]);
  const watching = watchWake({ call: cancelling(judged), signal: second.signal, wait: noPause, judge: (_text, signal) => ((checkSignal = signal), new Promise(() => {})) });
  await take(watching, 2);
  const waiting = watching.next();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((checkSignal as AbortSignal | null)?.aborted, false);
  second.abort();
  await waiting;
  assert.equal((checkSignal as AbortSignal | null)?.aborted, true);
});

const interruptible = { on: true, listening: true, held: true, problem: null, interrupt: "wake" as const };

test("in an ears that lets him be interrupted, a chat that's speaking claims at once even while busy, and the wake is marked as cutting in; otherwise a busy chat still waits and nothing is marked", { timeout: 5_000 }, async () => {
  for (const [wake, speaking, cut] of [[interruptible, true, true], [{ ...interruptible, interrupt: "speech" as const }, true, true], [interruptible, false, false], [{ on: true, listening: true, held: true, problem: null }, true, false]] as const) {
    const signal = new AbortController();
    const order: string[] = [];
    const ears = pretendEars([view({ version: 1, state: "recording", current: { id: 4, by: "wake", claimed: false }, wake })], [view({ version: 2, state: "recording", current: { id: 4, by: "wake", claimed: true }, wake })]);
    const call: EarsCall = async (method, path, ms, callSignal) => {
      if (path.startsWith("/wake/claim")) order.push("claim");
      return ears.call(method, path, ms, callSignal);
    };
    const events = watchWake({ call, signal: signal.signal, wait: async (ms) => void order.push(`wait ${ms}`), first: wakeStatus(view({ wake })), busy: () => true, speaking: () => speaking });
    assert.deepEqual(await take(events, 1), [cut ? { kind: "wake", id: 4, cut: true } : { kind: "wake", id: 4 }], JSON.stringify([wake, speaking]));
    assert.deepEqual(order, cut ? ["claim"] : ["wait 1000", "claim"]);
    signal.abort();
  }
  const signal = new AbortController();
  const pressed = pretendEars([view({ version: 1, state: "recording", current: { id: 5, by: "button", claimed: false }, wake: interruptible })], [view({ version: 2, state: "recording", current: { id: 5, by: "button", claimed: true }, wake: interruptible })]);
  const button = watchWake({ call: pressed.call, signal: signal.signal, wait: noPause, first: wakeStatus(view({ wake: interruptible })), busy: () => true, speaking: () => true });
  assert.deepEqual(await take(button, 1), [{ kind: "wake", id: 5, button: true, cut: true }]);
  signal.abort();
});

test("a chat that's speaking is told to hush, once for each recording, when another chat has it or its own claim lost, in an ears that lets him be interrupted, and never otherwise", { timeout: 5_000 }, async () => {
  const theirs = (version: number, id: number, wake: EarsAnswer["wake"] = interruptible) => view({ version, state: "recording", current: { id, by: "wake", claimed: true }, wake });
  const signal = new AbortController();
  const ears = pretendEars([theirs(1, 4), theirs(2, 4), view({ version: 3, wake: interruptible }), view({ version: 4, state: "recording", current: { id: 5, by: "button", claimed: false }, wake: interruptible }), view({ version: 5, wake: interruptible }), view({ version: 6, state: "recording", current: { id: 6, by: "follow", claimed: true }, wake: interruptible }), view({ version: 7, state: "working", current: { id: 7, by: "wake", claimed: true }, wake: interruptible })], [view({ status: 409, error: "another chat took it" })]);
  const events = watchWake({ call: ears.call, signal: signal.signal, wait: noPause, first: wakeStatus(view({ wake: interruptible })), speaking: () => true });
  assert.deepEqual(await take(events, 2), [{ kind: "hush", id: 4 }, { kind: "hush", id: 5 }]);
  const next = events.next();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ears.asked.filter((one) => one.path.startsWith("/wait")).length, 8, "a follow-up, and a recording that's already over, tell it nothing");
  signal.abort();
  await next;
  for (const [wake, speaking] of [[{ on: true, listening: true, held: true, problem: null }, true], [interruptible, false]] as const) {
    const off = new AbortController();
    const quiet = pretendEars([theirs(1, 4, wake)]);
    const none = watchWake({ call: quiet.call, signal: off.signal, wait: noPause, first: wakeStatus(view({ wake })), speaking: () => speaking });
    const waiting = none.next();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(quiet.asked.length, 2, "it went straight back to waiting");
    off.abort();
    assert.deepEqual(await waiting, { done: true, value: undefined });
  }
});

test("a cut-in or a hush stops every speech still going, and no other event does", () => {
  const stopped: string[] = [];
  const speeches = new Set([{ stop: () => void stopped.push("a") }, { stop: () => void stopped.push("b") }]);
  const seen = stopOnCutIn(speeches);
  for (const event of [{ kind: "wake", id: 1 }, { kind: "wake", id: 1, button: true }, { kind: "wake", id: 1, follow: true }, { kind: "status", line: "on" }, { kind: "late", behindMs: 5 }, { kind: "done", id: 1, answer: view(), textMs: 0 }] as WakeEvent[]) seen(event);
  assert.deepEqual(stopped, []);
  seen({ kind: "wake", id: 2, cut: true });
  assert.deepEqual(stopped, ["a", "b"]);
  seen({ kind: "hush", id: 3 });
  assert.deepEqual(stopped, ["a", "b", "a", "b"]);
  stopOnCutIn(new Set())({ kind: "hush", id: 3 });
});

test("the pump shows each event to its watcher as soon as it's read, before anyone takes it, and the hold says whether anything is being spoken", { timeout: 5_000 }, async () => {
  const seen: number[] = [];
  let release: () => void = () => {};
  const source = (async function* () {
    yield 1;
    yield 2;
    await new Promise<void>((resolve) => (release = resolve));
    yield 3;
  })();
  const pumped = eager(source, (event) => void seen.push(event));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(seen, [1, 2], "nobody has taken an event yet");
  const taken: number[] = [];
  release();
  for await (const event of pumped) taken.push(event);
  assert.deepEqual([seen, taken], [[1, 2, 3], [1, 2, 3]]);
  const { call } = pretendHolds();
  const hold = startWakeHold(call, "ab12", 60_000);
  assert.equal(hold.active(), false);
  let over: () => void = () => {};
  hold.during(() => new Promise<void>((resolve) => (over = resolve)));
  assert.equal(hold.active(), true);
  over();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(hold.active(), false);
  hold.close();
});
