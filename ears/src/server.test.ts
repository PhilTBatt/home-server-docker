import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { createEars, type Ears } from "./ears.js";
import type { Recording, Stopped } from "./recorder.js";
import { alreadyListening, earsHandler, earsPort, followWithinMs, notAsking, notTakenAtAll, notTakenYet, stillSending, startEarsServer, takenWithinMs, tokenMatches, wakeOffError, type WakeApi } from "./server.js";

const token = "t".repeat(64);

const stillOpen = new Set<() => unknown>();

afterEach(async () => {
  const closing = [...stillOpen];
  stillOpen.clear();
  for (const close of closing) await Promise.resolve().then(close).catch(() => {});
});

function quickRecording(): Recording {
  let finish: (stopped: Stopped) => void = () => {};
  const ended = new Promise<Stopped>((resolve) => (finish = resolve));
  return {
    pid: 7,
    ended,
    stop(reason) {
      finish({ reason, failed: false, bytes: 64000, ms: 2000, sound: Uint8Array.of(1, 2) });
      return ended;
    },
  };
}

async function serve(ears: Ears = createEars({ microphone: "pretend", record: quickRecording, log: () => {} })) {
  const server = await startEarsServer(ears, token, 0, "127.0.0.1");
  stillOpen.add(() => closed(server));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, headers: Record<string, string> = { authorization: `Bearer ${token}` }) => {
    const response = await fetch(`${base}${path}`, { method, headers });
    return { status: response.status, type: response.headers.get("content-type"), cache: response.headers.get("cache-control"), allow: response.headers.get("allow"), challenge: response.headers.get("www-authenticate"), body: await response.json() };
  };
  return { server, ears, call };
}

