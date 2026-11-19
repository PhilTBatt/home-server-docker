import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { aiNote, deals } from "./routes.js";
import type { Categories, CategoryDetails } from "./source.js";
import type { DealWatcher, FullReply, LookupReply, MatchGroup, MatchedListing, NamesReply, RunSummary, SearchStatus, WatcherStatus } from "./watcher.js";

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
  { id: "optiplex", name: "OptiPlex", group: "whole pc", on: true, source: "ebay", query: "optiplex 7070 sff", everyMinutes: 30, lastChecked: "2026-11-18T11:55:00.000Z", watchingSince: "2026-11-17T09:00:00.000Z", matches: 2, total: 2, complete: true, problem: null, snoozed: false, snoozedUntil: null, alertsToday: 1, alertsPerDay: null, guidePrice: 12000, hidden: { words: 4 } },
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
    group: "whole pc",
    source: "ebay",
    checkedAt: "2026-11-18T11:55:00.000Z",
    count: 1,
    guidePrice: 12000,
    listings: [matched],
  },
  { id: "ram", name: "DDR4 RAM", group: "ram", source: "ebay", checkedAt: "2026-11-18T11:50:00.000Z", count: 0, guidePrice: null, listings: [] },
];

function fakeWatcher(summary: RunSummary = { ran: true, checked: 2, alerts: 1, failed: 0, unsent: true }) {
  const seen = {
    runs: [] as { now: string; force: boolean }[],
    matchTimes: [] as string[],
    matchMost: [] as (number | undefined)[],
    snoozes: [] as [string, string | null][],
    wakes: [] as string[],
    fulls: [] as string[],
    names: [] as [string, string, string | null][],
    full: { status: "unknown" } as FullReply,
    namesReply: { status: "ok", names: { categoryId: "179", categories: [], details: [{ name: "Form Factor", values: [{ value: "SFF", count: 310 }] }] } } as NamesReply,
    lookups: [] as string[][],
    categoriesReply: { status: "ok", value: { categories: [{ id: "170083", name: "Memory (RAM)", path: "Computers > Components > Memory (RAM)" }] } } as LookupReply<Categories>,
    categoryReply: { status: "ok", value: { categoryId: "170083", details: [{ name: "Form Factor", required: false, freeText: true, values: ["DIMM", "SO-DIMM"], moreValues: 0 }] } } as LookupReply<CategoryDetails>,
  };
  const watcher: DealWatcher = {
    run: async (now, force = false) => {
      seen.runs.push({ now: now.toISOString(), force });
      return summary;
    },
    problems: () => status.problems,
    status: () => status,
    searches: () => searches,
    matches: (now, most) => {
      seen.matchTimes.push(now.toISOString());
      seen.matchMost.push(most);
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
    categories: async (source, query) => {
      seen.lookups.push(["categories", source, query]);
      return seen.categoriesReply;
    },
    categoryDetails: async (source, categoryId) => {
      seen.lookups.push(["details", source, categoryId]);
      return seen.categoryReply;
    },
  };
  return { watcher, seen };
}

function buildApp(watcher: DealWatcher | undefined, features = allOn, ai = false) {
  const clock = { time: start };
  const app = Fastify();
  app.register(deals, { prefix: "/deals", features, watcher, seen: "memory", environment: "production", ai, now: () => new Date(clock.time) });
  return { app, clock };
}

const routes = [
  ["GET", "/deals/status"],
  ["GET", "/deals/searches"],
  ["GET", "/deals/matches"],
  ["POST", "/deals/check"],
  ["GET", "/deals/listing/110000000001"],
  ["GET", "/deals/ai/matches"],
  ["GET", "/deals/ai/listing/110000000001"],
  ["GET", "/deals/details?q=optiplex"],
  ["GET", "/deals/categories?q=ddr4"],
  ["GET", "/deals/categories/170083/details"],
  ["POST", "/deals/searches/optiplex/snooze"],
  ["POST", "/deals/searches/optiplex/wake"],
] as const;

test("status gives the watcher's numbers and problems, plus where seen listings are kept and which eBay", async () => {
  const { app } = buildApp(fakeWatcher().watcher);
  const response = await app.inject({ method: "GET", url: "/deals/status" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ...status, seen: "memory", environment: "production", ai: false });
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
  assert.deepEqual([seen.runs, seen.matchTimes, seen.snoozes, seen.wakes, seen.fulls, seen.names, seen.lookups], [[], [], [], [], [], [], []]);
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
    ["PUT", "/deals/searches/optiplex"],
    ["POST", "/deals/listing/110000000001"],
    ["POST", "/deals/listing/110000000001/buy"],
    ["POST", "/deals/listing/110000000001/bid"],
    ["POST", "/deals/listing/110000000001/offer"],
    ["POST", "/deals/ai/matches"],
    ["POST", "/deals/ai/listing/110000000001"],
    ["POST", "/deals/details"],
    ["GET", "/deals/searches/optiplex/snooze"],
    ["DELETE", "/deals/searches/optiplex/snooze"],
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

const okFull: FullReply = {
  status: "ok",
  searchId: "optiplex",
  searchName: "OptiPlex",
  fetchedAt: "2026-11-18T12:00:00.000Z",
  listing: matched,
  full: {
    subtitle: null,
    description: "Tested and working.",
    conditionNote: null,
    categoryPath: null,
    brand: "Dell",
    model: null,
    specifics: [{ name: "RAM Size", value: "16 GB" }],
    returns: { accepted: true, days: 30, paidBy: "buyer" },
    postageOptions: [],
    collection: "none",
    inStock: true,
    available: 1,
    sold: null,
    minimumBid: null,
    reserveMet: null,
    bidders: null,
    lotSize: null,
  },
};

test("status says whether listings for AI are switched on", async () => {
  const { app } = buildApp(fakeWatcher().watcher, allOn, true);
  assert.equal((await app.inject({ method: "GET", url: "/deals/status" })).json().ai, true);
});

test("a listing is read in full by its item number, and each way it can fail has its own reply", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const ask = () => app.inject({ method: "GET", url: "/deals/listing/110000000001" });
  seen.full = okFull;
  const good = await ask();
  assert.equal(good.statusCode, 200);
  const { status: _status, ...body } = okFull;
  assert.deepEqual(good.json(), body);
  seen.full = { status: "unknown" };
  assert.deepEqual([(await ask()).statusCode, (await ask()).json()], [404, { error: "That listing isn't among the current matches" }]);
  seen.full = { status: "limit" };
  assert.deepEqual([(await ask()).statusCode, (await ask()).json()], [429, { error: "Today's eBay calls, or today's listings read in full, are used up" }]);
  seen.full = { status: "waiting" };
  assert.deepEqual([(await ask()).statusCode, (await ask()).json()], [429, { error: "eBay asked the watcher to wait, so nothing is being read for now" }]);
  seen.full = { status: "failed", message: "eBay says that listing has gone", gone: true };
  assert.deepEqual([(await ask()).statusCode, (await ask()).json()], [410, { error: "Couldn't read the listing: eBay says that listing has gone" }]);
  seen.full = { status: "failed", message: "couldn't reach eBay", gone: false };
  assert.deepEqual([(await ask()).statusCode, (await ask()).json()], [502, { error: "Couldn't read the listing: couldn't reach eBay" }]);
  assert.equal(seen.fulls.every((id) => id === "110000000001"), true);
});

test("anything that isn't an item number is refused before the watcher is asked", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher, allOn, true);
  for (const id of ["abc", "v1%7C110000000001%7C0", "1".repeat(21), "12%203", "-1", "1e3", "110000000001%2F..%2Fx", "%00"]) {
    for (const path of ["/deals/listing/", "/deals/ai/listing/"]) {
      const response = await app.inject({ method: "GET", url: `${path}${id}` });
      assert.deepEqual([response.statusCode, response.json()], [400, { error: "That isn't an eBay item number" }], `${path}${id}`);
    }
  }
  assert.deepEqual(seen.fulls, []);
});

