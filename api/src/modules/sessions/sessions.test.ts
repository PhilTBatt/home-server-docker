import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { sessions } from "./routes.js";
import { createSessions, keptChanges, mostSessions } from "./sessions.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true };
const at = (iso: string) => new Date(iso);

function setUp() {
  const logs: { message: string; fields: Record<string, unknown> }[] = [];
  const kept = createSessions({ log: { info: (fields, message) => logs.push({ message, fields }), warn: (fields, message) => logs.push({ message, fields }) } });
  return { kept, logs };
}

test("a session's state is kept with when it started, and the same state again only updates when it was last seen", () => {
  const { kept, logs } = setUp();
  assert.deepEqual(kept.set("docker", "working", at("2026-11-27T12:00:00.000Z")), { name: "docker", state: "working", since: "2026-11-27T12:00:00.000Z", lastSeen: "2026-11-27T12:00:00.000Z" });
  assert.deepEqual(kept.set("docker", "working", at("2026-11-27T12:01:00.000Z")), { name: "docker", state: "working", since: "2026-11-27T12:00:00.000Z", lastSeen: "2026-11-27T12:01:00.000Z" });
  kept.set("docker", "waiting", at("2026-11-27T12:05:00.000Z"));
  kept.set("brain", "stopped", at("2026-11-27T12:06:00.000Z"));
  assert.deepEqual(kept.list().map((one) => [one.name, one.state, one.since]), [["brain", "stopped", "2026-11-27T12:06:00.000Z"], ["docker", "waiting", "2026-11-27T12:05:00.000Z"]]);
  assert.deepEqual(logs.map((line) => [line.message, line.fields.name, line.fields.from, line.fields.to, line.fields.forSeconds]), [["session state changed", "docker", null, "working", null], ["session state changed", "docker", "working", "waiting", 300], ["session state changed", "brain", null, "stopped", null]]);
});

test("the changes feed gives each change after the seq it's given, with what it was before, for a day", () => {
  const { kept } = setUp();
  kept.set("docker", "working", at("2026-11-27T12:00:00.000Z"));
  kept.set("docker", "working", at("2026-11-27T12:00:30.000Z"));
  kept.set("docker", "waiting", at("2026-11-27T12:05:00.000Z"));
  assert.deepEqual(kept.changes(0, at("2026-11-27T12:06:00.000Z")), { seq: 2, changes: [{ name: "docker", state: "working", was: null, at: "2026-11-27T12:00:00.000Z" }, { name: "docker", state: "waiting", was: "working", at: "2026-11-27T12:05:00.000Z" }] });
  assert.deepEqual(kept.changes(1, at("2026-11-27T12:06:00.000Z")).changes.map((one) => one.state), ["waiting"]);
  assert.deepEqual(kept.changes(2, at("2026-11-27T12:06:00.000Z")), { seq: 2, changes: [] });
  assert.deepEqual(kept.changes(0, at("2026-11-28T12:05:01.000Z")).changes, []);
});

test("the feed keeps at most 50 changes, and the hub at most 10 sessions", () => {
  const { kept } = setUp();
  for (let i = 0; i < keptChanges + 5; i++) kept.set("docker", i % 2 === 0 ? "working" : "waiting", at(`2026-11-27T12:${String(i).padStart(2, "0")}:00.000Z`));
  assert.equal(kept.changes(0, at("2026-11-27T13:00:00.000Z")).changes.length, keptChanges);
  for (let i = 1; i < mostSessions; i++) assert.equal("refused" in kept.set(`s${i}`, "working", at("2026-11-27T13:00:00.000Z")), false);
  assert.deepEqual(kept.set("eleventh", "working", at("2026-11-27T13:00:00.000Z")), { refused: "The hub already knows 10 sessions, the most it keeps" });
  assert.equal("refused" in kept.set("docker", "stopped", at("2026-11-27T13:00:00.000Z")), false, "a known one still changes");
});

async function buildApp(features = allOn) {
  const { kept } = setUp();
  const app = Fastify();
  app.register(sessions, { prefix: "/sessions", features, sessions: kept, now: () => at("2026-11-27T12:00:00.000Z") });
  return app;
}

test("POST /sessions/<name>/state sets one, GET /sessions lists them, and GET /sessions/changes gives the feed", async () => {
  const app = await buildApp();
  const posted = await app.inject({ method: "POST", url: "/sessions/docker/state", payload: { state: "waiting" } });
  assert.deepEqual([posted.statusCode, posted.json()], [200, { name: "docker", state: "waiting", since: "2026-11-27T12:00:00.000Z", lastSeen: "2026-11-27T12:00:00.000Z" }]);
  assert.deepEqual((await app.inject({ method: "GET", url: "/sessions" })).json(), { sessions: [{ name: "docker", state: "waiting", since: "2026-11-27T12:00:00.000Z", lastSeen: "2026-11-27T12:00:00.000Z" }] });
  assert.deepEqual((await app.inject({ method: "GET", url: "/sessions/changes?after=0" })).json(), { seq: 1, changes: [{ name: "docker", state: "waiting", was: null, at: "2026-11-27T12:00:00.000Z" }] });
});

test("an odd name, state, body or seq is a 400 saying what's allowed", async () => {
  const app = await buildApp();
  for (const name of ["Docker", "a_b", "x".repeat(21), "a%20b"]) {
    assert.deepEqual((await app.inject({ method: "POST", url: `/sessions/${name}/state`, payload: { state: "waiting" } })).json(), { error: "A session's name is 1 to 20 lowercase letters, digits and -" }, name);
  }
  for (const payload of [{ state: "asleep" }, { state: "waiting", extra: 1 }, {}, []]) {
    const reply = await app.inject({ method: "POST", url: "/sessions/docker/state", payload: payload as object });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "Send only state, one of waiting, working, stopped" }], JSON.stringify(payload));
  }
  assert.equal((await app.inject({ method: "GET", url: "/sessions/changes?after=x" })).statusCode, 400);
  assert.deepEqual((await app.inject({ method: "GET", url: "/sessions" })).json(), { sessions: [] });
});

test("with the switch off, every route says so", async () => {
  const app = await buildApp({ ...allOn, sessions: false });
  for (const [method, url] of [["GET", "/sessions"], ["GET", "/sessions/changes"], ["POST", "/sessions/docker/state"]] as const) {
    const reply = await app.inject({ method, url, payload: method === "POST" ? { state: "waiting" } : undefined });
    assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Sessions are switched off" }], url);
  }
});
