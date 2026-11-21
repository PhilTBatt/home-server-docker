import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { aiNote, deals, fitted, itemNumberFrom } from "./routes.js";
import type { Categories, CategoryDetails, Listing } from "./source.js";
import type { DealWatcher, Explained, ExplainReply, FullReply, LookupReply, MatchGroup, MatchedListing, NamesReply, RunSummary, SearchCuts, SearchStatus, WatcherStatus } from "./watcher.js";

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
  digest: null,
};

const searches: SearchStatus[] = [
  { id: "optiplex", name: "OptiPlex", group: "whole pc", on: true, source: "ebay", query: "optiplex 7070 sff", everyMinutes: 30, lastChecked: "2026-11-18T11:55:00.000Z", watchingSince: "2026-11-17T09:00:00.000Z", matches: 2, total: 2, complete: true, problem: null, snoozed: false, snoozedUntil: null, alertsToday: 1, alertsPerDay: null, guidePrice: 12000, hidden: { words: 4 }, options: null, notes: [], callsToday: 0, health: [] },
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
  option: null,
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

const cutsValue: SearchCuts = {
  id: "optiplex",
  name: "OptiPlex",
  query: "optiplex 7070 sff",
  asWatched: 5,
  without: [
    { filter: "buy it now only", total: 52, by: [{ name: "auction", count: 40 }, { name: "buy it now", count: 12 }] },
    { filter: "items in the UK", total: 9, by: [] },
  ],
  wordsAlone: { total: 4409, categoryId: "27386", categories: [{ id: "27386", name: "Graphics/Video Cards", count: 117 }] },
};

const explainedValue: Explained = {
  checkedAt: "2026-11-18T12:00:00.000Z",
  item: {
    id: "110000000001",
    title: "Dell OptiPlex 7070 SFF",
    price: 9500,
    postage: 699,
    total: 10199,
    condition: "Used",
    buying: ["FIXED_PRICE"],
    country: "GB",
    listedAt: null,
    endsAt: null,
    sellerType: "business",
    sellerPercent: 99.4,
    sellerFeedback: 1234,
    url: "https://www.ebay.co.uk/itm/110000000001",
    categoryPath: "Computers/Tablets & Networking|Desktops & All-In-Ones",
    categoryIds: ["58058", "171957"],
    options: null,
    inStock: true,
  },
  searches: [{ id: "optiplex", name: "OptiPlex", on: true, snoozed: false, option: null, verdict: "match", says: "It's a current match.", reasons: [] }],
  about: "This checks the search's filters and rules.",
};

function fakeWatcher(summary: RunSummary = { ran: true, checked: 2, alerts: 1, failed: 0, unsent: true }) {
  const seen = {
    runs: [] as { now: string; force: boolean }[],
    matchTimes: [] as string[],
    matchMost: [] as (number | undefined)[],
    searchTimes: [] as string[],
    hiddenAsked: [] as [string, string][],
    snoozes: [] as [string, string | null][],
    wakes: [] as string[],
    fulls: [] as string[],
    names: [] as [string, string, string | null][],
    nameTimes: [] as string[],
    full: { status: "unknown" } as FullReply,
    namesReply: { status: "ok", names: { categoryId: "179", categories: [], details: [{ name: "Form Factor", values: [{ value: "SFF", count: 310 }] }] } } as NamesReply,
    lookups: [] as string[][],
    categoriesReply: { status: "ok", value: { categories: [{ id: "170083", name: "Memory (RAM)", path: "Computers > Components > Memory (RAM)" }] } } as LookupReply<Categories>,
    categoryReply: { status: "ok", value: { categoryId: "170083", details: [{ name: "Form Factor", required: false, freeText: true, values: ["DIMM", "SO-DIMM"], moreValues: 0 }] } } as LookupReply<CategoryDetails>,
    cutsReply: { status: "ok", value: cutsValue } as LookupReply<SearchCuts> | { status: "unknown" } | { status: "unsupported" },
    explained: [] as [string, string | null][],
    explainReply: { status: "ok", value: explainedValue } as ExplainReply,
  };
  const watcher: DealWatcher = {
    run: async (now, force = false) => {
      seen.runs.push({ now: now.toISOString(), force });
      return summary;
    },
    problems: () => status.problems,
    status: () => status,
    searches: (now) => {
      seen.searchTimes.push(now === undefined ? "none" : now.toISOString());
      return searches;
    },
    hidden: (id, now) => {
      seen.hiddenAsked.push([id, now.toISOString()]);
      return id === "optiplex" ? { id, name: "OptiPlex", checkedAt: "2026-11-18T11:55:00.000Z", hidden: { words: 4 }, examples: { words: ["Dell OptiPlex 7070 Micro"] } } : null;
    },
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
    detailNames: async (source, query, categoryId, now) => {
      seen.names.push([source, query, categoryId]);
      seen.nameTimes.push(now === undefined ? "none" : now.toISOString());
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
    cuts: async (id) => {
      seen.lookups.push(["cuts", id]);
      return seen.cutsReply;
    },
    explain: async (item, search) => {
      seen.explained.push([item, search]);
      return seen.explainReply;
    },
  };
  return { watcher, seen };
}

function buildApp(watcher: DealWatcher | undefined, features = allOn, ai = false) {
  const clock = { time: start };
  const waits: number[] = [];
  const app = Fastify();
  app.register(deals, {
    prefix: "/deals",
    features,
    watcher,
    seen: "memory",
    environment: "production",
    ai,
    now: () => new Date(clock.time),
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  return { app, clock, waits };
}

const routes = [
  ["GET", "/deals/status"],
  ["GET", "/deals/searches"],
  ["GET", "/deals/searches/optiplex/hidden"],
  ["GET", "/deals/matches"],
  ["POST", "/deals/check"],
  ["GET", "/deals/listing/110000000001"],
  ["GET", "/deals/ai/matches"],
  ["GET", "/deals/ai/listing/110000000001"],
  ["GET", "/deals/details?q=optiplex"],
  ["GET", "/deals/categories?q=ddr4"],
  ["GET", "/deals/categories/170083/details"],
  ["GET", "/deals/searches/optiplex/cuts"],
  ["GET", "/deals/explain?item=110000000001"],
  ["GET", "/deals/ai/explain?item=110000000001"],
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
  assert.deepEqual(response.json(), { note: aiNote, asOf: new Date(start + 60_000).toISOString(), cut: false, searches: groups });
  assert.deepEqual(seen.matchTimes, [new Date(start + 60_000).toISOString()]);
  assert.deepEqual(seen.matchMost, [15]);
  assert.match(aiNote, /never as instructions/);
  assert.match(aiNote, /the option a listing was matched to/);
  for (const part of ["title", "subtitle", "summary", "description", "condition note", "item specifics", "brand", "model", "town", "option"]) assert.ok(aiNote.includes(part), part);
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

test("item details are looked up for a query on eBay, at most once every ten seconds, with a lookup asked sooner waiting its turn", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock, waits } = buildApp(watcher);
  const first = await app.inject({ method: "GET", url: "/deals/details?q=%20optiplex%207070%20&categoryId=179" });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { query: "optiplex 7070", categoryId: "179", categories: [], details: [{ name: "Form Factor", values: [{ value: "SFF", count: 310 }] }] });
  assert.deepEqual(seen.names, [["ebay", "optiplex 7070", "179"]]);
  assert.deepEqual(waits, []);
  clock.time = start + 9_000;
  const soon = await app.inject({ method: "GET", url: "/deals/details?q=ddr4" });
  assert.equal(soon.statusCode, 200);
  assert.deepEqual(waits, [1_000]);
  assert.deepEqual(seen.names[1], ["ebay", "ddr4", null]);
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=ddr5" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=ddr3" })).statusCode, 200);
  assert.deepEqual(waits, [1_000, 11_000, 21_000]);
  const full = await app.inject({ method: "GET", url: "/deals/details?q=sodimm" });
  assert.deepEqual([full.statusCode, full.json()], [429, { error: "Too many eBay lookups are already waiting their turn, so try again in a minute" }]);
  assert.deepEqual(waits, [1_000, 11_000, 21_000]);
  assert.equal(seen.names.length, 4);
  clock.time = start + 40_000;
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=sodimm" })).statusCode, 200);
  assert.deepEqual(waits, [1_000, 11_000, 21_000]);
  clock.time = start + 45_000;
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=ecc" })).statusCode, 200);
  assert.deepEqual(waits, [1_000, 11_000, 21_000, 5_000]);
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
  const { app, clock, waits } = buildApp(watcher);
  const found = await app.inject({ method: "GET", url: "/deals/categories?q=%20ddr4%2032gb%20" });
  assert.deepEqual([found.statusCode, found.json()], [200, { query: "ddr4 32gb", categories: [{ id: "170083", name: "Memory (RAM)", path: "Computers > Components > Memory (RAM)" }] }]);
  clock.time = start + 5_000;
  const listed = await app.inject({ method: "GET", url: "/deals/categories/170083/details" });
  assert.deepEqual([listed.statusCode, listed.json()], [200, { categoryId: "170083", details: [{ name: "Form Factor", required: false, freeText: true, values: ["DIMM", "SO-DIMM"], moreValues: 0 }] }]);
  assert.deepEqual(waits, [5_000]);
  clock.time = start + 15_000;
  assert.equal((await app.inject({ method: "GET", url: "/deals/details?q=ddr4" })).statusCode, 200);
  assert.deepEqual(waits, [5_000, 5_000]);
  assert.deepEqual(seen.lookups, [["categories", "ebay", "ddr4 32gb"], ["details", "ebay", "170083"]]);
});

