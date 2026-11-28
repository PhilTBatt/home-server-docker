import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { createModes } from "../modes/modes.js";
import { createReminders } from "./reminders.js";
import { readAsked, reminders } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true };
const clock = { now: new Date("2026-11-27T12:00:00.000Z") };

async function buildApp(options: { features?: Features; withReminders?: boolean } = {}) {
  const ids = ["0000000a", "0000000b", "0000000c"];
  const modes = createModes({ store: { load: async () => "missing", save: async () => {} }, settings: { bedtimeFrom: null, bedtimeUntil: null }, topic: "t", send: async () => {} });
  await modes.load(clock.now);
  const kept = createReminders({ store: { load: async () => "missing", save: async () => {} }, send: async () => {}, modes, makeId: () => ids.shift() ?? "ffffffff" });
  await kept.load(clock.now);
  const app = Fastify();
  app.register(reminders, { prefix: "/reminders", features: options.features ?? allOn, reminders: options.withReminders === false ? undefined : kept, now: () => clock.now });
  return { app, kept };
}

const body = { text: "Take the bins out", at: "2026-11-27T19:00:00Z", repeat: null, urgent: false, kind: "reminder" };

test("POST /reminders sets one and answers with it, and GET /reminders lists them with the most allowed", async () => {
  const { app } = await buildApp();
  const reply = await app.inject({ method: "POST", url: "/reminders", payload: body });
  assert.deepEqual([reply.statusCode, reply.json()], [200, { id: "0000000a", text: "Take the bins out", kind: "reminder", mode: null, first: "2026-11-27T19:00:00.000Z", at: "2026-11-27T19:00:00.000Z", repeat: null, urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-27T12:00:00.000Z" }]);
  const list = await app.inject({ method: "GET", url: "/reminders" });
  assert.deepEqual([list.json().most, list.json().reminders.map((one: { id: string }) => one.id)], [50, ["0000000a"]]);
});

test("only text and at are needed: repeat, urgent and kind take their plain values", () => {
  assert.deepEqual(readAsked({ text: "  Stretch   now ", at: "2026-11-27T19:00:00+01:00" }, clock.now), { text: "Stretch now", at: new Date("2026-11-27T18:00:00Z"), repeat: null, urgent: false, kind: "reminder", mode: null });
  assert.deepEqual(readAsked({ text: "Gaming", at: "2026-11-27T19:00:00Z", kind: "mode", mode: "gaming", repeat: "weekdays" }, clock.now), { text: "Gaming", at: new Date("2026-11-27T19:00:00Z"), repeat: "weekdays", urgent: false, kind: "mode", mode: "gaming" });
});

test("a body that isn't right is a 400 saying what's allowed, and nothing is set", async () => {
  const { app, kept } = await buildApp();
  const cases: [unknown, string][] = [
    [[], "Send a JSON object with text and at"],
    [{ ...body, extra: true }, "Only text, at, repeat, urgent, kind, mode are allowed"],
    [{ ...body, text: "" }, "text must be 1 to 200 characters of plain text"],
    [{ ...body, text: "   " }, "text must be 1 to 200 characters of plain text"],
    [{ ...body, text: "x".repeat(201) }, "text must be 1 to 200 characters of plain text"],
    [{ ...body, text: "bad\u0007bell" }, "text must be 1 to 200 characters of plain text"],
    [{ ...body, text: "hidden‮right" }, "text must be 1 to 200 characters of plain text"],
    [{ ...body, text: 5 }, "text must be 1 to 200 characters of plain text"],
    [{ ...body, at: "7pm" }, "at must be a time like 2026-01-31T07:00:00Z"],
    [{ ...body, at: "2026-11-27T11:59:59Z" }, "at must be in the future"],
    [{ ...body, at: "2027-11-29T12:00:00Z" }, "at can be at most a year ahead"],
    [{ ...body, repeat: "hourly" }, "repeat must be null or one of daily, weekdays, weekly"],
    [{ ...body, urgent: "yes" }, "urgent must be true or false"],
    [{ ...body, kind: "alarm" }, "kind must be one of reminder, mode"],
    [{ ...body, mode: "gaming" }, "mode is only for kind mode"],
    [{ ...body, kind: "mode" }, "mode must be one of normal, guest, bedtime, gaming, coding, away"],
    [{ ...body, kind: "mode", mode: "party" }, "mode must be one of normal, guest, bedtime, gaming, coding, away"],
    [{ ...body, kind: "mode", mode: "gaming", urgent: true }, "A timed mode switch can't be urgent"],
  ];
  for (const [payload, error] of cases) {
    const reply = await app.inject({ method: "POST", url: "/reminders", payload: payload as object });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error }], JSON.stringify(payload));
  }
  assert.equal(kept.list().length, 0);
  assert.equal((await app.inject({ method: "POST", url: "/reminders", payload: { ...body, text: "x".repeat(200) } })).statusCode, 200);
});

