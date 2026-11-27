import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { Features, WallSettings } from "../../config.js";
import { createJarvisDesk } from "./jarvis.js";
import type { WallPicture } from "./picture.js";
import { switchedOff, wall, wallCookie, wallCookieDays } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true };
const settings: WallSettings = { token: "w".repeat(40), speaking: "wobble" };

async function buildApp(features: Features = allOn, waitMs = 40, picture?: () => Promise<WallPicture>) {
  const clock = { at: 1_000_000 };
  const desk = createJarvisDesk();
  const app = Fastify();
  await app.register(cookie);
  app.register(wall, { prefix: "/wall", features, settings, desk, picture, now: () => clock.at, waitMs });
  return { app, clock, desk };
}

test("everything is a 404 that says so while WALL is off", async () => {
  const { app } = await buildApp({ ...allOn, wall: false });
  for (const [method, url] of [["GET", "/wall"], ["GET", "/wall/jarvis"], ["POST", "/wall/jarvis"], ["POST", "/wall/login"], ["POST", "/wall/logout"]] as const) {
    const response = await app.inject({ method, url, payload: method === "POST" ? {} : undefined });
    assert.equal(response.statusCode, 404, url);
    assert.deepEqual(response.json(), switchedOff);
  }
});

test("Jarvis's report is kept and read back", async () => {
  const { app, clock } = await buildApp();
  const posted = await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "listening", muted: false, heard: null, said: null } });
  assert.equal(posted.statusCode, 200);
  assert.deepEqual(posted.json(), { seq: 1 });
  clock.at += 100;
  const read = await app.inject({ method: "GET", url: "/wall/jarvis" });
  assert.equal(read.statusCode, 200);
  assert.equal(read.headers["cache-control"], "no-store");
  assert.deepEqual(read.json(), { seq: 1, running: true, activity: "listening", muted: false, heard: null, said: null, saidAgeMs: null });
});

test("a bad report is a 400 with the reason, and changes nothing", async () => {
  const { app, desk, clock } = await buildApp();
  const response = await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "dancing" } });
  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /^activity must be one of/);
  assert.equal(desk.view(clock.at).seq, 0);
});

test("a report over 4 KB is refused", async () => {
  const { app } = await buildApp();
  const response = await app.inject({ method: "POST", url: "/wall/jarvis", headers: { "content-type": "application/json" }, payload: JSON.stringify({ activity: "waiting", said: "x".repeat(5000) }) });
  assert.equal(response.statusCode, 413);
});

test("reading with the seq already seen waits for a change", async () => {
  const { app } = await buildApp(allOn, 5000);
  await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "waiting" } });
  const reading = app.inject({ method: "GET", url: "/wall/jarvis?after=1" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "speaking" } });
  const read = await reading;
  assert.equal(read.json().activity, "speaking");
  assert.equal(read.json().seq, 2);
});

test("reading with nothing new answers after the wait with the same seq", async () => {
  const { app } = await buildApp(allOn, 40);
  await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "waiting" } });
  const began = Date.now();
  const read = await app.inject({ method: "GET", url: "/wall/jarvis?after=1" });
  assert.ok(Date.now() - began >= 35);
  assert.equal(read.json().seq, 1);
});

test("after must be -1 or a whole number", async () => {
  const { app } = await buildApp();
  for (const after of ["x", "1.5", "-2", "1e3", "9999999999999999"]) {
    const response = await app.inject({ method: "GET", url: `/wall/jarvis?after=${after}` });
    assert.equal(response.statusCode, 400, after);
  }
  assert.equal((await app.inject({ method: "GET", url: "/wall/jarvis?after=-1" })).statusCode, 200);
});

test("logging in with the wall's token sets its own cookie for a year", async () => {
  const { app } = await buildApp();
  const response = await app.inject({ method: "POST", url: "/wall/login", payload: { token: settings.token } });
  assert.equal(response.statusCode, 200);
  const set = response.cookies.find((one) => one.name === wallCookie);
  assert.ok(set !== undefined);
  assert.equal(set.value, settings.token);
  assert.equal(set.httpOnly, true);
  assert.equal(set.sameSite, "Strict");
  assert.equal(set.path, "/");
  assert.equal(set.maxAge, 60 * 60 * 24 * wallCookieDays);
});

test("logging in with anything else is refused and sets nothing", async () => {
  const { app } = await buildApp();
  for (const payload of [{ token: "wrong" }, { token: `${settings.token}x` }, { token: 5 }, {}, { token: "w".repeat(201) }]) {
    const response = await app.inject({ method: "POST", url: "/wall/login", payload });
    assert.equal(response.statusCode, 401);
    assert.equal(response.cookies.length, 0);
  }
});

test("logging out clears the wall's cookie", async () => {
  const { app } = await buildApp();
  const response = await app.inject({ method: "POST", url: "/wall/logout" });
  assert.equal(response.statusCode, 200);
  const cleared = response.cookies.find((one) => one.name === wallCookie);
  assert.equal(cleared?.value, "");
});

const sample = { at: "2026-11-30T07:02:00.000Z", clock: "07:02", day: "Monday morning", phase: "morning", mode: "normal", modeUntil: null, speaking: "wobble", items: [], train: null, timers: [], playing: null } satisfies WallPicture;

test("the wall's picture is given as it was made, never kept by the browser", async () => {
  const { app } = await buildApp(allOn, 40, async () => sample);
  for (const url of ["/wall", "/wall/"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, url);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), sample);
  }
});

test("with no picture to give it says so, and one that fails is a 502 in plain words", async () => {
  const none = await buildApp();
  assert.deepEqual([(await none.app.inject({ method: "GET", url: "/wall" })).statusCode, (await none.app.inject({ method: "GET", url: "/wall" })).json()], [503, { error: "The wall has nothing to show yet" }]);
  const failing = await buildApp(allOn, 40, async () => Promise.reject(new Error("secret detail")));
  const response = await failing.app.inject({ method: "GET", url: "/wall" });
  assert.deepEqual([response.statusCode, response.json()], [502, { error: "Couldn't put the wall's picture together" }]);
});