async function closed(server: Server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

test("ears listens on port 8090", () => {
  assert.equal(earsPort, 8090);
});

test("the token must be sent exactly, as a Bearer token", () => {
  assert.equal(tokenMatches(`Bearer ${token}`, token), true);
  for (const header of [undefined, "", token, `bearer ${token}`, `Bearer  ${token}`, `Bearer ${token} `, `Bearer ${token}x`, `Bearer ${token.slice(1)}`, "Bearer ", `Basic ${token}`, `XBearer ${token}`, `Basic Bearer ${token}`, `Token, Bearer ${token}`]) {
    assert.equal(tokenMatches(header, token), false, String(header));
  }
});

test("every route needs the token, and without it nothing about ears is given away", async () => {
  const { server, call } = await serve();
  for (const [method, path] of [["GET", "/state"], ["POST", "/recording/start"], ["POST", "/recording/stop"], ["POST", "/recording/cancel"], ["GET", "/nothing"], ["DELETE", "/state"]]) {
    for (const headers of [{}, { authorization: "Bearer wrong" }, { authorization: token }] as Record<string, string>[]) {
      const answer = await call(method, path, headers);
      assert.deepEqual([answer.status, answer.body, answer.challenge], [401, { error: "A valid token is needed" }, "Bearer"], `${method} ${path} ${JSON.stringify(headers)}`);
    }
  }
  await closed(server);
});

test("with the token, the state says muted and why, and every answer is JSON that isn't cached", async () => {
  const { server, call } = await serve();
  const answer = await call("GET", "/state");
  assert.deepEqual([answer.status, answer.type, answer.cache], [200, "application/json", "no-store"]);
  assert.deepEqual(answer.body, { state: "muted", reason: "ears starts muted after every start, and waits to be unmuted", microphone: "pretend", last: null, lastId: null });
  assert.equal((await call("GET", "/state?x=1")).status, 200);
  await closed(server);
});

test("starting while muted is refused with 409, the reason and the state", async () => {
  const { server, call } = await serve();
  const answer = await call("POST", "/recording/start");
  assert.deepEqual([answer.status, answer.body.error, answer.body.state], [409, "ears is muted", "muted"]);
  await closed(server);
});

test("unmuted, start and stop record, and stop says how long it ran", async () => {
  const { server, ears, call } = await serve();
  ears.unmute();
  const started = await call("POST", "/recording/start");
  assert.deepEqual([started.status, started.body], [200, { state: "recording", reason: null, microphone: "pretend", last: null, lastId: null, id: 1 }]);
  assert.deepEqual((await call("GET", "/state")).body.state, "recording");
  assert.deepEqual([(await call("POST", "/recording/start")).status, (await call("POST", "/recording/start")).body.error], [409, "ears is already recording"]);
  const stopped = await call("POST", "/recording/stop");
  assert.deepEqual([stopped.status, stopped.body], [200, { seconds: 2, state: "idle", reason: null, microphone: "pretend", last: { seconds: 2, reason: "asked to stop", text: null, textProblem: null }, lastId: 1 }]);
  const again = await call("POST", "/recording/stop");
  assert.deepEqual([again.status, again.body.error, again.body.state], [409, "ears isn't recording", "idle"]);
  await closed(server);
});

test("stop and cancel can name the recording: a bad number is 400, a newer one's gone is 410, one that has ended is 409, and the right one works", async () => {
  const { server, ears, call } = await serve(createEars({ microphone: "pretend", record: quickRecording, log: () => {} }));
  ears.unmute();
  assert.deepEqual([(await call("POST", "/recording/start")).body.id, (await call("GET", "/state")).body.lastId], [1, null]);
  for (const id of ["0", "-1", "1.5", "abc", "", "1e2", "01x"]) {
    for (const path of ["/recording/stop", "/recording/cancel"]) {
      const answer = await call("POST", `${path}?id=${id}`);
      assert.deepEqual([answer.status, answer.body], [400, { error: "id must be a recording's number, from 1" }], `${path} ${id}`);
    }
  }
  const gone = await call("POST", "/recording/stop?id=2");
  assert.deepEqual([gone.status, gone.body.error, gone.body.state, gone.body.lastId], [410, "ears has moved on to a newer recording, so that one is gone", "recording", null]);
  assert.equal((await call("POST", "/recording/stop?id=1")).status, 200);
  assert.equal((await call("POST", "/recording/start")).body.id, 2);
  const ended = await call("POST", "/recording/cancel?id=1");
  assert.deepEqual([ended.status, ended.body.error, ended.body.state, ended.body.lastId], [409, "that recording has already ended", "recording", 1]);
  const cancelled = await call("POST", "/recording/cancel?id=2");
  assert.deepEqual([cancelled.status, cancelled.body.lastId, cancelled.body.last.reason], [200, 2, "asked to cancel"]);
  await closed(server);
});

test("cancel ends a recording without its text, says how long it ran, and is refused with 409 when nothing is recording", async () => {
  const { server, ears, call } = await serve(createEars({ microphone: "pretend", record: quickRecording, log: () => {}, toText: async () => "Should never be asked for." }));
  ears.unmute();
  assert.equal((await call("POST", "/recording/start")).status, 200);
  const cancelled = await call("POST", "/recording/cancel");
  assert.deepEqual([cancelled.status, cancelled.body], [200, { seconds: 2, state: "idle", reason: null, microphone: "pretend", last: { seconds: 2, reason: "asked to cancel", text: null, textProblem: null }, lastId: 1 }]);
  const again = await call("POST", "/recording/cancel");
  assert.deepEqual([again.status, again.body.error, again.body.state], [409, "ears isn't recording", "idle"]);
  await closed(server);
});

test("an unknown route is 404 and a wrong method 405 naming the right one", async () => {
  const { server, call } = await serve();
  assert.deepEqual([(await call("GET", "/")).status, (await call("GET", "/recording")).status, (await call("GET", "/state/")).status], [404, 404, 404]);
  for (const [method, path, allowed] of [["POST", "/state", "GET"], ["GET", "/recording/start", "POST"], ["PUT", "/recording/stop", "POST"], ["GET", "/recording/cancel", "POST"]]) {
    const answer = await call(method, path);
    assert.deepEqual([answer.status, answer.allow, answer.body.error], [405, allowed, `Use ${allowed} for ${path}`]);
  }
  await closed(server);
});

function wakeApi(ears: Ears, on = true) {
  let version = 3;
  const calls: string[] = [];
  const waits: { after: number; run: string | null; judge?: true }[] = [];
  let release: () => void = () => {};
  const api: WakeApi = {
    full: () => ({ ...ears.view(), version, run: "abc123" }),
    guests: (on) => (calls.push(`guests ${on}`), true),
    async wait(after, run, signal, judge) {
      waits.push(judge === true ? { after, run, judge } : { after, run });
      if (after < version) return api.full();
      await new Promise<void>((resolve) => {
        release = resolve;
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return api.full();
    },
    hold: (by) => (calls.push(`hold ${by}`), on),
    release: (by) => (calls.push(`release ${by}`), on),
    follow: (withinMs) => (calls.push(`follow ${withinMs}`), on ? ears.start("follow") : { ok: false, error: wakeOffError }),
    press: () => (calls.push("press"), on ? ears.start("button") : { ok: false, error: wakeOffError }),
    turn: (id, n, verdict) => (calls.push(`turn ${id} ${n} ${verdict}`), on && n === 1),
  };
  return { api, calls, waits, bump: () => (version++, release()) };
}

async function serveWake(on = true, heard = { now: true }, claimAfterMs?: number) {
  const ears = createEars({ microphone: "pretend", record: () => ({ ...quickRecording(), speechHeard: () => heard.now }), log: () => {}, claimMs: claimAfterMs });
  const wake = wakeApi(ears, on);
  const server = await startEarsServer(ears, token, 0, "127.0.0.1", wake.api);
  stillOpen.add(() => closed(server));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}` }, ...init });
    return { status: response.status, allow: response.headers.get("allow"), body: await response.json() };
  };
  return { server, ears, wake, call, base };
}

test("without the wake word's routes, they don't exist", async () => {
  const { server, call } = await serve();
  for (const [method, path] of [["GET", "/wait"], ["POST", "/wake/claim?id=1"], ["POST", "/wake/hold"], ["POST", "/wake/release"], ["POST", "/wake/follow?within=5000"], ["POST", "/wake/talk"], ["POST", "/wake/turn?id=1&n=1&verdict=done"]]) assert.equal((await call(method, path)).status, 404, path);
  await closed(server);
});

test("the wake word's routes need the token too", async () => {
  const { server, base } = await serveWake();
  for (const [method, path] of [["GET", "/wait"], ["POST", "/wake/claim?id=1"], ["POST", "/wake/hold?by=aa"], ["POST", "/wake/release?by=aa"], ["POST", "/wake/follow?within=5000"], ["POST", "/wake/talk"], ["POST", "/wake/turn?id=1&n=1&verdict=done"]]) {
    const response = await fetch(`${base}${path}`, { method });
    assert.equal(response.status, 401, path);
    await response.body?.cancel();
  }
  await closed(server);
});

test("a wait gives the whole view with its version, at once when the version is already past, passing on which run it knew", async () => {
  const { server, wake, call } = await serveWake();
  const first = await call("GET", "/wait");
  assert.deepEqual([first.status, first.body.version, first.body.run, first.body.state], [200, 3, "abc123", "muted"]);
  assert.deepEqual(wake.waits, [{ after: -1, run: null }]);
  assert.equal((await call("GET", "/wait?after=2&run=abc123")).body.version, 3);
  assert.deepEqual(wake.waits[1], { after: 2, run: "abc123" });
  await closed(server);
});

test("a wait from the latest version is answered when something changes", async () => {
  const { server, wake, call } = await serveWake();
  const waiting = call("GET", "/wait?after=3");
  await new Promise((resolve) => setTimeout(resolve, 30));
  wake.bump();
  const answer = await waiting;
  assert.deepEqual([answer.status, answer.body.version], [200, 4]);
  await closed(server);
});

test("a wait whose caller has gone is let go, and nothing is written to it", async () => {
  const { server, wake, base } = await serveWake();
  const gone = new AbortController();
  const waiting = fetch(`${base}/wait?after=3`, { headers: { authorization: `Bearer ${token}` }, signal: gone.signal }).catch((error: unknown) => error);
  await new Promise((resolve) => setTimeout(resolve, 30));
  gone.abort();
  await waiting;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(wake.waits.length, 1);
  await closed(server);
});

test("a wait's after must be a whole number from -1", async () => {
  const { server, call } = await serveWake();
  for (const after of ["", "x", "1.5", "-2", "1e3", " 1", "99999999999999999"]) {
    const answer = await call("GET", `/wait?after=${encodeURIComponent(after)}`);
    assert.deepEqual([answer.status, answer.body], [400, { error: "after must be a whole number from -1" }], after);
  }
  assert.equal((await call("GET", "/wait?after=-1")).status, 200);
  assert.equal((await call("GET", "/wait?after=0")).status, 200);
  await closed(server);
});

test("claiming takes a wake-word recording by its number, with 409 if it isn't waiting and 400 for a bad number", async () => {
  const { server, ears, call } = await serveWake();
  await ears.unmute();
  ears.start("wake");
  for (const id of ["", "0", "-1", "x", "1.0"]) assert.deepEqual((await call("POST", `/wake/claim?id=${id}`)).body, { error: "id must be a recording's number, from 1" }, id);
  assert.equal((await call("POST", "/wake/claim")).status, 400);
  const wrong = await call("POST", "/wake/claim?id=2");
  assert.deepEqual([wrong.status, wrong.body.error, wrong.body.version, wrong.body.state], [409, "that wake-word recording isn't waiting to be taken", 3, "recording"]);
  const claimed = await call("POST", "/wake/claim?id=1");
  assert.deepEqual([claimed.status, claimed.body.state, claimed.body.version], [200, "recording", 3]);
  assert.equal((await call("POST", "/wake/claim?id=1")).status, 409);
  assert.deepEqual([(await call("GET", "/wake/claim?id=1")).allow], ["POST"]);
  await ears.stop();
  await closed(server);
});

test("a follow-up starts a recording already taken by whoever asked, with its number, and a wait for speech from 1 to 20 seconds", async () => {
  assert.deepEqual(followWithinMs, { least: 1_000, most: 20_000 });
  const on = await serveWake();
  await on.ears.unmute();
  const started = await on.call("POST", "/wake/follow?within=5000");
  assert.deepEqual([started.status, started.body.state, started.body.id, started.body.lastId, on.ears.current()], [200, "recording", on.ears.current()?.id, null, { id: on.ears.current()?.id, by: "follow", claimed: true }]);
  assert.deepEqual(on.wake.calls, ["follow 5000"]);
  const again = await on.call("POST", "/wake/follow?within=5000");
  assert.deepEqual([again.status, again.body.error, again.body.version], [409, "ears is already recording", 3]);
  await on.ears.cancel();
  for (const within of ["", "999", "20001", "5s", "-5000", "5000.5"]) {
    const answer = await on.call("POST", `/wake/follow?within=${within}`);
    assert.deepEqual([answer.status, answer.body], [400, { error: "within must be a whole number of milliseconds from 1000 to 20000" }], within);
  }
  assert.equal((await on.call("POST", "/wake/follow")).status, 400);
  for (const within of ["1000", "20000"]) {
    assert.equal((await on.call("POST", `/wake/follow?within=${within}`)).status, 200, within);
    await on.ears.cancel();
  }
  assert.equal((await on.call("GET", "/wake/follow?within=5000")).allow, "POST");
  await closed(on.server);
  const off = await serveWake(false);
  await off.ears.unmute();
  const refused = await off.call("POST", "/wake/follow?within=5000");
  assert.deepEqual([refused.status, refused.body.error, off.ears.view().state], [409, wakeOffError, "idle"]);
  await closed(off.server);
});

test("hold and release pass on who holds, and with the wake word off they're refused saying how to turn it on", async () => {
  const on = await serveWake();
  assert.deepEqual([(await on.call("POST", "/wake/hold?by=0f3a")).status, (await on.call("POST", "/wake/release?by=0f3a")).status], [200, 200]);
  assert.deepEqual(on.wake.calls, ["hold 0f3a", "release 0f3a"]);
  for (const by of ["", "XYZ", "0F3A", "a".repeat(33), "a-b", "a b"]) {
    const answer = await on.call("POST", `/wake/hold?by=${encodeURIComponent(by)}`);
    assert.deepEqual([answer.status, answer.body], [400, { error: "by must name who holds, in up to 32 lower-case hex digits" }], by);
  }
  assert.equal((await on.call("POST", "/wake/release")).status, 400);
  assert.deepEqual(on.wake.calls.length, 2);
  assert.deepEqual([(await on.call("GET", "/wake/hold?by=a")).allow, (await on.call("POST", "/wait")).allow], ["POST", "GET"]);
  await closed(on.server);
  const off = await serveWake(false);
  const held = await off.call("POST", "/wake/hold?by=a");
  assert.deepEqual([held.status, held.body.error], [409, wakeOffError]);
  assert.equal(wakeOffError, "ears has the wake word off, so set EARS_WAKE=on in ears/.env and start it again with bash host/ears.sh start");
  assert.equal((await off.call("POST", "/wake/release?by=a")).status, 409);
  await closed(off.server);
});

test("a talk-button press starts a recording a chat can take, and a second press once it's taken and has heard speech sends it", async () => {
  const heard = { now: false };
  const { server, ears, wake, call } = await serveWake(true, heard);
  await ears.unmute();
  const pressing = call("POST", "/wake/talk");
  for (let tries = 0; ears.current() === null && tries < 200; tries++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(ears.current(), { id: 1, by: "button", claimed: false });
  const early = await call("POST", "/wake/talk");
  assert.deepEqual([early.status, early.body.error, early.body.version, ears.view().state], [409, notTakenYet, 3, "recording"], "a press before a chat has taken it changes nothing");
  assert.equal(notTakenYet, "no Jarvis chat has taken the recording yet, so there's nothing to send it to. Press again in a moment");
  assert.equal((await call("POST", "/wake/claim?id=1")).status, 200);
  const first = await pressing;
  assert.deepEqual([first.status, first.body.sent, first.body.id, first.body.state, first.body.lastId], [200, false, 1, "recording", null], "the first press answers once a chat has taken it");
  const quiet = await call("POST", "/wake/talk");
  assert.deepEqual([quiet.status, quiet.body.error, ears.view().state], [409, alreadyListening, "recording"], "before any speech, a press just says it's listening");
  heard.now = true;
  const second = await call("POST", "/wake/talk");
  assert.deepEqual([second.status, second.body.sent, second.body.seconds, second.body.state, second.body.lastId, second.body.last.reason], [200, true, 2, "idle", 1, "asked to stop"]);
  assert.deepEqual(wake.calls, ["press"], "only the first press asked for a new recording");
  await closed(server);
});

test("a press during a wake or follow-up recording says it's already listening and changes nothing, during /talk's own recording is refused by ears, and with the wake word off says so", async () => {
  const { server, ears, wake, call } = await serveWake();
  await ears.unmute();
  assert.equal(ears.start("follow").ok, true);
  const following = await call("POST", "/wake/talk");
  assert.deepEqual([following.status, following.body.error, ears.view().state, ears.current()?.id], [409, alreadyListening, "recording", 1]);
  assert.equal(alreadyListening, "ears is already listening, so just speak: it sends what you say when you stop talking");
  await ears.stop(1);
  assert.equal(ears.start("wake").ok, true);
  ears.claim(2);
  const woken = await call("POST", "/wake/talk");
  assert.deepEqual([woken.status, woken.body.error, ears.view().state, ears.current()?.id], [409, alreadyListening, "recording", 2]);
  await ears.stop(2);
  assert.equal(ears.start("push").ok, true);
  const pushed = await call("POST", "/wake/talk");
  assert.deepEqual([pushed.status, pushed.body.error, ears.view().state, wake.calls], [409, "ears is already recording", "recording", ["press"]]);
  await ears.stop(3);
  await closed(server);
  const off = await serveWake(false);
  await off.ears.unmute();
  const refused = await off.call("POST", "/wake/talk");
  assert.deepEqual([refused.status, refused.body.error, off.ears.view().state], [409, wakeOffError, "idle"]);
  assert.equal((await off.call("GET", "/wake/talk")).status, 405);
  await closed(off.server);
});

test("a press while ears is still sending the last recording says so, and starts nothing", async () => {
  let finish: (stopped: Stopped) => void = () => {};
  const slow: Recording = { pid: 7, ended: new Promise<Stopped>((resolve) => (finish = resolve)), stop: (reason) => (finish({ reason, failed: false, bytes: 64000, ms: 2000, sound: Uint8Array.of(1, 2) }), slow.ended) };
  let release: (text: string) => void = () => {};
  const ears = createEars({ microphone: "pretend", record: () => slow, log: () => {}, toText: () => new Promise<string>((resolve) => (release = resolve)) });
  const wake = wakeApi(ears);
  const server = await startEarsServer(ears, token, 0, "127.0.0.1", wake.api);
  stillOpen.add(() => closed(server));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async () => {
    const response = await fetch(`${base}/wake/talk`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  await ears.unmute();
  assert.equal(ears.start("push").ok, true);
  const stopping = ears.stop(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ears.view().state, "working");
  const pressed = await call();
  assert.deepEqual([pressed.status, pressed.body.error, wake.calls], [409, stillSending, []]);
  assert.equal(stillSending, "ears is still sending the last recording, so press again in a moment");
  release("Hi.");
  await stopping;
  await closed(server);
});

test("a press no chat takes is answered once ears has dropped it, saying so, and ears waits about a second longer than its claim time at most", async () => {
  const { server, ears, call } = await serveWake(true, { now: true }, 60);
  await ears.unmute();
  const began = performance.now();
  const pressed = await call("POST", "/wake/talk");
  assert.deepEqual([pressed.status, pressed.body.error, ears.view().state, ears.view().last?.reason], [409, notTakenAtAll, "idle", "no Jarvis chat took it within 2 seconds"]);
  assert.ok(performance.now() - began < 1000, "it answers as soon as ears drops it");
  assert.equal(notTakenAtAll, "no Jarvis chat took the recording, so it was dropped. A chat needs JARVIS_EARS=wake, and one started before the talk button was added needs starting again");
  assert.equal(takenWithinMs, 3000);
  await closed(server);
});

test("a press while a sent recording is still ending says ears is still sending, and starts nothing", async () => {
  let finish: (stopped: Stopped) => void = () => {};
  const slow: Recording = { pid: 7, ended: new Promise<Stopped>((resolve) => (finish = resolve)), stop: () => slow.ended, speechHeard: () => true };
  const ears = createEars({ microphone: "pretend", record: () => slow, log: () => {} });
  const wake = wakeApi(ears);
  const server = await startEarsServer(ears, token, 0, "127.0.0.1", wake.api);
  stillOpen.add(() => closed(server));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async () => {
    const response = await fetch(`${base}/wake/talk`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  await ears.unmute();
  assert.equal(ears.start("button").ok, true);
  ears.claim(1);
  const sending = call();
  for (let tries = 0; !ears.stopping() && tries < 200; tries++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual([ears.stopping(), ears.view().state, ears.current()?.id], [true, "recording", 1]);
  const pressed = await call();
  assert.deepEqual([pressed.status, pressed.body.error, wake.calls], [409, stillSending, []]);
  finish({ reason: "asked to stop", failed: false, bytes: 3200, ms: 1000, sound: Uint8Array.of(1, 2) });
  assert.equal((await sending).body.sent, true);
  assert.equal(ears.stopping(), false);
  await closed(server);
});

test("a press nobody takes is given up on after the time set, even if ears hasn't dropped it, and once a chat takes it, it's answered at once", async () => {
  const ears = createEars({ microphone: "pretend", record: quickRecording, log: () => {}, claimMs: 60_000 });
  const wake = wakeApi(ears);
  const server = createServer(earsHandler(ears, token, wake.api, { takenWithinMs: 150, everyMs: 5 }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => closed(server));
  const press = async () => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/wake/talk`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  await ears.unmute();
  const began = performance.now();
  const lonely = await press();
  assert.deepEqual([lonely.status, lonely.body.error, ears.current()?.claimed], [409, notTakenAtAll, false]);
  assert.ok(performance.now() - began >= 140);
  await ears.cancel(1);
  const pressing = press();
  for (let tries = 0; ears.current() === null && tries < 200; tries++) await new Promise((resolve) => setTimeout(resolve, 2));
  ears.claim(2);
  assert.deepEqual([(await pressing).status, ears.current()?.claimed], [200, true]);
  await ears.cancel(2);
  await closed(server);
});

test("a chat's verdict on whether you'd finished needs the recording's number, the question's number and done or more, and is refused once the question has gone", async () => {
  const { server, wake, call } = await serveWake();
  const taken = await call("POST", "/wake/turn?id=4&n=1&verdict=more");
  assert.deepEqual([taken.status, taken.body.version, taken.body.state], [200, 3, "muted"]);
  const gone = await call("POST", "/wake/turn?id=4&n=2&verdict=done");
  assert.deepEqual([gone.status, gone.body.error, gone.body.version], [409, notAsking, 3]);
  assert.deepEqual(wake.calls, ["turn 4 1 more", "turn 4 2 done"]);
  for (const path of ["/wake/turn", "/wake/turn?id=0&n=1&verdict=done", "/wake/turn?id=x&n=1&verdict=done", "/wake/turn?id=4&verdict=done", "/wake/turn?id=4&n=0&verdict=done", "/wake/turn?id=4&n=1.5&verdict=done"]) {
    const bad = await call("POST", path);
    assert.deepEqual([bad.status, bad.body.error], [400, "id must be a recording's number and n the question's number, both from 1"], path);
  }
  for (const path of ["/wake/turn?id=4&n=1", "/wake/turn?id=4&n=1&verdict=unsure", "/wake/turn?id=4&n=1&verdict=DONE"]) {
    const bad = await call("POST", path);
    assert.deepEqual([bad.status, bad.body.error], [400, "verdict must be done or more"], path);
  }
  assert.equal(wake.calls.length, 2, "nothing refused reached ears");
  const wrong = await call("GET", "/wake/turn?id=4&n=1&verdict=done");
  assert.deepEqual([wrong.status, wrong.allow], [405, "POST"]);
  await closed(server);
});

test("a wait that says judge=on tells ears a chat will answer its questions, and any other wait doesn't", async () => {
  const { server, wake, call } = await serveWake();
  await call("GET", "/wait?judge=on");
  await call("GET", "/wait?judge=off");
  await call("GET", "/wait?judge=yes");
  await call("GET", "/wait");
  assert.deepEqual(wake.waits, [{ after: -1, run: null, judge: true }, { after: -1, run: null }, { after: -1, run: null }, { after: -1, run: null }]);
  await closed(server);
});

test("POST /wake/guests?on=1 or 0 sets guests with ears's token and answers with the full view, and anything else is refused", async () => {
  const { server, wake, call, base } = await serveWake();
  assert.equal((await call("POST", "/wake/guests?on=1")).status, 200);
  assert.equal((await call("POST", "/wake/guests?on=0")).status, 200);
  for (const path of ["/wake/guests", "/wake/guests?on=yes", "/wake/guests?on=2", "/wake/guests?on="]) {
    const answer = await call("POST", path);
    assert.deepEqual([answer.status, answer.body.error], [400, "on must be 1 to let every voice through, or 0 to stop"], path);
  }
  assert.equal((await fetch(`${base}/wake/guests?on=1`, { method: "POST", headers: { authorization: "Bearer wrong" } })).status, 401);
  assert.equal((await call("GET", "/wake/guests?on=1")).status, 405);
  assert.deepEqual(wake.calls.filter((entry) => entry.startsWith("guests")), ["guests true", "guests false"]);
  await closed(server);
  const plain = await serve();
  assert.equal((await plain.call("POST", "/wake/guests?on=1")).status, 404);
  await closed(plain.server);
});
