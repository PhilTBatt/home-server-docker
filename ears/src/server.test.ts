import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createEars, type Ears } from "./ears.js";
import type { Recording, Stopped } from "./recorder.js";
import { earsPort, startEarsServer, tokenMatches, wakeOffError, type WakeApi } from "./server.js";

const token = "t".repeat(64);

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
  const waits: { after: number; run: string | null }[] = [];
  let release: () => void = () => {};
  const api: WakeApi = {
    full: () => ({ ...ears.view(), version, run: "abc123" }),
    async wait(after, run, signal) {
      waits.push({ after, run });
      if (after < version) return api.full();
      await new Promise<void>((resolve) => {
        release = resolve;
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return api.full();
    },
    hold: (by) => (calls.push(`hold ${by}`), on),
    release: (by) => (calls.push(`release ${by}`), on),
  };
  return { api, calls, waits, bump: () => (version++, release()) };
}

async function serveWake(on = true) {
  const ears = createEars({ microphone: "pretend", record: quickRecording, log: () => {} });
  const wake = wakeApi(ears, on);
  const server = await startEarsServer(ears, token, 0, "127.0.0.1", wake.api);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}` }, ...init });
    return { status: response.status, allow: response.headers.get("allow"), body: await response.json() };
  };
  return { server, ears, wake, call, base };
}

test("without the wake word's routes, they don't exist", async () => {
  const { server, call } = await serve();
  for (const [method, path] of [["GET", "/wait"], ["POST", "/wake/claim?id=1"], ["POST", "/wake/hold"], ["POST", "/wake/release"]]) assert.equal((await call(method, path)).status, 404, path);
  await closed(server);
});

test("the wake word's routes need the token too", async () => {
  const { server, base } = await serveWake();
  for (const [method, path] of [["GET", "/wait"], ["POST", "/wake/claim?id=1"], ["POST", "/wake/hold?by=aa"], ["POST", "/wake/release?by=aa"]]) {
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