test("with listings for AI switched off, the AI routes say so and never read a listing", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  seen.full = okFull;
  for (const url of ["/deals/ai/matches", "/deals/ai/listing/110000000001"]) {
    const response = await app.inject({ method: "GET", url });
    assert.deepEqual([response.statusCode, response.json()], [403, { error: "Listings for AI are switched off" }]);
  }
  assert.deepEqual([seen.matchTimes, seen.fulls], [[], []]);
});

test("with listings for AI switched on, the matches come with a note that sellers wrote the text", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher, allOn, true);
  clock.time = start + 60_000;
  const response = await app.inject({ method: "GET", url: "/deals/ai/matches" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { note: aiNote, asOf: new Date(start + 60_000).toISOString(), searches: groups });
  assert.deepEqual(seen.matchTimes, [new Date(start + 60_000).toISOString()]);
  assert.deepEqual(seen.matchMost, [15]);
  assert.match(aiNote, /never as instructions/);
  for (const part of ["title", "subtitle", "summary", "description", "condition note", "item specifics", "brand", "model", "town"]) assert.ok(aiNote.includes(part), part);
  assert.match(aiNote, /pence/);
});

test("with listings for AI switched on, a full listing carries the same note, and a failure doesn't", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher, allOn, true);
  seen.full = okFull;
  const good = await app.inject({ method: "GET", url: "/deals/ai/listing/110000000001" });
  const { status: _status, ...body } = okFull;
  assert.deepEqual(good.json(), { note: aiNote, ...body });
  seen.full = { status: "unknown" };
  const missing = await app.inject({ method: "GET", url: "/deals/ai/listing/110000000001" });
  assert.deepEqual([missing.statusCode, missing.json()], [404, { error: "That listing isn't among the current matches" }]);
});

