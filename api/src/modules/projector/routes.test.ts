import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import type { CodeResult, Projector, PowerResult, ProjectorStatus } from "./projector.js";
import { alreadyBusy, badCode, codeTimedOut, notPairing, pairingFailed, projector, projectorOff, wrongCode } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true };

function fake(overrides: Partial<{ pair: "started" | "busy"; code: CodeResult; power: PowerResult }> = {}) {
  const calls: unknown[] = [];
  const status: ProjectorStatus = { paired: true, pairedAt: "2026-11-28T10:00:00.000Z", busy: null, on: true, onSeenAt: "2026-11-28T10:05:00.000Z", problem: null };
  const remote: Projector = {
    start: async () => {},
    status: () => status,
    pair: () => (calls.push("pair"), overrides.pair ?? "started"),
    code: async (code) => (calls.push(["code", code]), overrides.code ?? "paired"),
    power: async (on) => (calls.push(["power", on]), overrides.power ?? { sent: true, was: false, on: true }),
    forget: async () => void calls.push("forget"),
    close: () => void calls.push("close"),
  };
  return { remote, calls, status };
}

function buildApp(remote: Projector | undefined, features: Features = allOn) {
  const app = Fastify();
  app.register(projector, { prefix: "/projector", features, projector: remote });
  return app;
}

test("every route is a 404 that says so while PROJECTOR is off", async () => {
  const { remote, calls } = fake();
  for (const app of [buildApp(remote, { ...allOn, projector: false }), buildApp(undefined)]) {
    for (const [method, url] of [["GET", "/projector"], ["POST", "/projector/pair"], ["POST", "/projector/pair/code"], ["POST", "/projector/power"], ["POST", "/projector/forget"]] as const) {
      const response = await app.inject({ method, url, payload: method === "POST" ? {} : undefined });
      assert.deepEqual([response.statusCode, response.json()], [404, projectorOff], url);
    }
  }
  assert.deepEqual(calls, []);
});

test("the status says whether it's paired, what it's busy with, and whether it was last seen on, and when", async () => {
  const { remote, status } = fake();
  assert.deepEqual((await buildApp(remote).inject({ method: "GET", url: "/projector" })).json(), status);
});

test("pairing starts once, and the code must be the six hex characters the projector shows", async () => {
  const started = fake();
  const app = buildApp(started.remote);
  assert.deepEqual([(await app.inject({ method: "POST", url: "/projector/pair" })).statusCode], [202]);
  const busy = await buildApp(fake({ pair: "busy" }).remote).inject({ method: "POST", url: "/projector/pair" });
  assert.deepEqual([busy.statusCode, busy.json()], [409, alreadyBusy]);
  for (const code of ["12345", "1234567", "12345G", "", " 12345"]) {
    const response = await app.inject({ method: "POST", url: "/projector/pair/code", payload: { code } });
    assert.equal(response.statusCode, 400, code);
  }
  assert.deepEqual((await app.inject({ method: "POST", url: "/projector/pair/code", payload: { code: "12345G" } })).json(), badCode);
  assert.equal((await app.inject({ method: "POST", url: "/projector/pair/code", payload: {} })).statusCode, 400);
  assert.deepEqual((await app.inject({ method: "POST", url: "/projector/pair/code", payload: { code: "aBc123" } })).json(), { paired: true });
  assert.deepEqual(started.calls, ["pair", ["code", "aBc123"]]);
});

test("each way pairing can end has its own answer", async () => {
  const answers: Array<[CodeResult, number, { error: string }]> = [["wrong code", 400, wrongCode], ["not pairing", 409, notPairing], ["timed out", 504, codeTimedOut], ["failed", 502, pairingFailed]];
  for (const [result, status, body] of answers) {
    const response = await buildApp(fake({ code: result }).remote).inject({ method: "POST", url: "/projector/pair/code", payload: { code: "abc123" } });
    assert.deepEqual([response.statusCode, response.json()], [status, body], result);
  }
});

test("power takes on as true or false, and a refusal comes back as a 409 with its reason", async () => {
  const { remote, calls } = fake();
  const app = buildApp(remote);
  assert.deepEqual((await app.inject({ method: "POST", url: "/projector/power", payload: { on: true } })).json(), { sent: true, was: false, on: true });
  assert.equal((await app.inject({ method: "POST", url: "/projector/power", payload: {} })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/projector/power", payload: { on: "maybe" } })).statusCode, 400);
  assert.deepEqual(calls, [["power", true]]);
  const refused = await buildApp(fake({ power: { refused: "No." } }).remote).inject({ method: "POST", url: "/projector/power", payload: { on: false } });
  assert.deepEqual([refused.statusCode, refused.json()], [409, { error: "No." }]);
});

test("forget forgets", async () => {
  const { remote, calls } = fake();
  assert.deepEqual((await buildApp(remote).inject({ method: "POST", url: "/projector/forget" })).json(), { forgotten: true });
  assert.deepEqual(calls, ["forget"]);
});

test("closing the API lets go of the projector", async () => {
  const { remote, calls } = fake();
  const app = buildApp(remote);
  await app.ready();
  await app.close();
  assert.deepEqual(calls, ["close"]);
});
