import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { deals } from "./routes.js";
import type { DealWatcher, FullReply, MatchGroup, MatchedListing, NamesReply, RunSummary, SearchStatus, WatcherStatus } from "./watcher.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true };
const start = Date.parse("2026-11-18T12:00:00.000Z");

const status: WatcherStatus = {
  lastRun: "2026-11-18T11:55:00.000Z",
  callsToday: 42,
  callsPerDay: 1000,
  alertsToday: 3,
  alertsPerDay: 60,
  note: null,
  problems: [{ code: "deals-source", message: "The deal watcher can't check a search (ram): couldn't reach eBay." }],
  quiet: null,
};

const searches: SearchStatus[] = [
  { id: "optiplex", name: "OptiPlex", on: true, source: "ebay", query: "optiplex 7070 sff", everyMinutes: 30, lastChecked: "2026-11-18T11:55:00.000Z", watchingSince: "2026-11-17T09:00:00.000Z", matches: 2, total: 2, complete: true, problem: null, snoozed: false, snoozedUntil: null, alertsToday: 1, alertsPerDay: null, guidePrice: 12000, hidden: { words: 4 } },
];

const matched: MatchedListing = {
  id: "110000000001",
  title: "Dell OptiPlex 7070 SFF",
  price: 9500,
  postage: 699,
  total: 10199,
  condition: "Used",
  buying: ["FIXED_PRICE"],
  url: "https://www.ebay.co.uk/itm/110000000001",
  listedAt: null,
  endsAt: null,
  firstSeen: "2026-11-18T11:55:00.000Z",
  bids: null,
  sellerType: "business",
  sellerPercent: 99.4,
  sellerFeedback: 1234,
  topRated: null,
  country: "GB",
  city: "Sometown",
  postcode: "ZZ9***",
  summary: "Core i5, 16GB",
  variations: false,
  detailsMatch: null,
  place: 1,
  underGuide: 15,
  great: false,
  perUnit: null,
  cautions: [],
};

const groups: MatchGroup[] = [
  {
    id: "optiplex",
    name: "OptiPlex",
    source: "ebay",
    checkedAt: "2026-11-18T11:55:00.000Z",
    count: 1,
    guidePrice: 12000,
    listings: [matched],
  },
  { id: "ram", name: "DDR4 RAM", source: "ebay", checkedAt: "2026-11-18T11:50:00.000Z", count: 0, guidePrice: null, listings: [] },
];

function fakeWatcher(summary: RunSummary = { ran: true, checked: 2, alerts: 1, failed: 0, unsent: true }) {
  const seen = {
    runs: [] as { now: string; force: boolean }[],
    matchTimes: [] as string[],
    snoozes: [] as [string, string | null][],
    wakes: [] as string[],
    fulls: [] as string[],
    names: [] as [string, string, string | null][],
    full: { status: "unknown" } as FullReply,
    namesReply: { status: "ok", names: { categoryId: "179", categories: [], details: [{ name: "Form Factor", values: [{ value: "SFF", count: 310 }] }] } } as NamesReply,
  };
  const watcher: DealWatcher = {
    run: async (now, force = false) => {
      seen.runs.push({ now: now.toISOString(), force });
      return summary;
    },
    problems: () => status.problems,
    status: () => status,
    searches: () => searches,
    matches: (now) => {
      seen.matchTimes.push(now.toISOString());
      return groups;
    },
    snooze: async (id, until) => {
      seen.snoozes.push([id, until === null ? null : until.toISOString()]);
      return id === "optiplex";
    },
    wake: async (id) => {
      seen.wakes.push(id);
      return id === "optiplex";
    },
    full: async (id) => {
      seen.fulls.push(id);
      return seen.full;
    },
    detailNames: async (source, query, categoryId) => {
      seen.names.push([source, query, categoryId]);
      return seen.namesReply;
    },
  };
  return { watcher, seen };
}

function buildApp(watcher: DealWatcher | undefined, features = allOn) {
  const clock = { time: start };
  const app = Fastify();
  app.register(deals, { prefix: "/deals", features, watcher, seen: "memory", environment: "production", now: () => new Date(clock.time) });
  return { app, clock };
}

const routes = [
  ["GET", "/deals/status"],
  ["GET", "/deals/searches"],
  ["GET", "/deals/matches"],
  ["POST", "/deals/check"],
] as const;

test("status gives the watcher's numbers and problems, plus where seen listings are kept and which eBay", async () => {
  const { app } = buildApp(fakeWatcher().watcher);
  const response = await app.inject({ method: "GET", url: "/deals/status" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ...status, seen: "memory", environment: "production" });
});

test("searches gives each search and how its last check went", async () => {
  const { app } = buildApp(fakeWatcher().watcher);
  const response = await app.inject({ method: "GET", url: "/deals/searches" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), searches);
});

test("matches gives the current listings, asked for as of now so stale ones are left out", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher);
  clock.time = start + 90_000;
  const response = await app.inject({ method: "GET", url: "/deals/matches" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), groups);
  assert.deepEqual(seen.matchTimes, ["2026-11-18T12:01:30.000Z"]);
});

test("the read routes never start a check", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  for (const url of ["/deals/status", "/deals/searches", "/deals/matches"]) await app.inject({ method: "GET", url });
  assert.deepEqual(seen.runs, []);
});