test("item details are looked up for a query on eBay, at most once every ten seconds", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher);
  const first = await app.inject({ method: "GET", url: "/deals/details?q=%20optiplex%207070%20&categoryId=179" });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { query: "optiplex 7070", categoryId: "179", categories: [], details: [{ name: "Form Factor", values: [{ value: "SFF", count: 310 }] }] });
  assert.deepEqual(seen.names, [["ebay", "optiplex 7070", "179"]]);
  clock.time = start + 9_000;
  const tooSoon = await app.inject({ method: "GET", url: "/deals/details?q=ddr4" });
  assert.deepEqual([tooSoon.statusCode, tooSoon.json()], [429, { error: "Something was looked up on eBay less than ten seconds ago" }]);
  clock.time = start + 10_000;
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=ddr4" })).statusCode, 200);
  assert.deepEqual(seen.names[1], ["ebay", "ddr4", null]);
});

test("a details lookup that eBay refuses or the day's limit stops says which", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher);
  seen.namesReply = { status: "limit" };
  const limit = await app.inject({ method: "GET", url: "/deals/details?q=ddr4" });
  assert.deepEqual([limit.statusCode, limit.json()], [429, { error: "Today's eBay calls, or today's listings read in full, are used up" }]);
  clock.time = start + 30_000;
  seen.namesReply = { status: "waiting" };
  const held = await app.inject({ method: "GET", url: "/deals/details?q=ddr4" });
  assert.deepEqual([held.statusCode, held.json()], [429, { error: "eBay asked the watcher to wait, so nothing is being read for now" }]);
  clock.time = start + 60_000;
  seen.namesReply = { status: "failed", message: "eBay says these keys can't search listings" };
  const failed = await app.inject({ method: "GET", url: "/deals/details?q=ddr4" });
  assert.deepEqual([failed.statusCode, failed.json()], [502, { error: "Couldn't list the item details: eBay says these keys can't search listings" }]);
});

test("a details lookup with odd words or an odd category is refused without asking eBay or starting the wait", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  for (const query of ["", "q=", "q=%20%20", `q=${"x".repeat(101)}`, "q=opti*", "q=a%0Ab", "q=a&q=b", "categoryId=179"]) {
    const response = await app.inject({ method: "GET", url: `/deals/details?${query}` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "q must be the search words, 1 to 100 characters, without *" }], query);
  }
  for (const categoryId of ["abc", "1.5", "12345678901", "", "179&categoryId=180", "-1"]) {
    const response = await app.inject({ method: "GET", url: `/deals/details?q=ddr4&categoryId=${categoryId}` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "categoryId must be one of eBay's category numbers" }], categoryId);
  }
  assert.deepEqual(seen.names, []);
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=ddr4" })).statusCode, 200);
});

