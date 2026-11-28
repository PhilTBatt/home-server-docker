import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { buildApp } from "../../app.js";
import type { Config } from "../../config.js";
import type { Modes, Mode } from "../modes/modes.js";
import { createEventFeed, firstSeq, type EventStore } from "./feed.js";
import { events, eventsOff, wallReach } from "./routes.js";

const config: Config = {
  apiToken: "test-token",
  qbitApiKey: "test-qbit-key",
  jellyfinApiKey: "test-jellyfin-key",
  ntfyTopic: "test-topic",
  healthcheckUrl: "https://hc-ping.com/test",
  deals: { seen: "memory", ebayEnvironment: "production", ebayClientId: "test-ebay-id", ebayClientSecret: "test-ebay-secret", ai: false },
  trains: { key: "test-rail-key", from: "AAA", to: "BBB", boardUrl: "https://api1.raildata.org.uk/test-board" },
  trainAlerts: { days: ["mon", "wed"], start: 420, end: 510, reminder: 405 },
  catchUp: { repos: [], token: "" },
  modes: { bedtimeFrom: null, bedtimeUntil: null },
  phone: { ring: "once", seconds: 30 },
  spotify: { clientId: "", redirectUri: "" },
  wall: { token: "test-wall-token-0123456789abcdef0123", speaking: "wobble", privatePages: [], remote: false },
  login: { guard: false },
  projector: { host: "192.168.1.23", power: "wake-sleep" },
  morning: { at: 405, days: ["mon", "tue", "wed", "thu", "fri"] },
  features: { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: false, chores: false, sessions: false, spotify: false, talk: false, wall: true, projector: false, events: true, morning: true },
};

const hub = { authorization: "Bearer test-token" };
const wallHeader = { authorization: `Bearer ${config.wall.token}` };
const wallCookie = { wall_token: config.wall.token };
const day = "2026-11-28";
const base = firstSeq(day);

function emptyStore(): EventStore {
  return { load: async () => "missing", append: async () => {}, prune: async () => 0 };
}

function modesAt(mode: Mode | null): Modes | undefined {
  if (mode === null) return undefined;
  return { view: () => ({ mode, since: "2026-11-28T09:00:00.000Z", until: null, by: "phone", held: 0 }) } as unknown as Modes;
}

async function appWith(options: { mode?: Mode | null; features?: Partial<Config["features"]> } = {}) {
  const feed = createEventFeed({ store: emptyStore(), now: () => new Date("2026-11-28T10:00:00.000Z") });
  await feed.load();
  feed.post("mode.switched", { to: "gaming", from: "normal", by: "voice" });
  feed.post("reminder.due", { id: "0000000a", urgent: false, late: false });
  feed.post("session.waiting", { name: "docker" });
  const features = { ...config.features, ...options.features };
  const app = await buildApp({ logger: false, config: { ...config, features }, events: feed, modes: modesAt(options.mode === undefined ? "normal" : options.mode) });
  return { app, feed };
}

const kinds = (body: { events: { kind: string }[] }) => body.events.map((event) => event.kind);

test("every events route is a 404 that says so while EVENTS is off", async () => {
  const { app } = await appWith({ features: { events: false } });
  for (const url of ["/events/today", "/events/feed?after=-1"]) {
    const response = await app.inject({ method: "GET", url, headers: hub });
    assert.deepEqual([response.statusCode, response.json()], [404, eventsOff], url);
  }
});

test("the hub's token sees every event of today, newest last, never cached", async () => {
  const { app } = await appWith();
  const response = await app.inject({ method: "GET", url: "/events/today", headers: hub });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  const body = response.json();
  assert.deepEqual([body.day, body.seq, body.reach, body.more, kinds(body)], [day, base + 3, "owner", 0, ["mode.switched", "reminder.due", "session.waiting"]]);
  assert.deepEqual(body.events[0], { seq: base + 1, at: "2026-11-28T10:00:00.000Z", kind: "mode.switched", audience: "room", title: "Mode: Gaming, by voice", facts: { to: "gaming", from: "normal", by: "voice" } });
});

test("a screen with the wall's token sees the household's events while the hub's mode is known and isn't guest, and only the room's otherwise", async () => {
  for (const [mode, reach, seen] of [
    ["normal", "home", ["mode.switched", "reminder.due"]],
    ["bedtime", "home", ["mode.switched", "reminder.due"]],
    ["guest", "room", ["mode.switched"]],
    [null, "room", ["mode.switched"]],
  ] as const) {
    const { app } = await appWith({ mode });
    for (const headers of [wallHeader, {}]) {
      const response = await app.inject({ method: "GET", url: "/events/today", headers, cookies: Object.keys(headers).length === 0 ? wallCookie : {} });
      assert.equal(response.statusCode, 200, `${mode}`);
      assert.deepEqual([response.json().reach, kinds(response.json())], [reach, seen], `${mode}`);
    }
  }
  assert.equal(wallReach(undefined), "room");
  assert.equal(wallReach(() => null), "room");
  assert.equal(wallReach(() => "guest"), "room");
  assert.equal(wallReach(() => "normal"), "home");
});