test("with the switch off, or no reminders handed to it, every route says so", async () => {
  for (const built of [await buildApp({ features: { ...allOn, reminders: false } }), await buildApp({ withReminders: false })]) {
    for (const [method, url] of [["GET", "/reminders"], ["POST", "/reminders"], ["GET", "/reminders/due?after=0"], ["DELETE", "/reminders/0000000a"], ["POST", "/reminders/0000000a/snooze"], ["POST", "/reminders/0000000a/done"]] as const) {
      const reply = await built.app.inject({ method, url, payload: method === "POST" ? { ...body, minutes: 5 } : undefined });
      assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Reminders are switched off" }], `${method} ${url}`);
    }
  }
});

test("the due feed gives what came after the seq it's given, and needs a whole number", async () => {
  const { app, kept } = await buildApp();
  await app.inject({ method: "POST", url: "/reminders", payload: body });
  await kept.tick(new Date("2026-11-27T19:00:00.000Z"));
  assert.deepEqual((await app.inject({ method: "GET", url: "/reminders/due" })).json(), { seq: 1, due: [{ id: "0000000a", text: "Take the bins out", at: "2026-11-27T19:00:00.000Z", late: false, urgent: false }] });
  assert.deepEqual((await app.inject({ method: "GET", url: "/reminders/due?after=1" })).json(), { seq: 1, due: [] });
  for (const after of ["-1", "x", "1.5", "1e3"]) {
    const reply = await app.inject({ method: "GET", url: `/reminders/due?after=${after}` });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "after must be a whole number from 0, the seq of the last answer" }], after);
  }
});

test("cancel, snooze and done find a reminder by its id, and say when there's none or the id isn't one", async () => {
  const { app } = await buildApp();
  await app.inject({ method: "POST", url: "/reminders", payload: body });
  const snoozed = await app.inject({ method: "POST", url: "/reminders/0000000a/snooze", payload: { minutes: 15 } });
  assert.deepEqual([snoozed.statusCode, snoozed.json().snoozedTo], [200, "2026-11-27T12:15:00.000Z"]);
  for (const payload of [{ minutes: 0 }, { minutes: 241 }, { minutes: 2.5 }, { minutes: "5" }, { minutes: 5, extra: 1 }, {}]) {
    const reply = await app.inject({ method: "POST", url: "/reminders/0000000a/snooze", payload });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "Send only minutes, a whole number from 1 to 240" }], JSON.stringify(payload));
  }
  assert.equal((await app.inject({ method: "POST", url: "/reminders/0000000a/snooze", payload: { minutes: 240 } })).statusCode, 200);
  assert.deepEqual((await app.inject({ method: "POST", url: "/reminders/0000000a/done" })).json(), { done: "0000000a", removed: true });
  for (const [method, url] of [["DELETE", "/reminders/0000000a"], ["POST", "/reminders/0000000a/done"]] as const) {
    assert.deepEqual((await app.inject({ method, url })).json(), { error: "No reminder with that id" });
  }
  assert.deepEqual((await app.inject({ method: "POST", url: "/reminders/0000000a/snooze", payload: { minutes: 5 } })).json(), { error: "No reminder with that id" });
  for (const id of ["0000000", "0000000G", "..%2Fx"]) {
    assert.deepEqual((await app.inject({ method: "DELETE", url: `/reminders/${id}` })).json(), { error: "id must be a reminder's id from GET /reminders" }, id);
  }
  await app.inject({ method: "POST", url: "/reminders", payload: { ...body, repeat: "daily" } });
  assert.deepEqual((await app.inject({ method: "POST", url: "/reminders/0000000b/done" })).json(), { done: "0000000b", removed: false, next: "2026-11-27T19:00:00.000Z" });
  assert.deepEqual((await app.inject({ method: "DELETE", url: "/reminders/0000000b" })).json(), { cancelled: "0000000b" });
});

test("a timed mode switch can't be snoozed, said with a 409", async () => {
  const { app } = await buildApp();
  await app.inject({ method: "POST", url: "/reminders", payload: { ...body, kind: "mode", mode: "gaming" } });
  const reply = await app.inject({ method: "POST", url: "/reminders/0000000a/snooze", payload: { minutes: 5 } });
  assert.deepEqual([reply.statusCode, reply.json()], [409, { error: "A timed mode switch can't be snoozed: cancel it and set a new one" }]);
});

test("a body over 1 KB is refused", async () => {
  const { app } = await buildApp();
  const reply = await app.inject({ method: "POST", url: "/reminders", headers: { "content-type": "application/json" }, payload: JSON.stringify({ ...body, pad: "x".repeat(1100) }) });
  assert.equal(reply.statusCode, 413);
});
