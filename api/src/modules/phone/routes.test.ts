import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import type { Notification } from "../notify/notifier.js";
import { findAgainMs, findNotification, phone } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true };

function buildApp(options: { features?: Features; fail?: boolean } = {}) {
  const sent: { topic: string; notification: Notification }[] = [];
  const clock = { at: 50_000 };
  const app = Fastify();
  app.register(phone, {
    prefix: "/phone",
    features: options.features ?? allOn,
    ntfyTopic: "test-topic",
    now: () => clock.at,
    send: async (topic, notification) => {
      if (options.fail === true) throw new Error("ntfy replied 500");
      sent.push({ topic, notification });
    },
  });
  return { app, sent, clock };
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