test("asking for a narrower reach narrows it, and asking for a wider one never widens it", async () => {
  const { app } = await appWith({ mode: "guest" });
  const reachOf = async (headers: Record<string, string>, asked: string) => (await app.inject({ method: "GET", url: `/events/today?for=${asked}`, headers })).json().reach;
  assert.deepEqual(await Promise.all(["room", "home", "owner"].map((asked) => reachOf(hub, asked))), ["room", "home", "owner"]);
  assert.deepEqual(await Promise.all(["room", "home", "owner"].map((asked) => reachOf(wallHeader, asked))), ["room", "room", "room"]);
  const { app: normal } = await appWith({ mode: "normal" });
  assert.equal((await normal.inject({ method: "GET", url: "/events/today?for=owner", headers: wallHeader })).json().reach, "home");
});

test("a bad reach, count or number is refused", async () => {
  const { app } = await appWith();
  for (const url of ["/events/today?for=everyone", "/events/today?most=0", "/events/today?most=501", "/events/today?most=x", "/events/feed?after=x", "/events/feed?after=-2", "/events/feed?after=1.5", "/events/feed?for=all"]) {
    assert.equal((await app.inject({ method: "GET", url, headers: hub })).statusCode, 400, url);
  }
  const few = (await app.inject({ method: "GET", url: "/events/today?most=2", headers: hub })).json();
  assert.deepEqual([kinds(few), few.more], [["reminder.due", "session.waiting"], 1]);
});

test("the feed answers at once when the reader is behind, and otherwise waits for the next event it can see the number of", { timeout: 10_000 }, async () => {
  const { app, feed } = await appWith({ mode: "normal" });
  const behind = (await app.inject({ method: "GET", url: "/events/feed?after=-1", headers: wallHeader })).json();
  assert.deepEqual([behind.all, behind.seq, kinds(behind)], [true, base + 3, ["mode.switched", "reminder.due"]]);
  const waiting = app.inject({ method: "GET", url: `/events/feed?after=${base + 3}`, headers: wallHeader });
  setTimeout(() => feed.post("phone.rang"), 50);
  const next = (await waiting).json();
  assert.deepEqual([next.all, next.seq, kinds(next)], [false, base + 4, ["phone.rang"]]);
  const hidden = app.inject({ method: "GET", url: `/events/feed?after=${base + 4}`, headers: wallHeader });
  setTimeout(() => feed.post("session.waiting", { name: "docker" }), 50);
  const quiet = (await hidden).json();
  assert.deepEqual([quiet.all, quiet.seq, quiet.events], [false, base + 5, []], "an event the screen can't see moves its number on and shows nothing");
});

test("no token, or a wrong one, reads nothing, and the wall's token still opens nothing else", async () => {
  const { app } = await appWith();
  for (const url of ["/events/today", "/events/feed"]) {
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 401, url);
    assert.equal((await app.inject({ method: "GET", url, headers: { authorization: "Bearer wrong" } })).statusCode, 401, url);
    assert.equal((await app.inject({ method: "GET", url, headers: { authorization: "Bearer wrong" }, cookies: wallCookie })).statusCode, 401, url);
    assert.equal((await app.inject({ method: "POST", url, headers: wallHeader, payload: {} })).statusCode, 401, `POST ${url}`);
  }
  assert.equal((await app.inject({ method: "GET", url: "/events/today", headers: wallHeader })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/health", headers: wallHeader })).statusCode, 401);
});

test("with the wall switched off, its token reads no events either", async () => {
  const { app } = await appWith({ features: { wall: false } });
  assert.equal((await app.inject({ method: "GET", url: "/events/today", headers: wallHeader })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/events/today", headers: hub })).statusCode, 200);
});

test("the routes themselves refuse while EVENTS is off, even when handed a feed", async () => {
  const app = Fastify();
  await app.register(cookie);
  const feed = createEventFeed({ store: emptyStore(), now: () => new Date("2026-11-28T10:00:00.000Z") });
  app.register(events, { prefix: "/events", features: { ...config.features, events: false }, feed, apiToken: config.apiToken });
  for (const url of ["/events/today", "/events/feed?after=-1"]) {
    const response = await app.inject({ method: "GET", url, headers: hub });
    assert.deepEqual([response.statusCode, response.json()], [404, eventsOff], url);
  }
});

test("a screen's long poll works out what it may see after it waits, so guest mode starting meanwhile narrows the answer", { timeout: 10_000 }, async () => {
  const feed = createEventFeed({ store: emptyStore(), now: () => new Date("2026-11-28T10:00:00.000Z") });
  await feed.load();
  let mode: Mode = "normal";
  const modes = { view: () => ({ mode, since: "2026-11-28T09:00:00.000Z", until: null, by: "phone", held: 0 }) } as unknown as Modes;
  const app = await buildApp({ logger: false, config, events: feed, modes });
  const seq = feed.answer(-1, "owner").seq;
  setTimeout(() => {
    mode = "guest";
    feed.post("reminder.due", { id: "0000000b", urgent: false, late: false });
    feed.post("phone.rang");
  }, 50);
  const response = await app.inject({ method: "GET", url: `/events/feed?after=${seq}`, headers: wallHeader });
  const body = response.json();
  assert.deepEqual([body.reach, kinds(body)], ["room", ["phone.rang"]], "the household's reminder isn't shown to a room now in guest mode");
});