test("a category lookup with odd words or an odd number is refused without asking eBay or starting the wait", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, waits } = buildApp(watcher);
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
  assert.deepEqual(waits, []);
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

const ramListings: MatchedListing[] = [
  { ...matched, id: "110000000011", title: "Corsair 32GB (2x16GB) DDR4 3200", price: 8500, postage: 500, total: 9000 },
  { ...matched, id: "110000000012", title: "Kingston 32GB DDR4 2666 kit", price: 11000, postage: null, total: 11000 },
  { ...matched, id: "110000000013", title: "Crucial 16GB DDR5 4800", price: 6000, postage: 0, total: 6000 },
];

function filterWatcher() {
  const made = fakeWatcher();
  const all: MatchGroup[] = [groups[0], { ...groups[1], count: 3, listings: ramListings }, { ...groups[1], id: "hukd-ddr4", name: "HotUKDeals: DDR4", source: "hotukdeals", count: 0, listings: [] }];
  made.watcher.matches = (now, most, keep) => {
    made.seen.matchTimes.push(now.toISOString());
    made.seen.matchMost.push(most);
    return all.map((group) => {
      const kept = keep === undefined ? group.listings : group.listings.filter((listing) => keep(listing as unknown as Listing));
      return { ...group, count: keep === undefined ? group.count : kept.length, listings: kept.slice(0, most ?? 50) };
    });
  };
  return made;
}