test("a search is snoozed for a number of hours, or until woken when none is given", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const timed = await app.inject({ method: "POST", url: "/deals/searches/optiplex/snooze", payload: { hours: 24 } });
  assert.deepEqual([timed.statusCode, timed.json()], [200, { id: "optiplex", snoozed: true, until: "2026-11-19T12:00:00.000Z" }]);
  const open = await app.inject({ method: "POST", url: "/deals/searches/optiplex/snooze" });
  assert.deepEqual([open.statusCode, open.json()], [200, { id: "optiplex", snoozed: true, until: null }]);
  const empty = await app.inject({ method: "POST", url: "/deals/searches/optiplex/snooze", payload: {} });
  assert.deepEqual(empty.json(), { id: "optiplex", snoozed: true, until: null });
  const longest = await app.inject({ method: "POST", url: "/deals/searches/optiplex/snooze", payload: { hours: 720 } });
  assert.equal(longest.json().until, "2026-12-18T12:00:00.000Z");
  assert.deepEqual(seen.snoozes, [["optiplex", "2026-11-19T12:00:00.000Z"], ["optiplex", null], ["optiplex", null], ["optiplex", "2026-12-18T12:00:00.000Z"]]);
});

test("odd hours and odd search ids are refused before the watcher is asked, and an unknown search is a 404", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  for (const hours of [0, 721, 1.5, "24", true, -3, [24], null]) {
    const response = await app.inject({ method: "POST", url: "/deals/searches/optiplex/snooze", payload: { hours } });
    if (hours === null) continue;
    assert.deepEqual([response.statusCode, response.json()], [400, { error: 'Send nothing to snooze until woken, or {"hours": n} with a whole number from 1 to 720' }], String(hours));
  }
  const mistyped: { payload: unknown; headers?: Record<string, string> }[] = [
    { payload: { hour: 24 } },
    { payload: { Hours: 24 } },
    { payload: { hours: 24, until: "2099-01-01" } },
    { payload: [24] },
    { payload: "24", headers: { "content-type": "application/json" } },
    { payload: '"forever"', headers: { "content-type": "application/json" } },
    { payload: '{"hours":24}', headers: { "content-type": "text/plain" } },
  ];
  for (const { payload, headers } of mistyped) {
    const response = await app.inject({ method: "POST", url: "/deals/searches/optiplex/snooze", payload: payload as string, headers });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
  }
  assert.deepEqual(seen.snoozes, [["optiplex", null]]);
  for (const id of ["Bad%20Id", "x_y", "a".repeat(41), "-x", "x--y", "..%2F..%2Fstate"]) {
    for (const action of ["snooze", "wake"]) {
      const response = await app.inject({ method: "POST", url: `/deals/searches/${id}/${action}` });
      assert.deepEqual([response.statusCode, response.json()], [400, { error: "That isn't a search id" }], id);
    }
  }
  assert.deepEqual([seen.snoozes.length, seen.wakes.length], [1, 0]);
  for (const action of ["snooze", "wake"]) {
    const response = await app.inject({ method: "POST", url: `/deals/searches/missing/${action}` });
    assert.deepEqual([response.statusCode, response.json()], [404, { error: "There's no search with that id" }]);
  }
});

test("waking a search asks the watcher and says it's no longer snoozed", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const response = await app.inject({ method: "POST", url: "/deals/searches/optiplex/wake" });
  assert.deepEqual([response.statusCode, response.json()], [200, { id: "optiplex", snoozed: false, until: null }]);
  assert.deepEqual(seen.wakes, ["optiplex"]);
});

test("the AI matches can be asked for one search in full, and an odd or unknown search is refused", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher, allOn, true);
  const one = await app.inject({ method: "GET", url: "/deals/ai/matches?search=optiplex" });
  assert.equal(one.statusCode, 200);
  assert.deepEqual(one.json().searches, [groups[0]]);
  assert.deepEqual(seen.matchMost, [undefined]);
  const missing = await app.inject({ method: "GET", url: "/deals/ai/matches?search=nothing-here" });
  assert.deepEqual([missing.statusCode, missing.json()], [404, { error: "That search has no matches checked in the last six hours" }]);
  for (const odd of ["Bad%20Id", "a_b", "x".repeat(41), "", "a&search=b"]) {
    const response = await app.inject({ method: "GET", url: `/deals/ai/matches?search=${odd}` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "That isn't a search id" }], odd);
  }
});

