import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { bodyLimit, watchers } from "./routes.js";
import { createWatchers, type Watchers } from "./watchers.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true };
const now = () => new Date("2026-11-26T12:00:00Z");

function quiet(most?: number) {
  const ids = ["0a1b2c3d", "1a1b2c3d", "2a1b2c3d"];
  return createWatchers({
    sources: { finished: async () => [], disk: async () => ({ freeGB: 50, totalGB: 100 }), answering: { qbittorrent: async () => [], jellyfin: async () => ({}) } },
    send: async () => undefined,
    makeId: () => ids.shift() ?? "ffffffff",
    most,
  });
}

function buildApp(features: Features, watching?: Watchers) {
  const app = Fastify();
  app.register(watchers, { prefix: "/watchers", features, watchers: watching, now });
  return app;
}

test("POST /watchers adds one and answers with it; GET /watchers lists them with the most allowed", async () => {
  const app = buildApp(allOn, quiet());
  const added = await app.inject({ method: "POST", url: "/watchers", payload: { kind: "download-finished", name: "Alpha", hours: 3 } });
  assert.deepEqual([added.statusCode, added.json()], [200, { kind: "download-finished", name: "Alpha", id: "0a1b2c3d", what: 'a download matching "Alpha" to finish', hours: 3, createdAt: "2026-11-26T12:00:00.000Z", expiresAt: "2026-11-26T15:00:00.000Z", lastCheck: null, waitingToSend: false }]);
  const listed = await app.inject({ method: "GET", url: "/watchers" });
  assert.deepEqual([listed.statusCode, listed.json().most, listed.json().watchers.map((watcher: { id: string }) => watcher.id)], [200, 10, ["0a1b2c3d"]]);
});

test("a request the fixed kinds don't allow is a 400 saying why, and nothing is added", async () => {
  const watching = quiet();
  const app = buildApp(allOn, watching);
  const cases: [unknown, string][] = [
    [{ kind: "shell", command: "reboot" }, "kind must be one of download-finished, disk-free-below, service-answering"],
    [{ kind: "disk-free-below", percent: 100 }, "percent must be a whole number from 1 to 99"],
    [{ kind: "download-finished", name: "$(reboot)" }, "name must be 2 to 40 characters of letters, digits, single spaces and ' - . , ( ) & / + : _, with no space at either end"],
    [[{ kind: "disk-free-below", percent: 10 }], "Send a JSON object with a kind"],
  ];
  for (const [payload, error] of cases) {
    const reply = await app.inject({ method: "POST", url: "/watchers", payload: payload as object });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error }], JSON.stringify(payload));
  }
  const text = await app.inject({ method: "POST", url: "/watchers", headers: { "content-type": "text/plain" }, payload: "kind=disk-free-below" });
  assert.deepEqual([text.statusCode, text.json()], [400, { error: "Send a JSON object with a kind" }]);
  const empty = await app.inject({ method: "POST", url: "/watchers" });
  assert.deepEqual([empty.statusCode, empty.json()], [400, { error: "Send a JSON object with a kind" }]);
  assert.deepEqual(watching.list(), []);
});

test("a body over 1 KB is refused before it's read", async () => {
  assert.equal(bodyLimit, 1024);
  const watching = quiet();
  const reply = await buildApp(allOn, watching).inject({ method: "POST", url: "/watchers", payload: { kind: "disk-free-below", percent: 10, padding: "x".repeat(1100) } });
  assert.equal(reply.statusCode, 413);
  assert.deepEqual(watching.list(), []);
});

test("the same watch twice, or one too many, is a 409 saying why", async () => {
  const app = buildApp(allOn, quiet(2));
  assert.equal((await app.inject({ method: "POST", url: "/watchers", payload: { kind: "disk-free-below", percent: 10 } })).statusCode, 200);
  const again = await app.inject({ method: "POST", url: "/watchers", payload: { kind: "disk-free-below", percent: 10, hours: 2 } });
  assert.deepEqual([again.statusCode, again.json()], [409, { error: "That's already being watched" }]);
  assert.equal((await app.inject({ method: "POST", url: "/watchers", payload: { kind: "service-answering", service: "jellyfin" } })).statusCode, 200);
  const full = await app.inject({ method: "POST", url: "/watchers", payload: { kind: "service-answering", service: "qbittorrent" } });
  assert.deepEqual([full.statusCode, full.json()], [409, { error: "2 things are already being watched, the most at once: cancel one first" }]);
});

test("DELETE /watchers/:id cancels one, and refuses an id that isn't one or isn't there", async () => {
  const watching = quiet();
  const app = buildApp(allOn, watching);
  await app.inject({ method: "POST", url: "/watchers", payload: { kind: "disk-free-below", percent: 10 } });
  for (const id of ["0A1B2C3D", "0a1b2c3", "..%2F..", "0a1b2c3d0"]) {
    const reply = await app.inject({ method: "DELETE", url: `/watchers/${id}` });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "id must be a watcher's id from GET /watchers" }], id);
  }
  const missing = await app.inject({ method: "DELETE", url: "/watchers/ffffffff" });
  assert.deepEqual([missing.statusCode, missing.json()], [404, { error: "No watcher with that id" }]);
  assert.equal(watching.list().length, 1);
  const cancelled = await app.inject({ method: "DELETE", url: "/watchers/0a1b2c3d" });
  assert.deepEqual([cancelled.statusCode, cancelled.json()], [200, { cancelled: "0a1b2c3d" }]);
  assert.deepEqual(watching.list(), []);
});

test("with the switch off, or no watchers handed over, every route says so and nothing changes", async () => {
  const watching = quiet();
  watching.add({ watch: { kind: "disk-free-below", percent: 10 }, hours: 24 }, now());
  for (const app of [buildApp({ ...allOn, watchers: false }, watching), buildApp(allOn)]) {
    for (const [method, url] of [["GET", "/watchers"], ["POST", "/watchers"], ["DELETE", "/watchers/0a1b2c3d"]] as const) {
      const reply = await app.inject({ method, url, ...(method === "POST" ? { payload: { kind: "disk-free-below", percent: 20 } } : {}) });
      assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Watchers are switched off" }], `${method} ${url}`);
    }
  }
  assert.deepEqual(watching.list().map((watcher) => watcher.what), ["free disk space to fall below 10%"]);
});

test("without a clock given, the route uses the real one", async () => {
  const app = Fastify();
  app.register(watchers, { prefix: "/watchers", features: allOn, watchers: quiet() });
  const before = Date.now();
  const reply = await app.inject({ method: "POST", url: "/watchers", payload: { kind: "disk-free-below", percent: 10 } });
  assert.ok(Date.parse(reply.json().createdAt) >= before - 1000);
});