test("the AI matches can be filtered by group, searches, words in the title, a top price and a number per search", async () => {
  const { watcher, seen } = filterWatcher();
  const { app } = buildApp(watcher, allOn, true);
  const ask = async (query: string) => {
    const response = await app.inject({ method: "GET", url: `/deals/ai/matches?${query}` });
    assert.equal(response.statusCode, 200, query);
    return (response.json().searches as MatchGroup[]).map((group) => `${group.id}: ${group.listings.map((listing) => listing.id.slice(-2)).join(" ")}`);
  };
  assert.deepEqual(await ask("group=ram"), ["ram: 11 12 13", "hukd-ddr4: "]);
  assert.deepEqual(await ask("group=ram&words=ddr4%2032gb"), ["ram: 11 12"]);
  assert.deepEqual(await ask("group=ram&words=32%20gb%20ddr4"), ["ram: 11 12"]);
  assert.deepEqual(await ask("group=ram&words=ddr4%203200"), ["ram: 11"]);
  assert.deepEqual(await ask("group=ram&maxTotal=100"), ["ram: 11 13", "hukd-ddr4: "]);
  assert.deepEqual(await ask("group=ram&maxTotal=89.99"), ["ram: 13", "hukd-ddr4: "]);
  assert.deepEqual(await ask("group=ram&maxTotal=90.00"), ["ram: 11 13", "hukd-ddr4: "]);
  assert.deepEqual(await ask("searches=ram,optiplex&limit=1"), ["optiplex: 01", "ram: 11"]);
  assert.deepEqual(await ask("searches=nothing"), []);
  assert.deepEqual(await ask("words=dell"), ["optiplex: 01"]);
  assert.deepEqual(await ask("ids=110000000012,hukd-5000001"), ["ram: 12"]);
  assert.deepEqual(await ask("ids=hukd-5000001"), []);
  assert.deepEqual(seen.matchMost, [50, 50, 50, 50, 50, 50, 50, 1, 50, 50, 50, 50]);
  const plain = await app.inject({ method: "GET", url: "/deals/ai/matches" });
  assert.equal(plain.statusCode, 200);
  assert.deepEqual(seen.matchMost.at(-1), 15);
  const grouped = await app.inject({ method: "GET", url: "/deals/ai/matches?group=ram" });
  assert.deepEqual(grouped.json().searches[0].count, 3);
  const worded = await app.inject({ method: "GET", url: "/deals/ai/matches?group=ram&words=32gb&limit=1" });
  assert.deepEqual([worded.json().searches[0].count, worded.json().searches[0].listings.length], [2, 1]);
});

