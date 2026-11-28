import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { createMorning, notSpeakingTime, notWakingTime, type Morning } from "./morning.js";
import { bodyLimit, morning, morningByWrong, morningOff } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true, morning: true, switches: true };

function setup(at = "06:50") {
  const clock = { now: new Date(`2026-11-30T${at}:00.000Z`) };
  const saves: unknown[] = [];
  const kept = createMorning({ settings: { at: 6 * 60 + 45, days: ["mon", "tue", "wed", "thu", "fri"] }, store: { load: async () => "missing", save: async (day) => void saves.push(day) } });
  return { clock, saves, kept, app: buildApp(kept, allOn, () => clock.now) };
}

function buildApp(kept: Morning | undefined, features: Features = allOn, now?: () => Date) {
  const app = Fastify();
  app.register(morning, { prefix: "/morning", features, morning: kept, now });
  return app;
}

test("every route is a 404 that says so while MORNING is off", async () => {
  const { kept, saves } = setup();
  for (const app of [buildApp(kept, { ...allOn, morning: false }), buildApp(undefined)]) {
    for (const [method, url] of [["GET", "/morning"], ["POST", "/morning/up"], ["POST", "/morning/snooze"]] as const) {
      const response = await app.inject({ method, url, payload: method === "POST" ? { by: "phone" } : undefined });
      assert.deepEqual([response.statusCode, response.json()], [404, morningOff], url);
    }
  }
  assert.deepEqual(saves, []);
});

test("the morning says where it's got to, and is never kept by a browser", async () => {
  const { app } = setup();
  const response = await app.inject({ method: "GET", url: "/morning" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), { phase: "speaking", day: "2026-11-30", at: "06:45", speakSlot: 2, upAt: null, by: null, snoozedUntil: null });
});

test("I'm up and five more minutes take who said it, phone or voice, and answer with the morning as it now is", async () => {
  const { app, clock } = setup();
  const snoozed = await app.inject({ method: "POST", url: "/morning/snooze", payload: { by: "voice" } });
  assert.deepEqual([snoozed.statusCode, snoozed.json().phase, snoozed.json().snoozedUntil], [200, "snoozed", "2026-11-30T06:55:00.000Z"]);
  clock.now = new Date("2026-11-30T06:52:00.000Z");
  const up = await app.inject({ method: "POST", url: "/morning/up", payload: { by: "phone" } });
  assert.deepEqual([up.statusCode, up.json().phase, up.json().by, up.json().upAt], [200, "up", "phone", "2026-11-30T06:52:00.000Z"]);
});

test("outside the times they work, they're refused with a reason", async () => {
  const early = setup("04:20").app;
  assert.deepEqual((await early.inject({ method: "POST", url: "/morning/up", payload: { by: "phone" } })).json(), { error: notWakingTime });
  const brightening = setup("06:35").app;
  const response = await brightening.inject({ method: "POST", url: "/morning/snooze", payload: { by: "phone" } });
  assert.deepEqual([response.statusCode, response.json()], [409, { error: notSpeakingTime }]);
});

test("the body must be exactly a JSON object with by, phone or voice, and small", async () => {
  const { app, saves } = setup();
  for (const payload of [{}, { by: "words" }, { by: "PHONE" }, { by: "phone", extra: 1 }, [], { by: ["phone"] }, { by: null }]) {
    for (const url of ["/morning/up", "/morning/snooze"]) {
      const response = await app.inject({ method: "POST", url, payload: payload as object });
      assert.deepEqual([response.statusCode, response.json()], [400, morningByWrong], `${url} ${JSON.stringify(payload)}`);
    }
  }
  assert.equal((await app.inject({ method: "POST", url: "/morning/up" })).statusCode, 400);
  assert.deepEqual((await app.inject({ method: "POST", url: "/morning/up", headers: { "content-type": "application/json" }, payload: '"phone"' })).json(), morningByWrong);
  assert.equal((await app.inject({ method: "POST", url: "/morning/up", headers: { "content-type": "application/json" }, payload: JSON.stringify({ by: "phone", pad: "x".repeat(bodyLimit) }) })).statusCode, 413);
  assert.deepEqual(saves, []);
});
