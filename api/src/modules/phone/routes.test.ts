import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Fastify from "fastify";
import type { Features, PhoneSettings } from "../../config.js";
import type { Notification } from "../notify/notifier.js";
import { findAgainMs, findNotification, phone, repeatEveryMs } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true };

afterEach(() => {
  mock.timers.reset();
});

function buildApp(options: { features?: Features; fail?: boolean; ring?: PhoneSettings; failClear?: boolean; failAfter?: number } = {}) {
  const sent: { topic: string; notification: Notification }[] = [];
  const clears: { topic: string; sequence: string }[] = [];
  const clock = { at: 50_000 };
  const tries = { count: 0 };
  const app = Fastify();
  app.register(phone, {
    prefix: "/phone",
    features: options.features ?? allOn,
    ntfyTopic: "test-topic",
    ring: options.ring,
    now: () => clock.at,
    makeSequence: () => "find-0a1b2c3d",
    send: async (topic, notification) => {
      tries.count++;
      if (options.fail === true || (options.failAfter !== undefined && sent.length >= options.failAfter)) throw new Error("ntfy replied 500");
      sent.push({ topic, notification });
    },
    clear: async (topic, sequence) => {
      if (options.failClear === true) throw new Error("ntfy replied 500");
      clears.push({ topic, sequence });
    },
  });
  return { app, sent, clears, clock, tries };
}

async function ringingApp(ring: PhoneSettings, more: { failClear?: boolean; failAfter?: number } = {}) {
  const built = buildApp({ ring, ...more });
  await built.app.ready();
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  return built;
}

async function pass(ms: number, clock: { at: number }) {
  for (let gone = 0; gone < ms; gone += 1000) {
    clock.at += 1000;
    mock.timers.tick(1000);
    await new Promise(setImmediate);
  }
}

test("finding the phone sends a top-priority notification to the hub's ntfy topic", async () => {
  const { app, sent } = buildApp();
  const reply = await app.inject({ method: "POST", url: "/phone/find" });
  assert.deepEqual([reply.statusCode, reply.json()], [200, { sent: true }]);
  assert.deepEqual(sent, [{ topic: "test-topic", notification: findNotification }]);
  assert.deepEqual(findNotification, { title: "Here's your phone", message: "Jarvis was asked to find your phone.", tags: "telephone_receiver", priority: 5, urgent: true });
});

test("with it switched off, nothing is sent", async () => {
  const { app, sent } = buildApp({ features: { ...allOn, findPhone: false } });
  const reply = await app.inject({ method: "POST", url: "/phone/find" });
  assert.deepEqual([reply.statusCode, reply.json(), sent.length], [404, { error: "Finding the phone is switched off" }, 0]);
});

test("a second find within 10 seconds is refused, and one after is sent", async () => {
  const { app, sent, clock } = buildApp();
  await app.inject({ method: "POST", url: "/phone/find" });
  clock.at += findAgainMs - 1;
  const soon = await app.inject({ method: "POST", url: "/phone/find" });
  assert.deepEqual([soon.statusCode, soon.json(), sent.length], [429, { error: "It was sent less than 10 seconds ago" }, 1]);
  clock.at += 1;
  assert.equal((await app.inject({ method: "POST", url: "/phone/find" })).statusCode, 200);
  assert.equal(sent.length, 2);
});

test("when ntfy can't be reached it says so, never the topic, and a find straight after is tried again", async () => {
  const failing = buildApp({ fail: true });
  const reply = await failing.app.inject({ method: "POST", url: "/phone/find" });
  assert.deepEqual([reply.statusCode, reply.json()], [502, { error: "Couldn't reach ntfy" }]);
  assert.equal(reply.body.includes("test-topic"), false);
  assert.equal((await failing.app.inject({ method: "POST", url: "/phone/find" })).statusCode, 502, "not refused as too soon");
});

test("only POST finds the phone", async () => {
  const { app, sent } = buildApp();
  assert.equal((await app.inject({ method: "GET", url: "/phone/find" })).statusCode, 404);
  assert.equal(sent.length, 0);
});

test("with FIND_PHONE_RING=once, as by default, it sends once and has nothing to stop", async () => {
  const { app, sent, clears } = buildApp({ ring: { ring: "once", seconds: 30 } });
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/find" })).json(), { sent: true });
  assert.equal(sent[0].notification.sequence, undefined);
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/found" })).json(), { stopped: false });
  assert.deepEqual(clears, []);
});

