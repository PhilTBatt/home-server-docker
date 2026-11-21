import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createEars, type Ears } from "./ears.js";
import type { Recording, Stopped } from "./recorder.js";
import { earsPort, startEarsServer, tokenMatches } from "./server.js";

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
  assert.deepEqual(answer.body, { state: "muted", reason: "ears starts muted after every start, and waits to be unmuted", microphone: "pretend", last: null });
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
  assert.deepEqual([started.status, started.body], [200, { state: "recording", reason: null, microphone: "pretend", last: null }]);
  assert.deepEqual((await call("GET", "/state")).body.state, "recording");
  assert.deepEqual([(await call("POST", "/recording/start")).status, (await call("POST", "/recording/start")).body.error], [409, "ears is already recording"]);
  const stopped = await call("POST", "/recording/stop");
  assert.deepEqual([stopped.status, stopped.body], [200, { seconds: 2, state: "idle", reason: null, microphone: "pretend", last: { seconds: 2, reason: "asked to stop", text: null, textProblem: null } }]);
  const again = await call("POST", "/recording/stop");
  assert.deepEqual([again.status, again.body.error, again.body.state], [409, "ears isn't recording", "idle"]);
  await closed(server);
});

test("cancel ends a recording without its text, says how long it ran, and is refused with 409 when nothing is recording", async () => {
  const { server, ears, call } = await serve(createEars({ microphone: "pretend", record: quickRecording, log: () => {}, toText: async () => "Should never be asked for." }));
  ears.unmute();
  assert.equal((await call("POST", "/recording/start")).status, 200);
  const cancelled = await call("POST", "/recording/cancel");
  assert.deepEqual([cancelled.status, cancelled.body], [200, { seconds: 2, state: "idle", reason: null, microphone: "pretend", last: { seconds: 2, reason: "asked to cancel", text: null, textProblem: null } }]);
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
