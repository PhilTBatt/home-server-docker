import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import type { CatchUp } from "./catchup.js";
import { catchUp, defaultDays, mostDays, readDays } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true, morning: true };
const now = () => new Date("2026-11-26T12:00:00Z");

function recording() {
  const asked: [number, string][] = [];
  const reader: CatchUp = {
    read: async (days, at) => {
      asked.push([days, at.toISOString()]);
      return { days } as never;
    },
  };
  return { asked, reader };
}

function buildApp(features: Features, reader?: CatchUp) {
  const app = Fastify();
  app.register(catchUp, { prefix: "/catch-up", features, catchUp: reader, now });
  return app;
}

test("GET /catch-up reads the last 7 days unless asked for 1 to 30", async () => {
  const { asked, reader } = recording();
  const app = buildApp(allOn, reader);
  for (const url of ["/catch-up", "/catch-up?days=", "/catch-up?days=1", "/catch-up?days=30", "/catch-up?days=07"]) assert.equal((await app.inject({ method: "GET", url })).statusCode, 200, url);
  assert.deepEqual(asked, [[7, "2026-11-26T12:00:00.000Z"], [7, "2026-11-26T12:00:00.000Z"], [1, "2026-11-26T12:00:00.000Z"], [30, "2026-11-26T12:00:00.000Z"], [7, "2026-11-26T12:00:00.000Z"]]);
  assert.deepEqual([defaultDays, mostDays], [7, 30]);
});

test("any other days is a 400 saying what's allowed, and nothing is read", async () => {
  const { asked, reader } = recording();
  const app = buildApp(allOn, reader);
  for (const days of ["0", "31", "99", "100", "-1", "1.5", "seven", " 7", "7 ", "1e1", "0x1", "007"]) {
    const reply = await app.inject({ method: "GET", url: `/catch-up?days=${encodeURIComponent(days)}` });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "days must be a whole number from 1 to 30" }], days);
  }
  const twice = await app.inject({ method: "GET", url: "/catch-up?days=1&days=2" });
  assert.equal(twice.statusCode, 400);
  assert.deepEqual(asked, []);
});

test("readDays reads only a whole number in range", () => {
  assert.deepEqual([readDays({}), readDays({ days: "5" }), readDays({ days: ["5"] }), readDays(null), readDays({ days: 5 })], [7, 5, null, 7, null]);
});

test("GET /catch-up is a 404 while catch-up is switched off, or with nothing to read", async () => {
  const { asked, reader } = recording();
  for (const app of [buildApp({ ...allOn, catchUp: false }, reader), buildApp(allOn)]) {
    const reply = await app.inject({ method: "GET", url: "/catch-up" });
    assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Catch-up is switched off" }]);
  }
  assert.deepEqual(asked, []);
});