test("odd AI filters are refused with what's allowed", async () => {
  const { watcher, seen } = filterWatcher();
  const { app } = buildApp(watcher, allOn, true);
  const cases: [string, string][] = [
    ["colour=red", "The filters are: search, searches, group, words, maxTotal, limit, ids"],
    ["limit=5", "maxTotal and limit need searches, group, words or ids with them"],
    ["maxTotal=100", "maxTotal and limit need searches, group, words or ids with them"],
    ["ids=abc", "ids must be up to 20 listing ids from the matches, separated by commas"],
    ["ids=1,,2", "ids must be up to 20 listing ids from the matches, separated by commas"],
    [`ids=${Array.from({ length: 21 }, (_, i) => String(i + 1)).join(",")}`, "ids must be up to 20 listing ids from the matches, separated by commas"],
    ["group=ram&group=cpu", "Give each filter once"],
    ["group=memory", "group must be one of: whole pc, server, cpu, motherboard, ram, storage, graphics, power supply, case, cooling, network, expansion, ups, other"],
    ["searches=a,,b", "searches must be up to 20 search ids, separated by commas"],
    [`searches=${Array.from({ length: 21 }, (_, i) => `s${i}`).join(",")}`, "searches must be up to 20 search ids, separated by commas"],
    ["searches=Bad", "searches must be up to 20 search ids, separated by commas"],
    ["words=ddr*", "words must be up to 100 characters, without *"],
    [`words=${"x".repeat(101)}`, "words must be up to 100 characters, without *"],
    ["words=a%0Ab", "words must be up to 100 characters, without *"],
    ["maxTotal=0", "maxTotal must be an amount in pounds, like 120 or 119.99"],
    ["maxTotal=-5", "maxTotal must be an amount in pounds, like 120 or 119.99"],
    ["maxTotal=12.345", "maxTotal must be an amount in pounds, like 120 or 119.99"],
    ["maxTotal=1e3", "maxTotal must be an amount in pounds, like 120 or 119.99"],
    ["limit=0", "limit must be a whole number from 1 to 50"],
    ["limit=51", "limit must be a whole number from 1 to 50"],
    ["limit=2.5", "limit must be a whole number from 1 to 50"],
    ["search=optiplex&group=ram", "search can't be mixed with other filters; use searches instead"],
  ];
  for (const [query, error] of cases) {
    const response = await app.inject({ method: "GET", url: `/deals/ai/matches?${query}` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error }], query);
  }
  assert.deepEqual(seen.matchTimes, []);
});

function bigListing(n: number): MatchedListing {
  return { ...matched, id: String(110_000_000_000 + n), title: `Big listing ${n} ${"x".repeat(70)}`, summary: "y".repeat(400), cautions: ["the seller has under 10 ratings", "the listing has more than one option, so this may be its lowest price"] };
}

test("an AI matches reply stays under 45,000 characters, sharing the room round the searches cheapest first, and says when it cut", () => {
  const time = new Date(start);
  const many: MatchGroup[] = Array.from({ length: 30 }, (_, g) => ({ ...groups[0], id: `search-${g}`, count: 15, listings: Array.from({ length: 15 }, (_, i) => bigListing(g * 100 + i)) }));
  const reply = fitted(time, many);
  assert.equal(reply.cut, true);
  assert.ok(JSON.stringify(reply).length <= 45_000, String(JSON.stringify(reply).length));
  const shown = reply.searches.map((group) => group.listings.length);
  assert.ok(Math.max(...shown) - Math.min(...shown) <= 1, shown.join(" "));
  assert.ok(reply.searches.every((group) => group.listings.length === 0 || group.listings[0].id === String(110_000_000_000 + Number(group.id.slice(7)) * 100)));
  assert.deepEqual(reply.searches.map((group) => group.count), many.map(() => 15));
  const small = fitted(time, groups);
  assert.deepEqual(small, { note: aiNote, asOf: time.toISOString(), cut: false, searches: groups });
});

