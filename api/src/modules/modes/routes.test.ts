import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { createModes, type Saved } from "./modes.js";
import { modes, readAsked } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true };
const now = new Date("2026-11-27T13:00:00.000Z");

async function buildApp(options: { features?: Features; withModes?: boolean } = {}) {
  const saves: Saved[] = [];
  const kept = createModes({ store: { load: async () => "missing", save: async (saved) => void saves.push(saved) }, settings: { bedtimeFrom: null, bedtimeUntil: 7 * 60 }, topic: "t", send: async () => {} });
  await kept.load(new Date("2026-11-27T12:00:00.000Z"));
  const app = Fastify();
  app.register(modes, { prefix: "/mode", features: options.features ?? allOn, modes: options.withModes === false ? undefined : kept, now: () => now });
  return { app, saves, kept };
}

test("GET /mode gives the mode, since when, until when, how it was set and how many alerts are held", async () => {
  const { app } = await buildApp();
  const reply = await app.inject({ method: "GET", url: "/mode" });
  assert.deepEqual([reply.statusCode, reply.json()], [200, { mode: "normal", since: "2026-11-27T12:00:00.000Z", until: null, by: "start", held: 0 }]);
});

test("POST /mode switches the mode and answers with the new one", async () => {
  const { app } = await buildApp();
  const reply = await app.inject({ method: "POST", url: "/mode", payload: { mode: "away", until: "2026-11-30T18:00:00Z", by: "voice" } });
  assert.deepEqual([reply.statusCode, reply.json()], [200, { mode: "away", since: "2026-11-27T13:00:00.000Z", until: "2026-11-30T18:00:00.000Z", by: "voice", held: 0 }]);
  assert.equal((await app.inject({ method: "GET", url: "/mode" })).json().mode, "away");
});

test("bedtime from the phone page with no end ends at BEDTIME_UNTIL", async () => {
  const { app } = await buildApp();
  const reply = await app.inject({ method: "POST", url: "/mode", payload: { mode: "bedtime", by: "phone" } });
  assert.equal(reply.json().until, "2026-11-28T07:00:00.000Z");
});

test("with the switch off, or no modes handed to it, both routes say so and nothing changes", async () => {
  for (const built of [await buildApp({ features: { ...allOn, modes: false } }), await buildApp({ withModes: false })]) {
    const got = await built.app.inject({ method: "GET", url: "/mode" });
    const posted = await built.app.inject({ method: "POST", url: "/mode", payload: { mode: "away", by: "voice" } });
    assert.deepEqual([got.statusCode, got.json(), posted.statusCode, posted.json()], [404, { error: "Modes are switched off" }, 404, { error: "Modes are switched off" }]);
  }
  const off = await buildApp({ features: { ...allOn, modes: false } });
  await off.app.inject({ method: "POST", url: "/mode", payload: { mode: "away", by: "voice" } });
  assert.equal(off.kept.view().mode, "normal");
});

test("guest mode refuses a spoken switch away from it with a 409", async () => {
  const { app } = await buildApp();
  await app.inject({ method: "POST", url: "/mode", payload: { mode: "guest", by: "voice" } });
  const reply = await app.inject({ method: "POST", url: "/mode", payload: { mode: "normal", by: "voice" } });
  assert.deepEqual([reply.statusCode, reply.json()], [409, { error: "Guest mode is switched off only by typing /guest off or from the phone page" }]);
  assert.equal((await app.inject({ method: "POST", url: "/mode", payload: { mode: "normal", by: "phone" } })).json().mode, "normal");
});

test("a body that isn't right is a 400 saying what's allowed, and changes nothing", async () => {
  const { app, kept } = await buildApp();
  const cases: [unknown, string][] = [
    [[], "Send a JSON object with mode and by"],
    [{ mode: "away", by: "voice", extra: 1 }, "Only mode, until and by are allowed"],
    [{ mode: "party", by: "voice" }, "mode must be one of normal, guest, bedtime, gaming, coding, away"],
    [{ mode: "away" }, "by must be one of voice, typed, phone, owner"],
    [{ mode: "away", by: "schedule" }, "by must be one of voice, typed, phone, owner"],
    [{ mode: "away", by: "start" }, "by must be one of voice, typed, phone, owner"],
    [{ mode: "gaming", until: "2026-11-27T20:00:00Z", by: "voice" }, "Only away and bedtime can have until"],
    [{ mode: "guest", until: "2026-11-27T20:00:00Z", by: "voice" }, "Only away and bedtime can have until"],
    [{ mode: "away", until: "tomorrow", by: "voice" }, "until must be a time like 2026-01-31T07:00:00Z"],
    [{ mode: "away", until: 1764300000000, by: "voice" }, "until must be a time like 2026-01-31T07:00:00Z"],
    [{ mode: "away", until: "2026-11-27T12:59:00Z", by: "voice" }, "until must be in the future"],
    [{ mode: "away", until: "2026-11-27T13:00:00Z", by: "voice" }, "until must be in the future"],
    [{ mode: "away", until: "2026-12-27T13:00:01Z", by: "voice" }, "until can be at most 30 days ahead for away"],
    [{ mode: "bedtime", until: "2026-11-28T13:00:01Z", by: "voice" }, "until can be at most 24 hours ahead for bedtime"],
  ];
  for (const [payload, error] of cases) {
    const reply = await app.inject({ method: "POST", url: "/mode", payload: payload as object });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error }], JSON.stringify(payload));
  }
  assert.equal(kept.view().mode, "normal");
});

test("until can be at its furthest, and null counts as not given", async () => {
  assert.deepEqual(readAsked({ mode: "away", until: "2026-12-27T13:00:00Z", by: "voice" }, now), { mode: "away", until: new Date("2026-12-27T13:00:00Z"), by: "voice" });
  assert.deepEqual(readAsked({ mode: "bedtime", until: "2026-11-28T07:00:00+00:00", by: "typed" }, now), { mode: "bedtime", until: new Date("2026-11-28T07:00:00Z"), by: "typed" });
  assert.deepEqual(readAsked({ mode: "gaming", until: null, by: "typed" }, now), { mode: "gaming", until: null, by: "typed" });
});

test("a body over 1 KB is refused", async () => {
  const { app } = await buildApp();
  const reply = await app.inject({ method: "POST", url: "/mode", headers: { "content-type": "application/json" }, payload: JSON.stringify({ mode: "away", by: "voice", pad: "x".repeat(1100) }) });
  assert.equal(reply.statusCode, 413);
});
