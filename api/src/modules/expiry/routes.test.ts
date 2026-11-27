import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { createExpiryChecker, type ExpiryChecker } from "./checker.js";
import type { ExpiryItem } from "./list.js";
import { expiry } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true };
const now = () => new Date("2026-11-26T12:00:00Z");

function checkerOf(load: () => Promise<ExpiryItem[]>) {
  let sends = 0;
  const checker = createExpiryChecker({ load, store: { load: async () => new Map(), save: async () => undefined }, send: async () => void sends++ });
  return { checker, sends: () => sends };
}

function buildApp(features: Features, checker?: ExpiryChecker) {
  const app = Fastify();
  app.register(expiry, { prefix: "/expiry", features, checker, now });
  return app;
}

test("the list is at /expiry, with today's London date and each item's days left, soonest first and overdue marked", async () => {
  const { checker, sends } = checkerOf(async () => [{ name: "Beta", date: "2026-12-03", note: null }, { name: "Alpha", date: "2026-11-24", note: "Renew it" }]);
  const reply = await buildApp(allOn, checker).inject({ method: "GET", url: "/expiry" });
  assert.deepEqual([reply.statusCode, reply.json()], [
    200,
    {
      today: "2026-11-26",
      items: [
        { name: "Alpha", date: "2026-11-24", note: "Renew it", daysLeft: -2, overdue: true },
        { name: "Beta", date: "2026-12-03", note: null, daysLeft: 7, overdue: false },
      ],
    },
  ]);
  assert.equal(sends(), 0, "asking never sends a warning");
});

test("with the switch off, or no checker, it says so and the list isn't read", async () => {
  let reads = 0;
  const { checker } = checkerOf(async () => (reads++, []));
  for (const app of [buildApp({ ...allOn, expiryAlerts: false }, checker), buildApp(allOn)]) {
    const reply = await app.inject({ method: "GET", url: "/expiry" });
    assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Expiry alerts are switched off" }]);
  }
  assert.equal(reads, 0);
});

test("a list with a problem is a 500 saying what's wrong and naming the file", async () => {
  const { checker } = checkerOf(async () => {
    throw new Error("expiry/items.json isn't valid JSON");
  });
  const reply = await buildApp(allOn, checker).inject({ method: "GET", url: "/expiry" });
  assert.deepEqual([reply.statusCode, reply.json()], [500, { error: "The expiry list has a problem: expiry/items.json isn't valid JSON" }]);
});

test("without a clock given, the route uses the real one", async () => {
  const { checker } = checkerOf(async () => []);
  const app = Fastify();
  app.register(expiry, { prefix: "/expiry", features: allOn, checker });
  const reply = await app.inject({ method: "GET", url: "/expiry" });
  assert.match(reply.json().today, /^\d{4}-\d{2}-\d{2}$/);
});