test("an AI matches reply is never over 45,000 characters, whatever size its listings are, and fills the room it has", () => {
  const time = new Date(start);
  for (let pad = 0; pad < 300; pad += 7) {
    const one: MatchGroup[] = [{ ...groups[0], count: 400, listings: Array.from({ length: 400 }, (_, i) => ({ ...matched, id: String(120_000_000_000 + i), summary: "z".repeat(pad) })) }];
    const reply = fitted(time, one);
    const length = JSON.stringify(reply).length;
    assert.equal(reply.cut, true);
    assert.ok(length <= 45_000, `${pad}: ${length}`);
    assert.ok(length + JSON.stringify(one[0].listings[0]).length + 1 > 45_000, `${pad}: ${length}`);
  }
});

test("every AI matches route goes through the size limit", async () => {
  const { watcher, seen } = fakeWatcher();
  const huge: MatchGroup[] = Array.from({ length: 30 }, (_, g) => ({ ...groups[0], id: `search-${g}`, group: "ram", count: 50, listings: Array.from({ length: 50 }, (_, i) => bigListing(g * 100 + i)) }));
  watcher.matches = (now, most) => {
    seen.matchMost.push(most);
    return huge.map((group) => ({ ...group, listings: group.listings.slice(0, most ?? 50) }));
  };
  const { app } = buildApp(watcher, allOn, true);
  for (const url of ["/deals/ai/matches", "/deals/ai/matches?group=ram", "/deals/ai/matches?search=search-3"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, url);
    assert.ok(response.body.length <= 45_000, `${url}: ${response.body.length}`);
    assert.equal(response.json().cut, url !== "/deals/ai/matches?search=search-3" || response.json().searches[0].listings.length < 50, url);
  }
});

test("searches are given the time of asking, so their notes can say a guide price is old", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  await app.inject({ method: "GET", url: "/deals/searches" });
  assert.deepEqual(seen.searchTimes, [new Date(start).toISOString()]);
});

test("a search's hidden examples come from its last check, and an odd or unknown search is refused", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const found = await app.inject({ method: "GET", url: "/deals/searches/optiplex/hidden" });
  assert.equal(found.statusCode, 200);
  assert.deepEqual(found.json(), { id: "optiplex", name: "OptiPlex", checkedAt: "2026-11-18T11:55:00.000Z", hidden: { words: 4 }, examples: { words: ["Dell OptiPlex 7070 Micro"] } });
  assert.deepEqual(seen.hiddenAsked, [["optiplex", new Date(start).toISOString()]]);
  const missing = await app.inject({ method: "GET", url: "/deals/searches/ram/hidden" });
  assert.deepEqual([missing.statusCode, missing.json()], [404, { error: "That isn't one of the searches, or it has nothing checked in the last six hours" }]);
  for (const odd of ["Bad%20Id", "a_b", "x".repeat(41), "..%2Fstate"]) {
    const response = await app.inject({ method: "GET", url: `/deals/searches/${odd}/hidden` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "That isn't a search id" }], odd);
  }
  assert.equal(seen.hiddenAsked.length, 2);
});

test("the matches can be asked for at most a few listings a search, and anything else is refused", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  for (const url of ["/deals/matches", "/deals/matches?most=5", "/deals/matches?most=1", "/deals/matches?most=50"]) assert.equal((await app.inject({ method: "GET", url })).statusCode, 200, url);
  assert.deepEqual(seen.matchMost, [undefined, 5, 1, 50]);
  for (const odd of ["most=0", "most=51", "most=05", "most=2.5", "most=", "most=five", "most=5&most=6", "other=1", "most=5&x=1"]) {
    const response = await app.inject({ method: "GET", url: `/deals/matches?${odd}` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "Ask for nothing, or most=n with a whole number from 1 to 50" }], odd);
  }
  assert.equal(seen.matchMost.length, 4);
});