test("check runs every switched-on search now and reports the counts", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const response = await app.inject({ method: "POST", url: "/deals/check" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { checked: 2, alerts: 1, failed: 0, unsent: true });
  assert.deepEqual(seen.runs, [{ now: "2026-11-18T12:00:00.000Z", force: true }]);
});

test("check says when every alert was sent", async () => {
  const { app } = buildApp(fakeWatcher({ ran: true, checked: 1, alerts: 0, failed: 0, unsent: false }).watcher);
  assert.deepEqual((await app.inject({ method: "POST", url: "/deals/check" })).json(), { checked: 1, alerts: 0, failed: 0, unsent: false });
});

test("a second check within a minute is refused and nothing runs, so a stuck button can't use up the day's calls", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher);
  assert.equal((await app.inject({ method: "POST", url: "/deals/check" })).statusCode, 200);
  for (const later of [1_000, 30_000, 59_999]) {
    clock.time = start + later;
    const response = await app.inject({ method: "POST", url: "/deals/check" });
    assert.equal(response.statusCode, 429);
    assert.deepEqual(response.json(), { error: "The deal watcher was asked to check less than a minute ago" });
  }
  assert.equal(seen.runs.length, 1);
  clock.time = start + 60_000;
  assert.equal((await app.inject({ method: "POST", url: "/deals/check" })).statusCode, 200);
  assert.equal(seen.runs.length, 2);
});

test("many checks fired at once start only one", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const replies = await Promise.all(Array.from({ length: 20 }, () => app.inject({ method: "POST", url: "/deals/check" })));
  assert.equal(replies.filter((reply) => reply.statusCode === 200).length, 1);
  assert.equal(replies.filter((reply) => reply.statusCode === 429).length, 19);
  assert.equal(seen.runs.length, 1);
});

test("a check asked for while the regular one is running says so", async () => {
  const { watcher } = fakeWatcher({ ran: false, checked: 0, alerts: 0, failed: 0, unsent: false });
  const { app } = buildApp(watcher);
  const response = await app.inject({ method: "POST", url: "/deals/check" });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { error: "A check is already running" });
});

test("being told a check is already running doesn't start the one-minute wait", async () => {
  const summary = { ran: false, checked: 0, alerts: 0, failed: 0, unsent: false };
  const { watcher } = fakeWatcher(summary);
  const { app, clock } = buildApp(watcher);
  assert.equal((await app.inject({ method: "POST", url: "/deals/check" })).statusCode, 409);
  summary.ran = true;
  clock.time = start + 10_000;
  assert.equal((await app.inject({ method: "POST", url: "/deals/check" })).statusCode, 200);
  clock.time = start + 20_000;
  assert.equal((await app.inject({ method: "POST", url: "/deals/check" })).statusCode, 429);
});

test("check takes nothing from the request: a body, query or odd header can't steer it", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const response = await app.inject({
    method: "POST",
    url: "/deals/check?force=false&search=optiplex&now=2020-01-01",
    headers: { "x-now": "2020-01-01", "x-force": "false" },
    payload: { force: false, now: "2020-01-01T00:00:00Z", searches: ["all"], buy: true },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(seen.runs, [{ now: "2026-11-18T12:00:00.000Z", force: true }]);
});

test("switched off, every route says so and the watcher is never touched", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher, { ...allOn, deals: false });
  for (const [method, url] of routes) {
    const response = await app.inject({ method, url });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
    assert.deepEqual(response.json(), { error: "The deal watcher is switched off" });
  }
  assert.deepEqual([seen.runs, seen.matchTimes, seen.snoozes, seen.wakes, seen.fulls, seen.names], [[], [], [], [], [], []]);
});

test("with no watcher every route says switched off rather than failing", async () => {
  const { app } = buildApp(undefined);
  for (const [method, url] of routes) {
    const response = await app.inject({ method, url });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
    assert.deepEqual(response.json(), { error: "The deal watcher is switched off" });
  }
});

test("there are no routes for buying, bidding, or changing the search list", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const tries = [
    ["POST", "/deals/buy"],
    ["POST", "/deals/bid"],
    ["POST", "/deals/matches"],
    ["POST", "/deals/searches"],
    ["PUT", "/deals/searches"],
    ["DELETE", "/deals/searches"],
    ["DELETE", "/deals/searches/optiplex"],
    ["POST", "/deals/searches/optiplex/off"],
    ["PATCH", "/deals/status"],
    ["GET", "/deals/check"],
    ["GET", "/deals"],
    ["GET", "/deals/state"],
    ["GET", "/deals/searches.json"],
    ["GET", "/deals/../deals/status/../../state.json"],
  ] as const;
  for (const [method, url] of tries) {
    const response = await app.inject({ method, url });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
  }
  assert.deepEqual(seen.runs, []);
});

test("a watcher that throws becomes a 500, not a hung request", async () => {
  const { watcher } = fakeWatcher();
  watcher.run = async () => {
    throw new Error("secret-internal-detail");
  };
  const { app } = buildApp(watcher);
  const response = await app.inject({ method: "POST", url: "/deals/check" });
  assert.equal(response.statusCode, 500);
});