test("with clear, it sends one top-priority message with a sequence ID, and clears it after the seconds", async () => {
  const { app, sent, clears, clock } = await ringingApp({ ring: "clear", seconds: 30 });
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/find" })).json(), { sent: true, ring: "clear", seconds: 30 });
  assert.deepEqual(sent, [{ topic: "test-topic", notification: { ...findNotification, sequence: "find-0a1b2c3d" } }]);
  await pass(29_000, clock);
  assert.deepEqual(clears, []);
  await pass(1_000, clock);
  assert.deepEqual(clears, [{ topic: "test-topic", sequence: "find-0a1b2c3d" }]);
  assert.equal(sent.length, 1);
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/found" })).json(), { stopped: false });
});

test("with repeat, it sends the same message with the same sequence ID every 5 seconds for the seconds, then stops", async () => {
  const { app, sent, clears, clock } = await ringingApp({ ring: "repeat", seconds: 30 });
  await app.inject({ method: "POST", url: "/phone/find" });
  await pass(60_000, clock);
  assert.equal(repeatEveryMs, 5_000);
  assert.equal(sent.length, 6);
  assert.ok(sent.every((one) => one.notification.sequence === "find-0a1b2c3d" && one.notification.priority === 5 && one.notification.urgent === true));
  assert.deepEqual(clears, [], "repeat leaves the last one showing when its time is up");
});

test("found stops the ringing early and clears it, nothing more is sent, and a later find rings again", async () => {
  const { app, sent, clears, clock } = await ringingApp({ ring: "repeat", seconds: 60 });
  await app.inject({ method: "POST", url: "/phone/find" });
  await pass(12_000, clock);
  assert.equal(sent.length, 3);
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/found" })).json(), { stopped: true, cleared: true });
  assert.deepEqual(clears, [{ topic: "test-topic", sequence: "find-0a1b2c3d" }]);
  await pass(30_000, clock);
  assert.equal(sent.length, 3);
  assert.equal(clears.length, 1);
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/found" })).json(), { stopped: false });
  assert.equal((await app.inject({ method: "POST", url: "/phone/find" })).statusCode, 200);
});

test("a find while it's ringing is refused, saying how to stop it", async () => {
  const { app, clock } = await ringingApp({ ring: "clear", seconds: 60 });
  await app.inject({ method: "POST", url: "/phone/find" });
  await pass(20_000, clock);
  const reply = await app.inject({ method: "POST", url: "/phone/find" });
  assert.deepEqual([reply.statusCode, reply.json()], [429, { error: "It's already ringing: say found it, or POST /phone/found, to stop it" }]);
});

test("a clear ntfy refuses is said in the answer to found, and the ringing still stops", async () => {
  const { app, sent, clock } = await ringingApp({ ring: "repeat", seconds: 30 }, { failClear: true });
  await app.inject({ method: "POST", url: "/phone/find" });
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/found" })).json(), { stopped: true, cleared: false });
  await pass(30_000, clock);
  assert.equal(sent.length, 1);
});

test("a repeat ntfy doesn't take is counted and the others still go", async () => {
  const { app, sent, clock, tries } = await ringingApp({ ring: "repeat", seconds: 30 }, { failAfter: 2 });
  await app.inject({ method: "POST", url: "/phone/find" });
  await pass(30_000, clock);
  assert.equal(sent.length, 2);
  assert.equal(tries.count, 6, "a failed send still counts as one of the tries");
});

test("with ringing on, a first send ntfy doesn't take rings nothing and can be tried again at once", async () => {
  const { app, clears } = buildApp({ ring: { ring: "clear", seconds: 30 }, fail: true });
  const reply = await app.inject({ method: "POST", url: "/phone/find" });
  assert.deepEqual([reply.statusCode, reply.json()], [502, { error: "Couldn't reach ntfy" }]);
  assert.deepEqual((await app.inject({ method: "POST", url: "/phone/found" })).json(), { stopped: false });
  assert.equal((await app.inject({ method: "POST", url: "/phone/find" })).statusCode, 502);
  assert.deepEqual(clears, []);
});

test("found is switched off with finding the phone", async () => {
  const { app } = buildApp({ features: { ...allOn, findPhone: false } });
  const reply = await app.inject({ method: "POST", url: "/phone/found" });
  assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Finding the phone is switched off" }]);
});