test("a lookup that has to wait reaches eBay only after its wait, ten seconds after the last", async () => {
  const { watcher, seen } = fakeWatcher();
  const clock = { time: start };
  const app = Fastify();
  app.register(deals, {
    prefix: "/deals",
    features: allOn,
    watcher,
    now: () => new Date(clock.time),
    wait: async (ms) => {
      await new Promise((resolve) => setImmediate(resolve));
      clock.time += ms;
    },
  });
  await app.inject({ method: "GET", url: "/deals/details?q=ddr4" });
  clock.time = start + 3_000;
  await app.inject({ method: "GET", url: "/deals/details?q=ddr5" });
  assert.deepEqual(seen.nameTimes, [new Date(start).toISOString(), new Date(start + 10_000).toISOString()]);
});

test("a search's cuts are counted for a known search id, waiting their turn with the other lookups", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock, waits } = buildApp(watcher);
  const found = await app.inject({ method: "GET", url: "/deals/searches/optiplex/cuts" });
  assert.deepEqual([found.statusCode, found.json()], [200, cutsValue]);
  clock.time = start + 4_000;
  assert.equal((await app.inject({ method: "GET", url: "/deals/categories?q=ram" })).statusCode, 200);
  assert.deepEqual(waits, [6_000]);
  for (const id of ["Optiplex", "a b", "-x", "x".repeat(41)]) {
    const response = await app.inject({ method: "GET", url: `/deals/searches/${encodeURIComponent(id)}/cuts` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "That isn't a search id" }], id);
  }
  const unknown = await app.inject({ method: "GET", url: "/deals/searches/nope/cuts" });
  assert.deepEqual([unknown.statusCode, unknown.json()], [404, { error: "That isn't one of the searches" }]);
  assert.deepEqual(waits, [6_000]);
  assert.deepEqual(seen.lookups, [["cuts", "optiplex"], ["categories", "ebay", "ram"]]);
});

test("a search's cuts that are refused, waiting, out of reads or gone say which", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app, clock } = buildApp(watcher);
  const cases: [LookupReply<SearchCuts> | { status: "unknown" } | { status: "unsupported" }, number, string][] = [
    [{ status: "limit" }, 429, "Today's share of eBay calls for cuts, or today's eBay calls or reads, are used up"],
    [{ status: "unsupported" }, 400, "That search's source can't show what each filter cuts"],
    [{ status: "waiting" }, 429, "eBay asked the watcher to wait, so nothing is being read for now"],
    [{ status: "failed", message: "couldn't reach eBay" }, 502, "Couldn't count what each filter cuts: couldn't reach eBay"],
    [{ status: "unknown" }, 404, "That isn't one of the searches"],
  ];
  for (const [reply, code, error] of cases) {
    clock.time += 60_000;
    seen.cutsReply = reply;
    const response = await app.inject({ method: "GET", url: "/deals/searches/optiplex/cuts" });
    assert.deepEqual([response.statusCode, response.json()], [code, { error }]);
  }
});

test("an item number is taken as it is, or from a link to a listing on eBay's UK or US site, and nothing else", () => {
  const good: [string, string][] = [
    ["110000000001", "110000000001"],
    ["  110000000001 ", "110000000001"],
    ["https://www.ebay.co.uk/itm/110000000001", "110000000001"],
    ["https://www.ebay.co.uk/itm/110000000001?hash=item1a&var=0", "110000000001"],
    ["https://www.ebay.co.uk/itm/Dell-OptiPlex-7070-SFF/110000000001", "110000000001"],
    ["https://m.ebay.co.uk/itm/110000000001/", "110000000001"],
    ["https://ebay.com/itm/110000000001#top", "110000000001"],
    ["http://www.ebay.co.uk/itm/110000000001", "110000000001"],
  ];
  for (const [text, number] of good) assert.equal(itemNumberFrom(text), number, text);
  const bad = [
    "",
    "12345",
    "1".repeat(21),
    "110000000001a",
    "https://www.ebay.co.uk/sch/i.html?_nkw=110000000001",
    "https://www.ebay.co.uk/itm/",
    "https://ebay.us/m/AbCdEf",
    "https://www.notebay.co.uk/itm/110000000001",
    "https://www.ebay.co.uk.example.com/itm/110000000001",
    "https://example.com/?u=https://www.ebay.co.uk/itm/110000000001",
    "https://user:pass@www.ebay.co.uk/itm/110000000001",
    "ftp://www.ebay.co.uk/itm/110000000001",
    "javascript:alert(1)//www.ebay.co.uk/itm/110000000001",
    "https://www.ebay.co.uk/itm/a/b/110000000001",
    `https://www.ebay.co.uk/itm/${"x".repeat(600)}/110000000001`,
    "https://www.ebay.co.uk/itm/110000000001\nhttps://evil",
  ];
  for (const text of bad) assert.equal(itemNumberFrom(text), null, text);
});