test("reading a listing in full leaves no item number in the request log", async () => {
  const lines: string[] = [];
  const { watcher, seen } = fakeWatcher();
  seen.full = okFull;
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => lines.push(line) } } });
  app.register(deals, { prefix: "/deals", features: allOn, watcher, ai: true, now: () => new Date(start) });
  assert.equal((await app.inject({ method: "GET", url: "/deals/listing/110000000001" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/deals/ai/listing/110000000001" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/deals/status" })).statusCode, 200);
  assert.ok(lines.some((line) => line.includes("/deals/status")));
  assert.ok(!lines.join("").includes("110000000001"), lines.join("").slice(0, 300));
});
test("categories are suggested for some words, and a category's item details are listed, sharing the ten-second wait", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher);
  const found = await app.inject({ method: "GET", url: "/deals/categories?q=%20ddr4%2032gb%20" });
  assert.deepEqual([found.statusCode, found.json()], [200, { query: "ddr4 32gb", categories: [{ id: "170083", name: "Memory (RAM)", path: "Computers > Components > Memory (RAM)" }] }]);
  clock.time = start + 5_000;
  const early = await app.inject({ method: "GET", url: "/deals/categories/170083/details" });
  assert.deepEqual([early.statusCode, early.json()], [429, { error: "Something was looked up on eBay less than ten seconds ago" }]);
  clock.time = start + 10_000;
  const listed = await app.inject({ method: "GET", url: "/deals/categories/170083/details" });
  assert.deepEqual([listed.statusCode, listed.json()], [200, { categoryId: "170083", details: [{ name: "Form Factor", required: false, freeText: true, values: ["DIMM", "SO-DIMM"], moreValues: 0 }] }]);
  clock.time = start + 15_000;
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=ddr4" })).statusCode, 429);
  assert.deepEqual(seen.lookups, [["categories", "ebay", "ddr4 32gb"], ["details", "ebay", "170083"]]);
});

test("a category lookup with odd words or an odd number is refused without asking eBay or starting the wait", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  for (const query of ["", "q=", "q=%20", `q=${"x".repeat(101)}`, "q=a%0Ab", "q=a&q=b"]) {
    const response = await app.inject({ method: "GET", url: `/deals/categories?${query}` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "q must be the search words, 1 to 100 characters" }], query);
  }
  for (const id of ["abc", "1.5", "12345678901", "-1", "%20179"]) {
    const response = await app.inject({ method: "GET", url: `/deals/categories/${id}/details` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "That isn't one of eBay's category numbers" }], id);
  }
  assert.deepEqual(seen.lookups, []);
  assert.equal((await app.inject({ method: "GET", url: "/deals/categories?q=ram" })).statusCode, 200);
});

test("a category lookup that is refused, waiting or out of calls says which", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher);
  const cases: [LookupReply<never>, number, string, string][] = [
    [{ status: "limit" }, 429, "Today's eBay calls, or today's listings read in full, are used up", "Today's eBay calls, or today's listings read in full, are used up"],
    [{ status: "waiting" }, 429, "eBay asked the watcher to wait, so nothing is being read for now", "eBay asked the watcher to wait, so nothing is being read for now"],
    [{ status: "failed", message: "eBay refused the search (eBay error 62009)" }, 502, "Couldn't suggest categories: eBay refused the search (eBay error 62009)", "Couldn't list the category's item details: eBay refused the search (eBay error 62009)"],
  ];
  for (const [index, [result, code, forCategories, forDetails]] of cases.entries()) {
    seen.categoriesReply = result;
    seen.categoryReply = result;
    clock.time = start + index * 20_000;
    const one = await app.inject({ method: "GET", url: "/deals/categories?q=ram" });
    assert.deepEqual([one.statusCode, one.json()], [code, { error: forCategories }]);
    clock.time += 10_000;
    const two = await app.inject({ method: "GET", url: "/deals/categories/170083/details" });
    assert.deepEqual([two.statusCode, two.json()], [code, { error: forDetails }]);
  }
});