test("a listing is explained from its item number or link, for one named search or the ones that fit, with the item number kept out of the log", async () => {
  const lines: string[] = [];
  const { watcher, seen } = fakeWatcher();
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => lines.push(line) } } });
  app.register(deals, { prefix: "/deals", features: allOn, watcher, now: () => new Date(start) });
  const plain = await app.inject({ method: "GET", url: `/deals/explain?item=${encodeURIComponent("https://www.ebay.co.uk/itm/110000000001?hash=x")}` });
  assert.deepEqual([plain.statusCode, plain.json()], [200, explainedValue]);
  const named = await app.inject({ method: "GET", url: "/deals/explain?item=110000000001&search=optiplex" });
  assert.equal(named.statusCode, 200);
  assert.deepEqual(seen.explained, [["110000000001", null], ["110000000001", "optiplex"]]);
  assert.ok(!lines.join("").includes("110000000001"), lines.join("").slice(0, 300));
});

test("an explain request with an odd item, an odd search or anything else is refused without asking eBay", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  for (const query of ["", "item=", "item=12345", "item=https%3A%2F%2Febay.us%2Fm%2Fx", "item=1&item=2", "item=110000000001&search=Bad%20Id", "item=110000000001&search=a&search=b", "item=110000000001&extra=1"]) {
    const response = await app.inject({ method: "GET", url: `/deals/explain?${query}` });
    assert.deepEqual([response.statusCode, response.json()], [400, { error: "Give item= with an eBay item number or a link to an eBay listing, and if you like search= with a search id" }], query);
  }
  assert.deepEqual(seen.explained, []);
});

test("an explanation that's unknown, out of reads, waiting, gone or failed says which", async () => {
  const { watcher, seen } = fakeWatcher();
  const { app } = buildApp(watcher);
  const cases: [ExplainReply, number, string][] = [
    [{ status: "unknown" }, 404, "That isn't one of the searches"],
    [{ status: "unsupported" }, 400, "That search's source can't read a listing by its number"],
    [{ status: "limit" }, 429, "Today's eBay calls, or today's listings read in full, are used up"],
    [{ status: "waiting" }, 429, "eBay asked the watcher to wait, so nothing is being read for now"],
    [{ status: "failed", message: "eBay says that listing has gone", gone: true }, 410, "Couldn't read the listing: eBay says that listing has gone"],
    [{ status: "failed", message: "couldn't reach eBay", gone: false }, 502, "Couldn't read the listing: couldn't reach eBay"],
  ];
  for (const [reply, code, error] of cases) {
    seen.explainReply = reply;
    const response = await app.inject({ method: "GET", url: "/deals/explain?item=110000000001" });
    assert.deepEqual([response.statusCode, response.json()], [code, { error }]);
  }
});

test("the AI's explain route only answers while listings for AI are on, and carries the note about seller text", async () => {
  const { watcher, seen } = fakeWatcher();
  const off = buildApp(watcher).app;
  const refused = await off.inject({ method: "GET", url: "/deals/ai/explain?item=110000000001" });
  assert.deepEqual([refused.statusCode, refused.json()], [403, { error: "Listings for AI are switched off" }]);
  assert.deepEqual(seen.explained, []);
  const on = buildApp(watcher, allOn, true).app;
  const answered = await on.inject({ method: "GET", url: "/deals/ai/explain?item=110000000001&search=optiplex" });
  assert.deepEqual([answered.statusCode, answered.json()], [200, { note: aiNote, ...explainedValue }]);
  const bad = await on.inject({ method: "GET", url: "/deals/ai/explain?item=nope" });
  assert.equal(bad.statusCode, 400);
});
