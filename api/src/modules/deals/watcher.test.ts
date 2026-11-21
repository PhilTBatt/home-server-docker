import assert from "node:assert/strict";
import { test } from "node:test";
import type { Notification } from "../notify/notifier.js";
import { ebayMessages } from "./ebay.js";
import { readSearches, type Search, type SearchList } from "./searches.js";
import { SourceError, type DetailNames, type FailReason, type FullListing, type Listing, type ListingOption, type SearchResult, type Source } from "./source.js";
import { emptyMemory, readMemory, writeMemory, type Store } from "./store.js";
import { createDealWatcher, inQuiet } from "./watcher.js";

const start = Date.parse("2026-11-18T12:00:00.000Z");

function at(minutes: number): Date {
  return new Date(start + minutes * 60_000);
}

function listing(n: number, overrides: Partial<Listing> = {}): Listing {
  return {
    id: `v1|${110_000_000_000 + n}|0`,
    title: `Dell OptiPlex 7070 SFF number ${n}`,
    price: 9000 + n * 100,
    postage: 0,
    condition: "Used",
    conditionId: "3000",
    buying: ["FIXED_PRICE"],
    country: "GB",
    listedAt: new Date(start - 86_400_000).toISOString(),
    endsAt: null,
    bids: null,
    sellerPercent: 99.4,
    sellerFeedback: 1234,
    url: `https://www.ebay.co.uk/itm/${110_000_000_000 + n}`,
    ref: null,
    sellerType: null,
    topRated: null,
    postageType: null,
    city: null,
    postcode: null,
    summary: null,
    variations: false,
    detailsMatch: null,
    ...overrides,
  };
}

function listings(...numbers: number[]): Listing[] {
  return numbers.map((n) => listing(n));
}

const optiplex = { id: "optiplex", name: "OptiPlex", switch: "on", query: "optiplex 7070 sff" };
const ram = { id: "ram", name: "DDR4 RAM", switch: "on", query: "ddr4 2x16gb" };

function listOf(searches: Record<string, unknown>[], limits?: Record<string, number>): SearchList {
  return readSearches(JSON.stringify({ searches, limits }), ["ebay", "other"]);
}

function fakeStore(keepSeen: boolean) {
  const disk = { text: null as string | null, saves: 0, failSave: false, failLoad: false };
  const store: Store = {
    async load() {
      if (disk.failLoad) throw new Error("disk on fire");
      return { memory: (disk.text === null ? null : readMemory(disk.text, keepSeen)) ?? emptyMemory(), note: null };
    },
    async save(memory) {
      if (disk.failSave) throw new Error("Couldn't save the deal watcher's state");
      disk.saves += 1;
      disk.text = writeMemory(memory, keepSeen);
    },
  };
  return { store, disk };
}

type Reply = Listing[] | SourceError | Error | Partial<SearchResult>;

function setup(searches: Record<string, unknown>[] = [optiplex], options: { keepSeen?: boolean; limits?: Record<string, number>; sandbox?: boolean } = {}) {
  const world = {
    list: listOf(searches, options.limits) as SearchList | Error,
    found: new Map<string, Reply>(),
    calls: [] as { id: string; maxPages: number }[],
    sent: [] as Notification[],
    failNotify: 0,
    ...fakeStore(options.keepSeen ?? true),
  };
  const replyFor = async (search: Search, maxPages: number): Promise<SearchResult> => {
    world.calls.push({ id: search.id, maxPages });
    const reply = world.found.get(search.id) ?? [];
    if (reply instanceof Error) throw reply;
    if (Array.isArray(reply)) return { listings: reply, total: reply.length, complete: true, calls: 1, skipped: 0 };
    return { listings: [], total: 0, complete: true, calls: 1, skipped: 0, ...reply };
  };
  const sources: Record<string, Source> = { ebay: { search: replyFor }, other: { search: replyFor } };
  const build = () =>
    createDealWatcher({
      loadSearches: async () => {
        if (world.list instanceof Error) throw world.list;
        return world.list;
      },
      sources,
      store: world.store,
      notify: async (notification) => {
        if (world.failNotify > 0) {
          world.failNotify -= 1;
          throw new Error("ntfy replied 500");
        }
        world.sent.push(notification);
      },
      sandbox: options.sandbox,
    });
  return { world, watcher: build(), restart: build };
}

function failed(reason: FailReason, calls = 1): SourceError {
  const error = new SourceError(reason, ebayMessages[reason]);
  error.calls = calls;
  return error;
}

const oldKeys = ["title", "price", "postage", "total", "condition", "buying", "url", "listedAt", "endsAt", "firstSeen"];

function brief(groups: ReturnType<ReturnType<typeof createDealWatcher>["matches"]>) {
  return groups.map(({ guidePrice: _guidePrice, ...group }) => ({
    ...group,
    listings: group.listings.map((shown) => Object.fromEntries(Object.entries(shown).filter(([key]) => oldKeys.includes(key)))),
  }));
}

function titles(sent: Notification[]): string[] {
  return sent.map((notification) => notification.title);
}

test("a new search's first check alerts nothing and sends one now-watching message", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(3, 1, 2));
  const summary = await watcher.run(at(0));
  assert.deepEqual(summary, { ran: true, checked: 1, alerts: 0, failed: 0, unsent: false });
  assert.deepEqual(world.sent, [
    { title: "Deal watcher: now watching", message: "OptiPlex: 3 matches now, from £91.00.\nYou'll hear about new ones as they appear.", tags: "eyes" },
  ]);
});

test("the same listings again send nothing", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1, 2, 3));
  await watcher.run(at(0));
  world.sent.length = 0;
  for (let tick = 1; tick <= 12; tick++) await watcher.run(at(tick * 30));
  assert.equal(world.sent.length, 0);
  assert.equal(world.calls.length, 13);
});

test("a listing that appears later alerts once, with its link, and never again", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 7));
  const summary = await watcher.run(at(30));
  assert.equal(summary.alerts, 1);
  assert.equal(world.sent.length, 1);
  assert.equal(world.sent[0].title, "Deal: OptiPlex");
  assert.equal(world.sent[0].click, "https://www.ebay.co.uk/itm/110000000007");
  assert.ok(world.sent[0].message.startsWith("Dell OptiPlex 7070 SFF number 7\n£97.00 with free postage\n"));
  assert.ok(world.sent[0].message.includes("3rd cheapest of 3 matches right now; the cheapest is £91.00."));
  for (let tick = 2; tick <= 20; tick++) await watcher.run(at(tick * 30));
  assert.equal(world.sent.length, 1);
});

test("several searches starting together share one now-watching message", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  assert.equal(world.sent.length, 1);
  assert.equal(world.sent[0].message, "OptiPlex: 2 matches now, from £91.00.\nDDR4 RAM: nothing matches yet.\nYou'll hear about new ones as they appear.");
});

test("listings the search's own rules turn down are never alerted, counted or shown", async () => {
  const { world, watcher } = setup([{ ...optiplex, maxPrice: 95, exclude: ["faulty"] }]);
  world.found.set("optiplex", [listing(1)]);
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [listing(1), listing(2, { title: "Dell OptiPlex 7070 SFF FAULTY" }), listing(9), listing(3, { country: "DE" }), listing(4)]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent.map((notification) => notification.click), ["https://www.ebay.co.uk/itm/110000000004"]);
  assert.equal(watcher.searches()[0].matches, 2);
  assert.equal(watcher.searches()[0].total, 5);
});

test("new listings are alerted cheapest first, counting postage", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [listing(5), listing(1, { postage: 1000 }), listing(3)]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["3", "5", "1"]);
});

test("more new listings than the per-check limit get five alerts and one roll-up, and all count as seen", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6, 7, 8));
  const summary = await watcher.run(at(30));
  assert.equal(summary.alerts, 6);
  assert.deepEqual(titles(world.sent), ["Deal: OptiPlex", "Deal: OptiPlex", "Deal: OptiPlex", "Deal: OptiPlex", "Deal: OptiPlex", "Deals: 3 more for OptiPlex"]);
  assert.equal(world.sent[5].message, "£96.00: Dell OptiPlex 7070 SFF number 6\n£97.00: Dell OptiPlex 7070 SFF number 7\n£98.00: Dell OptiPlex 7070 SFF number 8");
  await watcher.run(at(60));
  assert.equal(world.sent.length, 6);
});

test("the per-check limit can be changed in the list", async () => {
  const { world, watcher } = setup([optiplex], { limits: { alertsPerCheck: 2 } });
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 3, 4));
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent), ["Deal: OptiPlex", "Deal: OptiPlex", "Deals: 2 more for OptiPlex"]);
});

test("an alert that fails to send is tried again at the next check, and never sent twice", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 3));
  world.failNotify = 1;
  const summary = await watcher.run(at(30));
  assert.deepEqual(summary, { ran: true, checked: 1, alerts: 0, failed: 0, unsent: true });
  assert.equal(world.sent.length, 0);
  await watcher.run(at(60));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["1", "2", "3"]);
  await watcher.run(at(90));
  assert.equal(world.sent.length, 3);
});

test("after one send fails, the rest of that run sends nothing, so a broken ntfy isn't hammered", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 3));
  world.found.set("ram", listings(11, 12));
  world.failNotify = 1;
  await watcher.run(at(30));
  assert.equal(world.sent.length, 0);
  assert.equal(world.failNotify, 0);
  await watcher.run(at(60));
  assert.equal(world.sent.length, 5);
});

test("a send failing part-way keeps what was sent as seen and retries only the rest", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6, 7));
  let sends = 0;
  const realPush = world.sent.push.bind(world.sent);
  world.sent.push = (...items: Notification[]) => {
    sends += 1;
    if (sends === 6) throw new Error("ntfy replied 500");
    return realPush(...items);
  };
  await watcher.run(at(30));
  assert.equal(world.sent.length, 5);
  world.sent.push = realPush;
  await watcher.run(at(60));
  assert.deepEqual(world.sent.slice(5).map((notification) => notification.click?.slice(-1)), ["6", "7"]);
});

test("the daily alert limit stops alerts with one paused notice, and what wasn't sent comes tomorrow", async () => {
  const { world, watcher } = setup([optiplex], { limits: { alertsPerDay: 3 } });
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 3, 4, 5));
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent), ["Deal: OptiPlex", "Deal: OptiPlex", "Deal: OptiPlex", "Deal watcher: alerts paused"]);
  assert.equal(watcher.status().alertsToday, 3);
  await watcher.run(at(60));
  await watcher.run(at(90));
  assert.equal(world.sent.length, 4);
  await watcher.run(at(24 * 60));
  assert.deepEqual(titles(world.sent.slice(4)), ["Deal: OptiPlex", "Deal: OptiPlex"]);
  assert.equal(watcher.status().alertsToday, 2);
});

test("the paused notice isn't repeated after a restart on the same day", async () => {
  const { world, watcher, restart } = setup([optiplex], { limits: { alertsPerDay: 1 } });
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching", "Deal: OptiPlex", "Deal watcher: alerts paused"]);
  const again = restart();
  await again.run(at(60));
  await again.run(at(90));
  assert.equal(world.sent.length, 3);
});

test("the now-watching message doesn't use up the day's alerts", async () => {
  const { world, watcher } = setup([optiplex], { limits: { alertsPerDay: 1 } });
  await watcher.run(at(0));
  assert.equal(watcher.status().alertsToday, 0);
  world.found.set("optiplex", listings(1));
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching", "Deal: OptiPlex"]);
});

test("a now-watching message that fails to send doesn't turn the first listings into alerts", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1, 2));
  world.failNotify = 1;
  const summary = await watcher.run(at(0));
  assert.equal(summary.unsent, true);
  await watcher.run(at(30));
  assert.equal(world.sent.length, 0);
});

test("a price drop of the chosen size alerts once, measured from the last price alerted", async () => {
  const { world, watcher } = setup([{ ...optiplex, dropPercent: 10 }]);
  world.found.set("optiplex", [listing(1, { price: 10000 })]);
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [listing(1, { price: 9001 })]);
  await watcher.run(at(30));
  assert.equal(world.sent.length, 0);
  world.found.set("optiplex", [listing(1, { price: 9000 })]);
  await watcher.run(at(60));
  assert.deepEqual(titles(world.sent), ["Price drop: OptiPlex"]);
  assert.equal(world.sent[0].message.split("\n")[1], "Was £100.00, now £90.00 with free postage");
  await watcher.run(at(90));
  world.found.set("optiplex", [listing(1, { price: 8500 })]);
  await watcher.run(at(120));
  assert.equal(world.sent.length, 1);
  world.found.set("optiplex", [listing(1, { price: 8100 })]);
  await watcher.run(at(150));
  assert.equal(world.sent.length, 2);
  assert.equal(world.sent[1].message.split("\n")[1], "Was £90.00, now £81.00 with free postage");
});

test("a price that goes up and comes back down to where it was doesn't alert again", async () => {
  const { world, watcher } = setup([{ ...optiplex, dropPercent: 10 }]);
  world.found.set("optiplex", [listing(1, { price: 10000 })]);
  await watcher.run(at(0));
  world.sent.length = 0;
  for (const [tick, price] of [[1, 15000], [2, 10000], [3, 20000], [4, 9500]] as const) {
    world.found.set("optiplex", [listing(1, { price })]);
    await watcher.run(at(tick * 30));
  }
  assert.equal(world.sent.length, 0);
});

test("without dropPercent a cheaper price never alerts and no price is remembered", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", [listing(1, { price: 10000 })]);
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [listing(1, { price: 100 })]);
  await watcher.run(at(30));
  assert.equal(world.sent.length, 0);
  assert.ok(!(world.disk.text ?? "").includes("price"));
});

test("turning dropPercent on later starts from today's price without alerting, and turning it off forgets prices", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", [listing(1, { price: 10000 }), listing(2, { price: 20000 })]);
  await watcher.run(at(0));
  await watcher.run(at(30));
  world.sent.length = 0;
  world.list = listOf([{ ...optiplex, dropPercent: 10 }]);
  world.found.set("optiplex", [listing(1, { price: 5000 }), listing(2, { price: 20000 })]);
  await watcher.run(at(60));
  assert.equal(world.sent.length, 0);
  assert.ok((world.disk.text ?? "").includes('"price":5000'));
  world.found.set("optiplex", [listing(1, { price: 4000 }), listing(2, { price: 20000 })]);
  await watcher.run(at(90));
  assert.deepEqual(titles(world.sent), ["Price drop: OptiPlex"]);
  world.list = listOf([optiplex]);
  await watcher.run(at(120));
  assert.ok(!(world.disk.text ?? "").includes("price"));
});

test("a new listing and a price drop in the same check both alert", async () => {
  const { world, watcher } = setup([{ ...optiplex, dropPercent: 10 }]);
  world.found.set("optiplex", [listing(1, { price: 10000 })]);
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [listing(1, { price: 8000 }), listing(2, { price: 9000 })]);
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent), ["Price drop: OptiPlex", "Deal: OptiPlex"]);
});

test("changing what a search matches starts it fresh, with a now-watching message instead of a flood", async () => {
  const { world, watcher } = setup([{ ...optiplex, maxPrice: 92 }]);
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6, 7, 8));
  await watcher.run(at(0));
  world.sent.length = 0;
  world.list = listOf([{ ...optiplex, maxPrice: 150 }]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent, [{ title: "Deal watcher: now watching", message: "OptiPlex: 8 matches now, from £91.00.\nYou'll hear about new ones as they appear.", tags: "eyes" }]);
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6, 7, 8, 9));
  await watcher.run(at(60));
  assert.deepEqual(world.sent.slice(1).map((notification) => notification.click?.slice(-1)), ["9"]);
});

test("renaming a search or changing how often it runs doesn't start it fresh", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.sent.length = 0;
  world.list = listOf([{ ...optiplex, name: "Dell SFF", everyMinutes: 5 }]);
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(5));
  assert.deepEqual(titles(world.sent), ["Deal: Dell SFF"]);
});

test("a search runs when its own interval has passed, not on every tick", async () => {
  const { world, watcher } = setup([optiplex, { ...ram, everyMinutes: 60 }]);
  for (let minutes = 0; minutes <= 120; minutes += 5) await watcher.run(at(minutes));
  assert.equal(world.calls.filter((call) => call.id === "optiplex").length, 5);
  assert.equal(world.calls.filter((call) => call.id === "ram").length, 3);
});

test("a tick that lands a few seconds early still counts as due", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  await watcher.run(new Date(start + 30 * 60_000 - 20_000));
  assert.equal(world.calls.length, 2);
  await watcher.run(new Date(start + 59 * 60_000));
  assert.equal(world.calls.length, 2);
});

test("a switched-off search is never checked, even when forced", async () => {
  const { world, watcher } = setup([{ ...optiplex, switch: "off" }, ram]);
  await watcher.run(at(0));
  await watcher.run(at(30), true);
  assert.deepEqual([...new Set(world.calls.map((call) => call.id))], ["ram"]);
  assert.equal(watcher.searches()[0].on, false);
  assert.equal(watcher.searches()[0].lastChecked, null);
});

test("a forced run checks every switched-on search whatever the schedule says", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  await watcher.run(at(0));
  await watcher.run(at(1));
  assert.equal(world.calls.length, 2);
  const summary = await watcher.run(at(2), true);
  assert.equal(summary.checked, 2);
  assert.equal(world.calls.length, 4);
});

test("a run that starts while another is going does nothing", async () => {
  const { world, watcher } = setup();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow: Source = {
    async search() {
      world.calls.push({ id: "slow", maxPages: 0 });
      await held;
      return { listings: [], total: 0, complete: true, calls: 1, skipped: 0 };
    },
  };
  const busy = createDealWatcher({ loadSearches: async () => listOf([optiplex]), sources: { ebay: slow }, store: world.store, notify: async () => undefined });
  const first = busy.run(at(0));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await busy.run(at(0), true), { ran: false, checked: 0, alerts: 0, failed: 0, unsent: false });
  release();
  assert.equal((await first).checked, 1);
  assert.equal(world.calls.length, 1);
  assert.equal((await busy.run(at(1), true)).ran, true);
  assert.ok(watcher);
});

test("the list is read again before every run, so an edit needs no restart", async () => {
  const { world, watcher } = setup([optiplex]);
  await watcher.run(at(0));
  world.list = listOf([optiplex, ram]);
  await watcher.run(at(5));
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex", "ram"]);
  assert.deepEqual(watcher.searches().map((search) => search.id), ["optiplex", "ram"]);
});

test("a broken list stops every check and is reported, and fixing it clears the problem", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  world.list = new Error("search 1 (optiplex): switch must be on or off");
  const summary = await watcher.run(at(30));
  assert.deepEqual(summary, { ran: true, checked: 0, alerts: 0, failed: 0, unsent: false });
  assert.equal(world.calls.length, 1);
  assert.deepEqual(watcher.problems(), [{ code: "deals-list", message: "The deal watcher's search list has a problem: search 1 (optiplex): switch must be on or off." }]);
  world.list = listOf([optiplex]);
  await watcher.run(at(35));
  assert.deepEqual(watcher.problems(), []);
  assert.equal(world.calls.length, 2);
});

test("a broken list on the very first run is reported and nothing is checked or saved", async () => {
  const { world, watcher } = setup();
  world.list = new Error("there's no searches.json in the deals folder");
  await watcher.run(at(0));
  assert.equal(watcher.problems()[0].message, "The deal watcher's search list has a problem: there's no searches.json in the deals folder.");
  assert.equal(world.calls.length, 0);
  assert.equal(world.disk.saves, 0);
  assert.deepEqual(watcher.searches(), []);
});

test("one search being refused doesn't stop the others", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  world.found.set("optiplex", failed("request"));
  world.found.set("ram", listings(11));
  const summary = await watcher.run(at(0));
  assert.deepEqual(summary, { ran: true, checked: 1, alerts: 0, failed: 1, unsent: false });
  assert.equal(watcher.searches()[0].problem, "eBay refused the search");
  assert.equal(watcher.searches()[1].problem, null);
  assert.equal(watcher.searches()[1].matches, 1);
});

test("when a source can't be reached, its other searches wait ten minutes too instead of each trying in turn", async () => {
  const { world, watcher } = setup([optiplex, ram, { ...ram, id: "third", name: "Third" }]);
  world.found.set("optiplex", failed("down", 0));
  await watcher.run(at(0));
  await watcher.run(at(5));
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex"]);
  await watcher.run(at(10));
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex", "optiplex"]);
  world.found.set("optiplex", listings(1));
  await watcher.run(at(20));
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex", "optiplex", "optiplex", "ram", "third"]);
});

test("refused keys are a problem straight away, and that source is left alone for an hour", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  world.found.set("optiplex", failed("keys", 2));
  await watcher.run(at(0));
  assert.deepEqual(watcher.problems(), [{ code: "deals-source", message: "The deal watcher can't check its searches: eBay refused the keys." }]);
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex"]);
  for (let minutes = 5; minutes < 60; minutes += 5) await watcher.run(at(minutes));
  assert.equal(world.calls.length, 1);
  world.found.set("optiplex", listings(1));
  await watcher.run(at(60));
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex", "optiplex", "ram"]);
  assert.deepEqual(watcher.problems(), []);
});

test("keys that can't search are a problem straight away too", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", failed("access"));
  await watcher.run(at(0));
  assert.equal(watcher.problems()[0].message, "The deal watcher can't check its searches: eBay says these keys can't search listings.");
});

test("a forced run tries a paused source again at once, for after the keys are fixed", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", failed("keys"));
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1));
  await watcher.run(at(1), true);
  assert.equal(world.calls.length, 2);
  assert.deepEqual(watcher.problems(), []);
});

test("being told too many requests pauses the source for an hour and is a problem after three in a row", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  world.found.set("optiplex", failed("busy"));
  await watcher.run(at(0));
  assert.deepEqual(watcher.problems(), []);
  await watcher.run(at(30));
  assert.equal(world.calls.length, 1);
  await watcher.run(at(60));
  await watcher.run(at(120));
  assert.equal(world.calls.length, 3);
  assert.equal(watcher.problems()[0].message, "The deal watcher can't check its searches: eBay says too many requests.");
});

test("an unreachable eBay is retried after ten minutes and only becomes a problem the third time running", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.found.set("optiplex", failed("down"));
  await watcher.run(at(30));
  await watcher.run(at(35));
  assert.equal(world.calls.length, 2);
  assert.deepEqual(watcher.problems(), []);
  await watcher.run(at(40));
  assert.equal(world.calls.length, 3);
  assert.deepEqual(watcher.problems(), []);
  await watcher.run(at(50));
  assert.deepEqual(watcher.problems(), [{ code: "deals-source", message: "The deal watcher can't check its searches: couldn't reach eBay." }]);
  world.found.set("optiplex", listings(1));
  await watcher.run(at(60));
  assert.deepEqual(watcher.problems(), []);
  assert.equal(watcher.searches()[0].problem, null);
});

test("a different failure starts the count again", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", failed("down"));
  await watcher.run(at(0));
  await watcher.run(at(10));
  world.found.set("optiplex", failed("reply"));
  await watcher.run(at(20));
  assert.deepEqual(watcher.problems(), []);
  await watcher.run(at(30));
  await watcher.run(at(40));
  assert.equal(watcher.problems()[0].message, "The deal watcher can't check a search (optiplex): eBay's reply didn't make sense.");
});

test("a search eBay refuses is retried hourly, not every tick", async () => {
  const { world, watcher } = setup([{ ...optiplex, everyMinutes: 5 }]);
  const refused = new SourceError("request", "eBay refused the search (eBay error 12023)");
  refused.calls = 1;
  world.found.set("optiplex", refused);
  for (let minutes = 0; minutes <= 125; minutes += 5) await watcher.run(at(minutes));
  assert.equal(world.calls.length, 3);
  assert.equal(watcher.problems()[0].message, "The deal watcher can't check a search (optiplex): eBay refused the search (eBay error 12023).");
});

test("a source that throws something unexpected is contained and reported without its words", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  world.found.set("optiplex", new TypeError("Cannot read properties of undefined (reading 'secret-thing')"));
  world.found.set("ram", listings(11));
  const summary = await watcher.run(at(0));
  assert.equal(summary.failed, 1);
  assert.equal(summary.checked, 1);
  assert.equal(watcher.searches()[0].problem, "the check stopped unexpectedly");
  assert.ok(!JSON.stringify([watcher.status(), watcher.searches()]).includes("secret-thing"));
});

test("a reply where nothing could be read is a failure, not an empty result", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.found.set("optiplex", { listings: [], total: 40, skipped: 40 });
  const summary = await watcher.run(at(30));
  assert.equal(summary.failed, 1);
  assert.equal(watcher.searches()[0].problem, "none of the listings it sent could be read");
  assert.equal(watcher.searches()[0].matches, 1);
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(40));
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching", "Deal: OptiPlex"]);
});

test("a few unreadable listings among good ones aren't a failure", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", { listings: listings(1, 2), total: 5, skipped: 3 });
  const summary = await watcher.run(at(0));
  assert.equal(summary.failed, 0);
  assert.equal(watcher.searches()[0].matches, 2);
});

test("the problem names up to three failing searches and counts the rest", async () => {
  const many = ["a", "b", "c", "d", "e"].map((id) => ({ ...optiplex, id, name: id.toUpperCase() }));
  const { world, watcher } = setup(many);
  for (const id of ["a", "b", "c", "d"]) world.found.set(id, failed("reply"));
  for (const minutes of [0, 10]) await watcher.run(at(minutes));
  assert.deepEqual(watcher.problems(), []);
  await watcher.run(at(20));
  assert.deepEqual(watcher.problems(), [{ code: "deals-source", message: "The deal watcher can't check 4 searches (a, b, c and 1 more): eBay's reply didn't make sense." }]);
  assert.equal(watcher.searches()[4].problem, null);
});

test("when several things are wrong, the problem gives the most serious one", async () => {
  const { world, watcher } = setup([optiplex, { ...ram, source: "other" }]);
  world.found.set("optiplex", failed("reply"));
  for (const minutes of [0, 10, 20]) await watcher.run(at(minutes));
  world.found.set("ram", failed("access"));
  await watcher.run(at(30));
  assert.deepEqual(watcher.problems(), [{ code: "deals-source", message: "The deal watcher can't check its searches: eBay says these keys can't search listings." }]);
});

test("a source's pause doesn't hold back searches on another source", async () => {
  const { world, watcher } = setup([optiplex, { ...ram, source: "other" }]);
  world.found.set("optiplex", failed("keys"));
  await watcher.run(at(0));
  await watcher.run(at(30));
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex", "ram", "ram"]);
});

test("every call is counted, including the ones failures made, and the day's limit stops the checks", async () => {
  const { world, watcher } = setup([optiplex, ram, { ...ram, id: "third", name: "Third" }], { limits: { callsPerDay: 5 } });
  world.found.set("optiplex", { listings: [], total: 0, calls: 3 });
  world.found.set("ram", failed("down", 2));
  await watcher.run(at(0));
  assert.deepEqual(world.calls.map((call) => call.id), ["optiplex", "ram"]);
  assert.equal(watcher.status().callsToday, 5);
  assert.deepEqual(watcher.problems(), [{ code: "deals-limit", message: "The deal watcher has used today's 5 calls and carries on tomorrow." }]);
  await watcher.run(at(60), true);
  assert.equal(world.calls.length, 2);
});

test("the pages a search may fetch shrink to the calls left", async () => {
  const { world, watcher } = setup([optiplex, ram], { limits: { callsPerDay: 4 } });
  world.found.set("optiplex", { listings: [], total: 0, calls: 3 });
  await watcher.run(at(0));
  assert.deepEqual(world.calls, [{ id: "optiplex", maxPages: 3 }, { id: "ram", maxPages: 1 }]);
});

test("the counts start again at midnight in London, not UTC", async () => {
  const { world, watcher } = setup([{ ...optiplex, everyMinutes: 5 }], { limits: { callsPerDay: 2 } });
  await watcher.run(new Date("2026-07-01T22:00:00.000Z"));
  await watcher.run(new Date("2026-07-01T22:30:00.000Z"));
  await watcher.run(new Date("2026-07-01T22:55:00.000Z"));
  assert.equal(world.calls.length, 2);
  assert.equal(watcher.problems()[0]?.code, "deals-limit");
  await watcher.run(new Date("2026-07-01T23:05:00.000Z"));
  assert.equal(world.calls.length, 3);
  assert.equal(watcher.status().callsToday, 1);
  assert.deepEqual(watcher.problems(), []);
});

test("the state is saved after every run that got as far as checking", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  await watcher.run(at(1));
  assert.equal(world.disk.saves, 2);
});

test("a state that won't save is a problem until it saves again, and the run still finishes", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1));
  world.disk.failSave = true;
  const summary = await watcher.run(at(0));
  assert.equal(summary.checked, 1);
  assert.deepEqual(watcher.problems(), [{ code: "deals-state", message: "The deal watcher couldn't save its state, so it may repeat or miss alerts after a restart." }]);
  world.disk.failSave = false;
  await watcher.run(at(30));
  assert.deepEqual(watcher.problems(), []);
});

test("a state that won't load starts fresh and says so in the status", async () => {
  const { world, watcher } = setup();
  world.disk.failLoad = true;
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  assert.equal(watcher.status().note, "The deal watcher's state couldn't be loaded, so every search started fresh.");
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching"]);
});

test("with seen listings on disk, a restart re-alerts nothing and still catches what's new", async () => {
  const { world, watcher, restart } = setup([optiplex], { keepSeen: true });
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2, 3));
  await watcher.run(at(30));
  world.sent.length = 0;
  const again = restart();
  world.found.set("optiplex", [...listings(1, 2, 3), listing(4, { listedAt: at(-600).toISOString() })]);
  await again.run(at(31));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["4"]);
});

test("with seen listings in memory only, a restart alerts just what was listed since the last check", async () => {
  const { world, watcher, restart } = setup([optiplex], { keepSeen: false });
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  world.found.set("optiplex", [...listings(1, 2), listing(3, { listedAt: at(20).toISOString() })]);
  await watcher.run(at(30));
  world.sent.length = 0;
  const again = restart();
  world.found.set("optiplex", [
    ...listings(1, 2),
    listing(3, { listedAt: at(20).toISOString() }),
    listing(4, { listedAt: at(35).toISOString() }),
    listing(5, { listedAt: at(-600).toISOString() }),
    listing(6, { listedAt: null }),
    listing(7, { listedAt: at(30).toISOString() }),
  ]);
  await again.run(at(40));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["4"]);
  await again.run(at(70));
  assert.equal(world.sent.length, 1);
  world.found.set("optiplex", [...listings(1, 2, 3, 4, 5, 6, 7), listing(8, { listedAt: at(-900).toISOString() })]);
  await again.run(at(100));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["4", "8"]);
});

test("in memory-only mode nothing from a listing is ever written to the state, whatever happens", async () => {
  const { world, watcher } = setup([{ ...optiplex, dropPercent: 10 }, ram], { keepSeen: false });
  world.found.set("optiplex", [listing(1, { price: 10000, title: "UNIQUE-TITLE-WORDS" })]);
  world.found.set("ram", listings(11, 12));
  await watcher.run(at(0));
  world.found.set("optiplex", [listing(1, { price: 8000, title: "UNIQUE-TITLE-WORDS" }), listing(2)]);
  world.found.set("ram", failed("down"));
  await watcher.run(at(30));
  await watcher.run(at(60));
  const text = world.disk.text ?? "";
  for (const fragment of ["1100000000", "v1|", "UNIQUE-TITLE-WORDS", "ebay.co.uk", "8000", "10000", "seen", "price", "Dell"]) {
    assert.ok(!text.includes(fragment), `${fragment} in ${text}`);
  }
  assert.deepEqual(Object.keys(JSON.parse(text).searches.optiplex).sort(), ["checked", "criteria", "matched", "since", "wide"]);
});

test("in disk mode the state holds listing ids, times and at most a price, never titles, links or seller numbers", async () => {
  const { world, watcher } = setup([{ ...optiplex, dropPercent: 10 }], { keepSeen: true });
  world.found.set("optiplex", [listing(1, { title: "UNIQUE-TITLE-WORDS", sellerPercent: 87.65, sellerFeedback: 424242 })]);
  await watcher.run(at(0));
  const text = world.disk.text ?? "";
  assert.ok(text.includes("v1|110000000001|0"));
  for (const fragment of ["UNIQUE-TITLE-WORDS", "ebay.co.uk", "87.65", "424242", "Used"]) assert.ok(!text.includes(fragment), fragment);
  assert.deepEqual(Object.keys(JSON.parse(text).searches.optiplex.seen["v1|110000000001|0"]).sort(), ["first", "last", "price"]);
});

test("a memory-only restart more than a day later starts fresh with a now-watching message", async () => {
  const { world, watcher, restart } = setup([optiplex], { keepSeen: false });
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.sent.length = 0;
  const again = restart();
  world.found.set("optiplex", [listing(1), listing(2, { listedAt: at(600).toISOString() })]);
  await again.run(at(24 * 60 + 1));
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching"]);
  await again.run(at(24 * 60 + 31));
  assert.equal(world.sent.length, 1);
});

test("a listing that's been gone two days is forgotten, and alerts again if it comes back", async () => {
  const { world, watcher } = setup([{ ...optiplex, everyMinutes: 1440 }]);
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1));
  await watcher.run(at(1440));
  await watcher.run(at(2880));
  assert.ok((world.disk.text ?? "").includes("110000000002"));
  await watcher.run(at(4320));
  assert.ok(!(world.disk.text ?? "").includes("110000000002"));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(5760));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["2"]);
});

test("a listing that drops out for a while and comes back within two days doesn't alert again", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1));
  for (let tick = 1; tick <= 40; tick++) await watcher.run(at(tick * 30));
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(41 * 30));
  assert.equal(world.sent.length, 0);
});

test("switching a search off forgets what it had seen, and it's dropped from the matches", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  assert.equal(watcher.matches(at(1)).length, 1);
  world.list = listOf([{ ...optiplex, switch: "off" }]);
  await watcher.run(at(5));
  assert.deepEqual(watcher.matches(at(6)), []);
  assert.ok(!(world.disk.text ?? "").includes("110000000001"));
  assert.equal(watcher.searches()[0].matches, null);
});

test("a search switched back on within a day alerts only what was listed since, and after a day starts fresh", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  world.list = listOf([{ ...optiplex, switch: "off" }]);
  await watcher.run(at(5));
  world.sent.length = 0;
  world.list = listOf([optiplex]);
  world.found.set("optiplex", [...listings(1, 2), listing(3, { listedAt: at(30).toISOString() })]);
  await watcher.run(at(60));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["3"]);
  world.list = listOf([{ ...optiplex, switch: "off" }]);
  await watcher.run(at(65));
  world.sent.length = 0;
  world.list = listOf([optiplex]);
  await watcher.run(at(65 + 24 * 60 + 60));
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching"]);
});

test("a search taken out of the list is forgotten entirely", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  world.found.set("ram", listings(11));
  await watcher.run(at(0));
  assert.ok((world.disk.text ?? "").includes('"ram"'));
  world.list = listOf([optiplex]);
  await watcher.run(at(5));
  assert.ok(!(world.disk.text ?? "").includes('"ram"'));
  assert.ok(!(world.disk.text ?? "").includes("110000000011"));
  assert.deepEqual(watcher.searches().map((search) => search.id), ["optiplex"]);
  assert.deepEqual(watcher.matches(at(6)).map((group) => group.id), ["optiplex"]);
});

test("when a search is too wide to see every result, an old listing drifting into view doesn't alert but a newly listed one does", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", { listings: listings(1, 2), total: 5000, complete: false });
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", {
    listings: [...listings(1, 2), listing(3, { listedAt: at(-5000).toISOString() }), listing(4, { listedAt: at(10).toISOString() }), listing(5, { listedAt: null })],
    total: 5000,
    complete: false,
  });
  await watcher.run(at(30));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["4"]);
  await watcher.run(at(60));
  assert.equal(world.sent.length, 1);
  assert.equal(watcher.searches()[0].complete, false);
  assert.equal(watcher.searches()[0].total, 5000);
});

test("when every result is seen, an old listing that newly matches does alert, because its price or details changed", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [...listings(1, 2), listing(3, { listedAt: at(-50000).toISOString() })]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["3"]);
});

test("an auction outside its ending window isn't counted as seen, so it alerts once when it comes inside", async () => {
  const { world, watcher } = setup([{ ...optiplex, buying: ["auction"], endingWithinHours: 2 }]);
  const auction = listing(1, { buying: ["AUCTION"], endsAt: at(300).toISOString(), bids: 0 });
  world.found.set("optiplex", [auction]);
  await watcher.run(at(0));
  await watcher.run(at(30));
  await watcher.run(at(150));
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching"]);
  await watcher.run(at(180));
  assert.deepEqual(titles(world.sent), ["Deal watcher: now watching", "Deal: OptiPlex"]);
  assert.ok(world.sent[1].message.includes("ends in 2h 0m"));
  await watcher.run(at(210));
  assert.equal(world.sent.length, 2);
});

test("sandbox mode marks every message as sandbox", async () => {
  const { world, watcher } = setup([optiplex], { sandbox: true });
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6, 7));
  await watcher.run(at(30));
  for (const notification of world.sent) assert.match(notification.title, /sandbox/i);
  assert.equal(world.sent.length, 7);
});

test("matches lists each search's current listings, cheapest first, with only what a page needs", async () => {
  const { world, watcher } = setup([optiplex, ram]);
  world.found.set("optiplex", [listing(2, { postage: 500 }), listing(1, { buying: ["FIXED_PRICE", "BEST_OFFER"], endsAt: at(900).toISOString() })]);
  await watcher.run(at(0));
  assert.deepEqual(brief(watcher.matches(at(1))), [
    {
      id: "optiplex",
      name: "OptiPlex",
      group: null,
      source: "ebay",
      checkedAt: at(0).toISOString(),
      count: 2,
      listings: [
        {
          title: "Dell OptiPlex 7070 SFF number 1",
          price: 9100,
          postage: 0,
          total: 9100,
          condition: "Used",
          buying: ["FIXED_PRICE", "BEST_OFFER"],
          url: "https://www.ebay.co.uk/itm/110000000001",
          listedAt: listing(1).listedAt,
          endsAt: at(900).toISOString(),
          firstSeen: at(0).toISOString(),
        },
        {
          title: "Dell OptiPlex 7070 SFF number 2",
          price: 9200,
          postage: 500,
          total: 9700,
          condition: "Used",
          buying: ["FIXED_PRICE"],
          url: "https://www.ebay.co.uk/itm/110000000002",
          listedAt: listing(2).listedAt,
          endsAt: null,
          firstSeen: at(0).toISOString(),
        },
      ],
    },
    { id: "ram", name: "DDR4 RAM", group: null, source: "ebay", checkedAt: at(0).toISOString(), count: 0, listings: [] },
  ]);
});

test("matches shows the seller's numbers and the item number, but never eBay's own reference", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0", sellerPercent: 87.65, sellerFeedback: 424242 })]);
  await watcher.run(at(0));
  const text = JSON.stringify(watcher.matches(at(1)));
  assert.ok(text.includes("87.65") && text.includes("424242") && text.includes('"id":"110000000001"'));
  assert.ok(!text.includes("v1|"));
});

test("matches shows the 50 cheapest and says how many there are", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", Array.from({ length: 80 }, (_, i) => listing(80 - i)));
  await watcher.run(at(0));
  const [group] = watcher.matches(at(1));
  assert.equal(group.count, 80);
  assert.equal(group.listings.length, 50);
  assert.equal(group.listings[0].total, 9100);
  assert.equal(group.listings[49].total, 14000);
});

test("matches drops anything checked more than six hours ago, so stale prices are never shown", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  assert.equal(watcher.matches(at(360)).length, 1);
  assert.equal(watcher.matches(at(361)).length, 0);
  world.found.set("optiplex", failed("down"));
  await watcher.run(at(400));
  assert.equal(watcher.matches(at(401)).length, 0);
});

test("handing out matches never lets a caller change what the watcher holds", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  const [group] = watcher.matches(at(1));
  group.listings[0].title = "changed";
  group.listings[0].buying.push("AUCTION");
  group.listings.length = 0;
  assert.equal(watcher.matches(at(1))[0].listings[0].title, "Dell OptiPlex 7070 SFF number 1");
  assert.deepEqual(watcher.matches(at(1))[0].listings[0].buying, ["FIXED_PRICE"]);
});

test("searches reports each search's settings and how its last check went", async () => {
  const { world, watcher } = setup([optiplex, { ...ram, switch: "off", everyMinutes: 60 }]);
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(0));
  assert.deepEqual(watcher.searches(), [
    { id: "optiplex", name: "OptiPlex", group: null, on: true, source: "ebay", query: "optiplex 7070 sff", everyMinutes: 30, lastChecked: at(0).toISOString(), watchingSince: at(0).toISOString(), matches: 2, total: 2, complete: true, problem: null, snoozed: false, snoozedUntil: null, alertsToday: 0, alertsPerDay: null, guidePrice: null, hidden: {}, options: null, notes: [] , callsToday: 1, health: [] },
    { id: "ram", name: "DDR4 RAM", group: null, on: false, source: "ebay", query: "ddr4 2x16gb", everyMinutes: 60, lastChecked: null, watchingSince: null, matches: null, total: null, complete: null, problem: null, snoozed: false, snoozedUntil: null, alertsToday: 0, alertsPerDay: null, guidePrice: null, hidden: null, options: null, notes: [] , callsToday: 0, health: [] },
  ]);
});

test("the status starts empty and then counts the day's calls and alerts", async () => {
  const { world, watcher } = setup([optiplex], { limits: { callsPerDay: 500, alertsPerDay: 20 } });
  assert.deepEqual(watcher.status(), { lastRun: null, callsToday: 0, callsPerDay: 1000, alertsToday: 0, alertsPerDay: 60, note: null, problems: [], quiet: null, digest: null });
  assert.deepEqual(watcher.problems(), []);
  assert.deepEqual(watcher.searches(), []);
  assert.deepEqual(watcher.matches(at(0)), []);
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(30));
  assert.deepEqual(watcher.status(), { lastRun: at(30).toISOString(), callsToday: 2, callsPerDay: 500, alertsToday: 2, alertsPerDay: 20, note: null, problems: [], quiet: null, digest: null });
});

test("a search that names a source the watcher doesn't have is reported, not run", async () => {
  const { world } = setup();
  const watcher = createDealWatcher({
    loadSearches: async () => listOf([{ ...optiplex, source: "other" }]),
    sources: {},
    store: world.store,
    notify: async () => undefined,
  });
  const summary = await watcher.run(at(0));
  assert.equal(summary.failed, 1);
  assert.equal(watcher.searches()[0].problem, "it names a source the watcher doesn't have");
});

test("no message the watcher sends ever carries a link that isn't the listing's own", async () => {
  const { world, watcher } = setup([optiplex, ram], { limits: { alertsPerDay: 9 } });
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6, 7, 8));
  world.found.set("ram", listings(11, 12, 13, 14, 15, 16));
  await watcher.run(at(30));
  for (const notification of world.sent) {
    if (notification.click === undefined) continue;
    assert.match(notification.click, /^https:\/\/www\.ebay\.co\.uk\/itm\/[0-9]+$/);
    assert.equal(notification.title.startsWith("Deal: "), true);
  }
  assert.ok(world.sent.some((notification) => notification.click !== undefined));
});

test("a search whose first check couldn't see every result doesn't alert the old ones when a later check sees them all", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", { listings: listings(1, 2), total: 900, complete: false });
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [...listings(1, 2, 3, 4, 5, 6, 7), listing(8, { listedAt: at(10).toISOString() })]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["8"]);
  world.found.set("optiplex", [...listings(1, 2, 3, 4, 5, 6, 7, 8), listing(9, { listedAt: at(-9000).toISOString() })]);
  await watcher.run(at(60));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["8", "9"]);
});

test("the same holds when the first check was cut short by the calls left", async () => {
  const { world, watcher } = setup([optiplex], { limits: { callsPerDay: 1 } });
  world.found.set("optiplex", { listings: listings(1), total: 300, complete: false });
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", listings(1, 2, 3, 4));
  await watcher.run(at(24 * 60));
  assert.equal(world.sent.length, 0);
});

test("a listing that only drifted out of view in a too-wide search doesn't alert again when it drifts back", async () => {
  const { world, watcher } = setup([{ ...optiplex, everyMinutes: 1440 }]);
  const wide = (found: Listing[]) => ({ listings: found, total: 5000, complete: false });
  world.found.set("optiplex", wide(listings(1)));
  await watcher.run(at(0));
  const late = listing(2, { listedAt: at(60).toISOString() });
  world.found.set("optiplex", wide([listing(1), late]));
  await watcher.run(at(1440));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), [undefined, "2"]);
  world.found.set("optiplex", wide(listings(1)));
  for (const day of [2, 3, 4, 5]) await watcher.run(at(day * 1440));
  world.found.set("optiplex", wide([listing(1), late]));
  await watcher.run(at(6 * 1440));
  assert.equal(world.sent.length, 2);
});

test("in memory-only mode, an alert held back by a failed send still comes after a restart", async () => {
  const { world, watcher, restart } = setup([optiplex], { keepSeen: false });
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [listing(1), listing(2, { listedAt: at(10).toISOString() })]);
  world.failNotify = 1;
  await watcher.run(at(30));
  assert.equal(world.sent.length, 0);
  const again = restart();
  await again.run(at(31));
  assert.deepEqual(world.sent.map((notification) => notification.click?.slice(-1)), ["2"]);
  await again.run(at(61));
  assert.equal(world.sent.length, 1);
});

test("in memory-only mode, alerts held back by the daily limit still come after an overnight restart, even if that repeats some", async () => {
  const { world, watcher, restart } = setup([optiplex], { keepSeen: false, limits: { alertsPerDay: 2 } });
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.sent.length = 0;
  const fresh = [3, 4, 5, 6].map((n) => listing(n, { listedAt: at(10).toISOString() }));
  world.found.set("optiplex", [listing(1), ...fresh]);
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent), ["Deal: OptiPlex", "Deal: OptiPlex", "Deal watcher: alerts paused"]);
  world.sent.length = 0;
  const again = restart();
  await again.run(at(20 * 60));
  await again.run(at(44 * 60));
  const alerted = world.sent.map((notification) => notification.click?.slice(-1));
  assert.ok(alerted.includes("5") && alerted.includes("6"), alerted.join(","));
  assert.ok(!alerted.includes("1"));
  assert.equal(alerted.filter((digit) => digit === "5").length, 1);
  assert.equal(alerted.filter((digit) => digit === "6").length, 1);
});

test("when nothing was held back, a memory-only restart repeats nothing", async () => {
  const { world, watcher, restart } = setup([optiplex], { keepSeen: false });
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.found.set("optiplex", [listing(1), listing(2, { listedAt: at(10).toISOString() })]);
  await watcher.run(at(30));
  world.sent.length = 0;
  await restart().run(at(31));
  assert.equal(world.sent.length, 0);
});

test("a price of nothing never counts as a drop, however often it's seen", async () => {
  const { world, watcher } = setup([{ ...optiplex, dropPercent: 10 }]);
  world.found.set("optiplex", [listing(1, { price: 0 })]);
  await watcher.run(at(0));
  world.sent.length = 0;
  for (let tick = 1; tick <= 4; tick++) await watcher.run(at(tick * 30));
  assert.equal(world.sent.length, 0);
});

test("a price falling to nothing from something is still a drop, once", async () => {
  const { world, watcher } = setup([{ ...optiplex, dropPercent: 10 }]);
  world.found.set("optiplex", [listing(1, { price: 5000 })]);
  await watcher.run(at(0));
  world.sent.length = 0;
  world.found.set("optiplex", [listing(1, { price: 0 })]);
  for (let tick = 1; tick <= 3; tick++) await watcher.run(at(tick * 30));
  assert.deepEqual(titles(world.sent), ["Price drop: OptiPlex"]);
});

test("the now-watching message still goes when an earlier search in the run hit the daily limit or a failed send", async () => {
  const { world, watcher } = setup([optiplex], { limits: { alertsPerDay: 1 } });
  await watcher.run(at(0));
  world.sent.length = 0;
  world.list = listOf([optiplex, ram], { alertsPerDay: 1 });
  world.found.set("optiplex", listings(1, 2));
  world.found.set("ram", listings(11));
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent), ["Deal: OptiPlex", "Deal watcher: alerts paused", "Deal watcher: now watching"]);
});

test("a search eBay refuses is a problem straight away, because only an edit fixes it", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", failed("request"));
  await watcher.run(at(0));
  assert.deepEqual(watcher.problems(), [{ code: "deals-source", message: "The deal watcher can't check a search (optiplex): eBay refused the search." }]);
});

test("editing a failing search in the list tries it again at the next run, without waiting out the hour", async () => {
  const { world, watcher } = setup([{ ...optiplex, categoryId: 1 }]);
  world.found.set("optiplex", failed("request"));
  await watcher.run(at(0));
  await watcher.run(at(5));
  assert.equal(world.calls.length, 1);
  world.list = listOf([{ ...optiplex, name: "Renamed only", categoryId: 1 }]);
  await watcher.run(at(10));
  assert.equal(world.calls.length, 1);
  world.list = listOf([{ ...optiplex, categoryId: 179 }]);
  world.found.set("optiplex", listings(1));
  await watcher.run(at(15));
  assert.equal(world.calls.length, 2);
  assert.deepEqual(watcher.problems(), []);
});

test("a list that's broken over midnight doesn't keep yesterday's used-up limit as a problem", async () => {
  const { world, watcher } = setup([{ ...optiplex, everyMinutes: 5 }], { limits: { callsPerDay: 1 } });
  await watcher.run(new Date("2026-11-18T22:00:00.000Z"));
  assert.equal(watcher.problems()[0]?.code, "deals-limit");
  world.list = new Error("it isn't valid JSON");
  await watcher.run(new Date("2026-11-19T00:05:00.000Z"));
  assert.deepEqual(watcher.problems().map((problem) => problem.code), ["deals-list"]);
  assert.equal(watcher.status().callsToday, 0);
});

function fullOf(shown: Listing): FullListing {
  return {
    listing: shown,
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
  };
}

function richSetup(searches: Record<string, unknown>[] = [optiplex], options: { quiet?: unknown; limits?: Record<string, number>; keepSeen?: boolean; digest?: string; digestHealth?: string } = {}) {
  const world = {
    list: readSearches(JSON.stringify({ searches, limits: options.limits, quiet: options.quiet, digest: options.digest, digestHealth: options.digestHealth }), ["ebay"]),
    failSend: false,
    found: new Map<string, Listing[] | SourceError>(),
    sent: [] as Notification[],
    searchCalls: [] as { id: string; maxPages: number }[],
    fullCalls: [] as string[],
    fullReply: null as FullListing | SourceError | Error | null,
    nameCalls: [] as [string, string | null][],
    namesReply: { categoryId: "179", categories: [], details: [{ name: "Form Factor", values: [{ value: "SFF", count: 9 }] }] } as DetailNames | SourceError | Error,
    lookupCalls: [] as string[],
    lookupReply: null as SourceError | null,
    groups: new Map<string, ListingOption[] | SourceError>(),
    groupCalls: [] as string[],
    ...fakeStore(options.keepSeen ?? true),
  };
  const ebay: Source = {
    async search(search, maxPages) {
      world.searchCalls.push({ id: search.id, maxPages });
      const reply = world.found.get(search.id) ?? [];
      if (reply instanceof Error) throw reply;
      return { listings: reply, total: reply.length, complete: true, calls: 1, skipped: 0 };
    },
    async full(ref) {
      world.fullCalls.push(ref);
      if (world.fullReply instanceof Error) throw world.fullReply;
      const shown = [...world.found.values()].flatMap((reply) => (Array.isArray(reply) ? reply : [])).find((entry) => entry.ref === ref);
      return { full: world.fullReply ?? fullOf(shown ?? listing(999)), calls: 1 };
    },
    async options(groupId) {
      world.groupCalls.push(groupId);
      const reply = world.groups.get(groupId) ?? [];
      if (reply instanceof Error) throw reply;
      return { options: reply, calls: 1 };
    },
    async detailNames(query, categoryId) {
      world.nameCalls.push([query, categoryId]);
      if (world.namesReply instanceof Error) throw world.namesReply;
      return { names: world.namesReply, calls: 1 };
    },
    async categories(query) {
      world.lookupCalls.push(`categories ${query}`);
      if (world.lookupReply !== null) throw world.lookupReply;
      return { categories: { categories: [{ id: "170083", name: "Memory (RAM)", path: "Memory (RAM)" }] }, calls: 2 };
    },
    async categoryDetails(categoryId) {
      world.lookupCalls.push(`details ${categoryId}`);
      if (world.lookupReply !== null) throw world.lookupReply;
      return { details: { categoryId, details: [] }, calls: 1 };
    },
  };
  const build = (sources: Record<string, Source> = { ebay }) =>
    createDealWatcher({
      loadSearches: async () => world.list,
      sources,
      store: world.store,
      notify: async (notification) => {
        if (world.failSend) throw new Error("ntfy is down");
        world.sent.push(notification);
      },
    });
  return { world, watcher: build(), restart: build };
}

function auction(n: number, endsInMinutes: number, overrides: Partial<Listing> = {}): Listing {
  return listing(n, { buying: ["AUCTION"], bids: 2, endsAt: at(endsInMinutes).toISOString(), ...overrides });
}

test("each search says how many listings each rule hid at its last check", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, maxPrice: 95, exclude: ["number 3"], avoid: ["faulty"], sellerMinPercent: 99 }]);
  world.found.set("optiplex", [listing(1), listing(2), listing(3), listing(4, { title: "OptiPlex 7070 faulty" }), listing(9), listing(5, { sellerPercent: 90 }), listing(10)]);
  await watcher.run(at(0));
  assert.deepEqual(watcher.searches()[0].hidden, { words: 1, avoid: 1, price: 2, seller: 1 });
  assert.equal(watcher.searches()[0].matches, 2);
  world.found.set("optiplex", [listing(1)]);
  await watcher.run(at(30));
  assert.deepEqual(watcher.searches()[0].hidden, {});
});

test("a search that prefers item details gets one more call than the others, within the calls left", async () => {
  const details = { categoryId: 179, details: { "Form Factor": ["SFF"] } };
  const { world, watcher } = richSetup([{ ...optiplex, ...details }, { ...ram, ...details, detailsMode: "only" }, { id: "plain", name: "Plain", switch: "on", query: "x" }]);
  await watcher.run(at(0));
  assert.deepEqual(world.searchCalls, [{ id: "optiplex", maxPages: 4 }, { id: "ram", maxPages: 3 }, { id: "plain", maxPages: 3 }]);
  const tight = richSetup([{ ...optiplex, ...details }], { limits: { callsPerDay: 2 } });
  await tight.watcher.run(at(0));
  assert.deepEqual(tight.world.searchCalls, [{ id: "optiplex", maxPages: 2 }]);
});

test("when eBay says how long to wait, the watcher waits that long, but never under ten minutes or over a day", async () => {
  const waits: [number | null, number, number][] = [
    [2 * 60 * 60_000, 119, 121],
    [60_000, 9, 11],
    [null, 59, 61],
    [7 * 24 * 60 * 60_000, 24 * 60 - 1, 24 * 60 + 1],
  ];
  for (const [retryAfterMs, stillWaiting, checkedAgain] of waits) {
    const { world, watcher } = richSetup();
    const busy = failed("busy");
    busy.retryAfterMs = retryAfterMs;
    world.found.set("optiplex", busy);
    await watcher.run(at(0));
    world.found.set("optiplex", []);
    await watcher.run(at(stillWaiting));
    assert.equal(world.searchCalls.length, 1, String(retryAfterMs));
    await watcher.run(at(checkedAgain));
    assert.equal(world.searchCalls.length, 2, String(retryAfterMs));
  }
});

test("a wait from eBay only changes the pause for too many requests", async () => {
  const { world, watcher } = richSetup();
  const down = failed("down");
  down.retryAfterMs = 5 * 60 * 60_000;
  world.found.set("optiplex", down);
  await watcher.run(at(0));
  world.found.set("optiplex", []);
  await watcher.run(at(11));
  assert.equal(world.searchCalls.length, 2);
});

test("with a guide price, a great deal goes out at high priority and one over the guide at low", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, guidePrice: 100 }]);
  await watcher.run(at(0));
  world.found.set("optiplex", [listing(1, { price: 7900 }), listing(2, { price: 9000 }), listing(3, { price: 10100 })]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent.slice(1).map((sent) => sent.priority), [4, undefined, 2]);
  assert.ok(world.sent[1].message.includes("21% under your £100.00 guide price."));
});

test("quiet hours follow the clock in London, summer and winter, and may cross midnight", () => {
  const night = { from: 23 * 60, to: 7 * 60, allow: "none" as const };
  const cases: [string, boolean][] = [
    ["2026-11-18T22:59:00.000Z", false],
    ["2026-11-18T23:00:00.000Z", true],
    ["2026-11-19T03:30:00.000Z", true],
    ["2026-11-19T06:59:00.000Z", true],
    ["2026-11-19T07:00:00.000Z", false],
    ["2026-06-18T21:59:00.000Z", false],
    ["2026-06-18T22:00:00.000Z", true],
    ["2026-06-19T05:59:00.000Z", true],
    ["2026-06-19T06:00:00.000Z", false],
  ];
  for (const [time, quiet] of cases) assert.equal(inQuiet(night, new Date(time)), quiet, time);
  const lunch = { from: 12 * 60, to: 13 * 60, allow: "none" as const };
  assert.deepEqual(["2026-11-18T11:59:00.000Z", "2026-11-18T12:00:00.000Z", "2026-11-18T12:59:00.000Z", "2026-11-18T13:00:00.000Z"].map((time) => inQuiet(lunch, new Date(time))), [false, true, true, false]);
  assert.equal(inQuiet(null, new Date("2026-11-19T03:30:00.000Z")), false);
});

test("in quiet hours alerts are held, not lost, and arrive once at the first check after", async () => {
  const { world, watcher } = richSetup([optiplex], { quiet: { from: "12:10", to: "13:00" } });
  await watcher.run(at(0));
  assert.equal(world.sent.length, 1);
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(30));
  assert.equal(world.sent.length, 1);
  assert.deepEqual(watcher.status(at(30)).quiet, { from: "12:10", to: "13:00", allow: "none", now: true });
  await watcher.run(at(60));
  assert.deepEqual(titles(world.sent.slice(1)), ["Deal: OptiPlex", "Deal: OptiPlex"]);
  assert.equal(watcher.status(at(60)).quiet?.now, false);
  await watcher.run(at(90));
  assert.equal(world.sent.length, 3);
});

test("quiet hours that allow great deals let those through and hold the rest", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, guidePrice: 100 }], { quiet: { from: "12:10", to: "13:00", allow: "great" } });
  await watcher.run(at(0));
  world.found.set("optiplex", [listing(1, { price: 7000 }), listing(2, { price: 9500 })]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent.slice(1).map((sent) => [sent.message.split("\n")[0], sent.priority]), [["Dell OptiPlex 7070 SFF number 1", 4]]);
  await watcher.run(at(60));
  assert.deepEqual(world.sent.slice(2).map((sent) => sent.message.split("\n")[0]), ["Dell OptiPlex 7070 SFF number 2"]);
  await watcher.run(at(90));
  assert.equal(world.sent.length, 3);
});

test("quiet hours that allow nothing hold even a great deal", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, guidePrice: 100 }], { quiet: { from: "12:10", to: "13:00" } });
  await watcher.run(at(0));
  world.found.set("optiplex", [listing(1, { price: 5000 })]);
  await watcher.run(at(30));
  assert.equal(world.sent.length, 1);
  await watcher.run(at(60));
  assert.equal(world.sent.length, 2);
});

test("in memory-only mode, alerts held by quiet hours still come after a restart", async () => {
  const { world, watcher, restart } = richSetup([optiplex], { quiet: { from: "12:10", to: "13:00" }, keepSeen: false });
  await watcher.run(at(0));
  world.found.set("optiplex", [listing(1, { listedAt: at(20).toISOString() })]);
  await watcher.run(at(30));
  assert.equal(world.sent.length, 1);
  await restart().run(at(60));
  assert.deepEqual(titles(world.sent.slice(1)), ["Deal: OptiPlex"]);
});

test("a search's own daily limit holds the rest until tomorrow, without a roll-up it has no room for", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, alertsPerDay: 2 }]);
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2, 3, 4, 5));
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent.slice(1)), ["Deal: OptiPlex", "Deal: OptiPlex"]);
  assert.deepEqual([watcher.searches()[0].alertsToday, watcher.searches()[0].alertsPerDay], [2, 2]);
  await watcher.run(at(60));
  assert.equal(world.sent.length, 3);
  await watcher.run(at(24 * 60));
  assert.deepEqual(world.sent.slice(3).map((sent) => sent.message.split("\n")[0]), ["Dell OptiPlex 7070 SFF number 3", "Dell OptiPlex 7070 SFF number 4"]);
  assert.equal(watcher.searches()[0].alertsToday, 2);
});

test("a roll-up counts as one of a search's alerts for the day", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, alertsPerDay: 3 }], { limits: { alertsPerCheck: 2 } });
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6));
  await watcher.run(at(30));
  assert.deepEqual(titles(world.sent.slice(1)), ["Deal: OptiPlex", "Deal: OptiPlex", "Deals: 4 more for OptiPlex"]);
  assert.equal(watcher.searches()[0].alertsToday, 3);
  world.found.set("optiplex", listings(1, 2, 3, 4, 5, 6, 7));
  await watcher.run(at(60));
  assert.equal(world.sent.length, 4);
});

test("one search's daily limit doesn't hold another search back", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, alertsPerDay: 1 }, ram]);
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2));
  world.found.set("ram", listings(11, 12));
  await watcher.run(at(60));
  assert.deepEqual(titles(world.sent.slice(1)), ["Deal: OptiPlex", "Deal: DDR4 RAM", "Deal: DDR4 RAM"]);
  assert.deepEqual(watcher.searches().map((search) => search.alertsToday), [1, 2]);
});

const bidding = { ...optiplex, buying: ["auction"], endingSoonMinutes: 30, everyMinutes: 5 };

test("an auction already seen gets one ending-soon alert when it's inside the window, and never a second", async () => {
  const { world, watcher } = richSetup([bidding]);
  world.found.set("optiplex", [auction(1, 180)]);
  await watcher.run(at(0));
  await watcher.run(at(120));
  assert.equal(world.sent.length, 1);
  await watcher.run(at(150));
  assert.deepEqual(world.sent.slice(1).map((sent) => [sent.title, sent.priority, sent.message.split("\n")[2]]), [["Ending soon: OptiPlex", 4, "Used. Auction, 2 bids so far, ends in 30m."]]);
  await watcher.run(at(175));
  assert.equal(world.sent.length, 2);
});

test("an auction that first appears inside the window gets its normal alert and no ending-soon one", async () => {
  const { world, watcher } = richSetup([bidding]);
  await watcher.run(at(0));
  world.found.set("optiplex", [auction(1, 50)]);
  await watcher.run(at(30));
  await watcher.run(at(40));
  assert.deepEqual(titles(world.sent.slice(1)), ["Deal: OptiPlex"]);
});

test("no ending-soon alert for an auction inside the window at the first check, one that has ended, or a buy-it-now listing", async () => {
  const { world, watcher } = richSetup([{ ...bidding, buying: ["auction", "buy it now"] }]);
  world.found.set("optiplex", [auction(1, 20), auction(2, 45), listing(3, { endsAt: at(45).toISOString() }), auction(4, 45, { buying: ["AUCTION", "FIXED_PRICE"] })]);
  await watcher.run(at(0));
  await watcher.run(at(30));
  assert.deepEqual(world.sent.slice(1).map((sent) => sent.message.split("\n")[0]), ["Dell OptiPlex 7070 SFF number 2"]);
  await watcher.run(at(50));
  assert.equal(world.sent.length, 2);
});

test("the ending-soon mark survives a restart when seen listings are kept on disk", async () => {
  const { world, watcher, restart } = richSetup([bidding]);
  world.found.set("optiplex", [auction(1, 180)]);
  await watcher.run(at(0));
  await watcher.run(at(155));
  assert.equal(world.sent.length, 2);
  await restart().run(at(170));
  assert.equal(world.sent.length, 2);
});

test("a search without endingSoonMinutes never sends an ending-soon alert", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, buying: ["auction"] }]);
  world.found.set("optiplex", [auction(1, 40)]);
  await watcher.run(at(0));
  await watcher.run(at(30));
  assert.equal(world.sent.length, 1);
});

test("a snoozed search isn't checked, even by Check now, until its time is up", async () => {
  const { world, watcher } = richSetup([optiplex, ram]);
  await watcher.run(at(0));
  assert.equal(await watcher.snooze("optiplex", at(120)), true);
  assert.deepEqual(watcher.searches().map((search) => [search.id, search.snoozed, search.snoozedUntil]), [["optiplex", true, at(120).toISOString()], ["ram", false, null]]);
  world.searchCalls.length = 0;
  await watcher.run(at(60));
  await watcher.run(at(90), true);
  assert.deepEqual(world.searchCalls.map((call) => call.id), ["ram", "ram"]);
  await watcher.run(at(120));
  assert.deepEqual(world.searchCalls.map((call) => call.id).filter((id) => id === "optiplex"), ["optiplex"]);
  assert.equal(watcher.searches()[0].snoozed, false);
});

test("a search snoozed until woken stays snoozed across a restart, and waking it brings it back", async () => {
  const { world, watcher, restart } = richSetup();
  await watcher.run(at(0));
  assert.equal(await watcher.snooze("optiplex", null), true);
  const again = restart();
  world.searchCalls.length = 0;
  await again.run(at(600));
  assert.equal(world.searchCalls.length, 0);
  assert.deepEqual([again.searches()[0].snoozed, again.searches()[0].snoozedUntil], [true, null]);
  assert.equal(await again.wake("optiplex"), true);
  await again.run(at(601));
  assert.equal(world.searchCalls.length, 1);
});

test("snoozing works before the first check, saves straight away, and refuses a search that isn't in the list", async () => {
  const { world, watcher } = richSetup();
  assert.equal(await watcher.snooze("nope", at(60)), false);
  assert.equal(await watcher.wake("nope"), false);
  assert.equal(world.disk.saves, 0);
  assert.equal(await watcher.snooze("optiplex", at(60)), true);
  assert.equal(world.disk.saves, 1);
  assert.ok(world.disk.text?.includes(at(60).toISOString()));
  await watcher.run(at(0));
  assert.equal(world.searchCalls.length, 0);
});

test("a snooze for a search that's been removed from the list is forgotten", async () => {
  const { world, watcher } = richSetup([optiplex, ram]);
  await watcher.snooze("ram", null);
  world.list = readSearches(JSON.stringify({ searches: [optiplex] }), ["ebay"]);
  await watcher.run(at(0));
  assert.ok(!world.disk.text?.includes("snoozed"));
});

test("a snooze that can't be saved shows as the state problem, and clears when a save works", async () => {
  const { world, watcher } = richSetup();
  world.disk.failSave = true;
  assert.equal(await watcher.snooze("optiplex", null), true);
  assert.deepEqual(watcher.problems().map((problem) => problem.code), ["deals-state"]);
  world.disk.failSave = false;
  await watcher.wake("optiplex");
  assert.deepEqual(watcher.problems(), []);
});

test("matches says where each listing stands, how it compares with the guide price unless its option's price isn't known, and what to check first", async () => {
  const { world, watcher } = richSetup([{ ...ram, guidePrice: 50, unit: "GB" }]);
  world.found.set("ram", [
    listing(1, { title: "Corsair 32GB (2x16GB) DDR4", price: 3500, postage: 500, sellerType: "private", city: "Sometown", postcode: "ZZ9***", summary: "Tested", topRated: true }),
    listing(2, { title: "Kingston 32GB DDR4", price: 5500, postage: null, sellerFeedback: 2, variations: true, detailsMatch: true }),
  ]);
  await watcher.run(at(0));
  const [group] = watcher.matches(at(1));
  assert.equal(group.guidePrice, 5000);
  const [first, second] = group.listings;
  assert.deepEqual(
    { place: first.place, underGuide: first.underGuide, great: first.great, perUnit: first.perUnit, cautions: first.cautions, sellerType: first.sellerType, city: first.city, postcode: first.postcode, summary: first.summary, topRated: first.topRated },
    { place: 1, underGuide: 20, great: true, perUnit: { unit: "GB", amount: 32, pence: 125 }, cautions: [], sellerType: "private", city: "Sometown", postcode: "ZZ9***", summary: "Tested", topRated: true },
  );
  assert.deepEqual(
    { place: second.place, underGuide: second.underGuide, perUnit: second.perUnit, great: second.great, cautions: second.cautions, variations: second.variations, detailsMatch: second.detailsMatch },
    { place: 2, underGuide: null, perUnit: null, great: false, cautions: ["the seller has under 10 ratings", "the listing has more than one option, so this may be its lowest price", "postage isn't shown, so it may be collection only"], variations: true, detailsMatch: true },
  );
});

test("a listing among the current matches can be read in full, once, and again only after half an hour", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, guidePrice: 120 }]);
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0" }), listing(2, { id: "110000000002", ref: "v1|110000000002|0" })]);
  await watcher.run(at(0));
  const before = watcher.status().callsToday;
  const reply = await watcher.full("110000000001", at(1));
  assert.equal(reply.status, "ok");
  if (reply.status !== "ok") return;
  assert.deepEqual([reply.searchId, reply.searchName, reply.fetchedAt, reply.listing.id, reply.listing.place, reply.listing.underGuide], ["optiplex", "OptiPlex", at(1).toISOString(), "110000000001", 1, 24]);
  assert.deepEqual([reply.full.description, reply.full.specifics, reply.full.returns], ["Tested and working.", [{ name: "RAM Size", value: "16 GB" }], { accepted: true, days: 30, paidBy: "buyer" }]);
  assert.ok(!Object.hasOwn(reply.full, "listing"));
  assert.ok(!JSON.stringify(reply).includes("v1|"));
  await watcher.full("110000000001", at(20));
  assert.deepEqual(world.fullCalls, ["v1|110000000001|0"]);
  assert.equal(watcher.status().callsToday, before + 1);
  const later = await watcher.full("110000000001", at(32));
  assert.equal(world.fullCalls.length, 2);
  assert.equal(later.status === "ok" && later.fetchedAt, at(32).toISOString());
  assert.equal(watcher.status().callsToday, before + 2);
});

test("the full listing shows eBay's latest price for it, measured against the other matches", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, guidePrice: 100 }]);
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0", price: 9000 }), listing(2, { id: "110000000002", price: 8000 })]);
  await watcher.run(at(0));
  world.fullReply = fullOf(listing(1, { id: "v1-odd-id", url: "https://evil.example/x", price: 7000 }));
  const reply = await watcher.full("110000000001", at(1));
  assert.equal(reply.status, "ok");
  if (reply.status !== "ok") return;
  assert.deepEqual([reply.listing.id, reply.listing.url, reply.listing.price, reply.listing.place, reply.listing.underGuide, reply.listing.great], ["110000000001", "https://www.ebay.co.uk/itm/110000000001", 7000, 1, 30, true]);
});

test("only a listing among the fresh matches of a switched-on search can be read in full", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, maxPrice: 100 }]);
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0" }), listing(20, { id: "110000000020", ref: "v1|110000000020|0" })]);
  assert.deepEqual(await watcher.full("110000000001", at(0)), { status: "unknown" });
  await watcher.run(at(0));
  for (const id of ["110000000020", "999", "v1|110000000001|0", "", "__proto__"]) assert.deepEqual(await watcher.full(id, at(1)), { status: "unknown" }, id);
  assert.deepEqual(await watcher.full("110000000001", at(6 * 60 + 1)), { status: "unknown" });
  assert.equal(world.fullCalls.length, 0);
});

test("a listing that has gone, or one eBay won't give, is reported and its call still counted", async () => {
  const { world, watcher } = richSetup();
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0" }), listing(2, { id: "110000000002" })]);
  await watcher.run(at(0));
  const before = watcher.status().callsToday;
  world.fullReply = failed("gone");
  assert.deepEqual(await watcher.full("110000000001", at(1)), { status: "failed", message: "eBay says that listing has gone", gone: true });
  world.fullReply = new Error("boom");
  assert.deepEqual(await watcher.full("110000000001", at(2)), { status: "failed", message: "the check stopped unexpectedly", gone: false });
  world.fullReply = failed("request");
  assert.deepEqual(await watcher.full("110000000001", at(3)), { status: "failed", message: "eBay refused the search", gone: false });
  assert.equal(watcher.status().callsToday, before + 3);
  assert.deepEqual(await watcher.full("110000000002", at(4)), { status: "failed", message: "this listing can't be read in full", gone: false });
  assert.equal(world.fullCalls.length, 3);
});

test("once the day's calls are used, nothing more is read in full or looked up", async () => {
  const { world, watcher } = richSetup([optiplex], { limits: { callsPerDay: 2 } });
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0" }), listing(2, { id: "110000000002", ref: "v1|110000000002|0" })]);
  await watcher.run(at(0));
  assert.equal((await watcher.full("110000000001", at(1))).status, "ok");
  assert.deepEqual(await watcher.full("110000000002", at(2)), { status: "limit" });
  assert.deepEqual(await watcher.detailNames("ebay", "optiplex", null), { status: "limit" });
  assert.equal((await watcher.full("110000000001", at(3))).status, "ok");
  assert.deepEqual([world.fullCalls.length, world.nameCalls.length], [1, 0]);
});

test("a query's item details can be looked up, and the call counts even before the first check", async () => {
  const { world, watcher } = richSetup();
  assert.deepEqual(await watcher.detailNames("ebay", "optiplex 7070", "179", at(0)), { status: "ok", names: { categoryId: "179", categories: [], details: [{ name: "Form Factor", values: [{ value: "SFF", count: 9 }] }] } });
  assert.deepEqual(world.nameCalls, [["optiplex 7070", "179"]]);
  world.namesReply = failed("request", 1);
  assert.deepEqual(await watcher.detailNames("ebay", "ddr4", null, at(0)), { status: "failed", message: "eBay refused the search" });
  world.namesReply = new Error("boom");
  assert.deepEqual(await watcher.detailNames("ebay", "ddr4", null, at(0)), { status: "failed", message: "the check stopped unexpectedly" });
  assert.deepEqual(await watcher.detailNames("other", "ddr4", null, at(0)), { status: "failed", message: "that source can't list item details" });
  await watcher.run(at(0));
  assert.equal(watcher.status().callsToday, 4);
});

test("a source that can only search still works, and says it can't do the rest", async () => {
  const { world, restart } = richSetup();
  const plain: Source = { search: async () => ({ listings: [listing(1, { id: "110000000001", ref: "v1|110000000001|0" })], total: 1, complete: true, calls: 1, skipped: 0 }) };
  const watcher = restart({ ebay: plain });
  await watcher.run(at(0));
  assert.deepEqual(await watcher.full("110000000001", at(1)), { status: "failed", message: "this listing can't be read in full", gone: false });
  assert.deepEqual(await watcher.detailNames("ebay", "x", null), { status: "failed", message: "that source can't list item details" });
  assert.equal(world.sent.length, 1);
});

test("a new day clears each search's count of alerts", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, alertsPerDay: 5 }]);
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(30));
  assert.equal(watcher.searches()[0].alertsToday, 2);
  await watcher.run(at(24 * 60));
  assert.equal(watcher.searches()[0].alertsToday, 0);
  assert.ok(!world.disk.text?.includes("alertsToday"));
});

test("an auction that eBay still lists after its end time gets no ending-soon alert", async () => {
  const { world, watcher } = richSetup([bidding]);
  world.found.set("optiplex", [auction(1, 100)]);
  await watcher.run(at(0));
  await watcher.run(at(240));
  assert.equal(world.sent.length, 1);
});

test("an auction's low opening bid isn't a great deal: it goes out at the default priority and waits for quiet hours to end", async () => {
  const both = { ...optiplex, buying: ["auction", "buy it now"], guidePrice: 120 };
  const { world, watcher } = richSetup([both], { quiet: { from: "12:10", to: "13:00", allow: "great" } });
  await watcher.run(at(0));
  world.found.set("optiplex", [auction(1, 6 * 24 * 60, { price: 99 }), listing(2, { price: 9000 })]);
  await watcher.run(at(30));
  assert.deepEqual(world.sent.slice(1).map((sent) => [sent.message.split("\n")[0], sent.priority]), [["Dell OptiPlex 7070 SFF number 2", 4]]);
  await watcher.run(at(60));
  assert.deepEqual(world.sent.slice(2).map((sent) => [sent.message.split("\n")[0], sent.priority]), [["Dell OptiPlex 7070 SFF number 1", undefined]]);
  const [group] = watcher.matches(at(61));
  assert.deepEqual(group.listings.map((shown) => [shown.price, shown.great, shown.underGuide]), [[99, false, null], [9000, true, 25]]);
});

test("a wait of more than an hour from eBay is reported straight away, and a shorter one only after three tries", async () => {
  const long = richSetup([optiplex, ram]);
  const busy = failed("busy");
  busy.retryAfterMs = 6 * 60 * 60_000;
  long.world.found.set("optiplex", busy);
  await long.watcher.run(at(0));
  assert.deepEqual(long.watcher.problems(), [{ code: "deals-source", message: "The deal watcher can't check its searches: eBay says too many requests." }]);
  long.world.found.set("optiplex", []);
  await long.watcher.run(at(6 * 60 + 1));
  assert.deepEqual(long.watcher.problems(), []);

  const short = richSetup();
  const brief = failed("busy");
  brief.retryAfterMs = 20 * 60_000;
  short.world.found.set("optiplex", brief);
  await short.watcher.run(at(0));
  assert.deepEqual(short.watcher.problems(), []);
});

test("while eBay has asked for a wait, nothing is read in full or looked up either", async () => {
  const { world, watcher } = richSetup([optiplex, ram]);
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0" })]);
  await watcher.run(at(0));
  const busy = failed("busy");
  busy.retryAfterMs = 3 * 60 * 60_000;
  world.found.set("ram", busy);
  await watcher.run(at(60));
  assert.deepEqual(await watcher.full("110000000001", at(61)), { status: "waiting" });
  assert.deepEqual(await watcher.detailNames("ebay", "ddr4", null, at(61)), { status: "waiting" });
  assert.deepEqual([world.fullCalls.length, world.nameCalls.length], [0, 0]);
  assert.equal((await watcher.full("110000000001", at(60 + 181))).status, "ok");
});

test("a read that eBay answers with too many requests makes the searches wait too", async () => {
  const { world, watcher } = richSetup();
  world.found.set("optiplex", [listing(1, { id: "110000000001", ref: "v1|110000000001|0" })]);
  await watcher.run(at(0));
  const busy = failed("busy");
  busy.retryAfterMs = 2 * 60 * 60_000;
  world.fullReply = busy;
  assert.deepEqual(await watcher.full("110000000001", at(1)), { status: "failed", message: "eBay says too many requests", gone: false });
  world.searchCalls.length = 0;
  await watcher.run(at(60));
  assert.equal(world.searchCalls.length, 0);
  await watcher.run(at(122));
  assert.equal(world.searchCalls.length, 1);
});

test("asking for the same listing several times at once makes one call, and the day's limit holds under a rush", async () => {
  const { world, watcher } = richSetup([optiplex], { limits: { callsPerDay: 3 } });
  world.found.set("optiplex", [1, 2, 3, 4, 5, 6].map((n) => listing(n, { id: String(110000000000 + n), ref: `v1|${110000000000 + n}|0` })));
  await watcher.run(at(0));
  const same = await Promise.all(Array.from({ length: 8 }, () => watcher.full("110000000001", at(1))));
  assert.deepEqual([...new Set(same.map((reply) => reply.status))], ["ok"]);
  assert.equal(world.fullCalls.length, 1);
  const rush = await Promise.all([2, 3, 4, 5, 6].map((n) => watcher.full(String(110000000000 + n), at(2))));
  assert.deepEqual(rush.map((reply) => reply.status), ["ok", "limit", "limit", "limit", "limit"]);
  assert.equal(world.fullCalls.length, 2);
  assert.equal(watcher.status().callsToday, 3);
});

test("at most 150 listings are read in full or looked up in a day, whatever the call limit", async () => {
  const { world, watcher } = richSetup();
  world.found.set("optiplex", Array.from({ length: 160 }, (_, i) => listing(i + 1, { id: String(110000000001 + i), ref: `v1|${110000000001 + i}|0` })));
  await watcher.run(at(0));
  const replies = [];
  for (let i = 0; i < 152; i++) replies.push((await watcher.full(String(110000000001 + i), at(1))).status);
  assert.deepEqual([replies.filter((status) => status === "ok").length, replies.slice(150)], [150, ["limit", "limit"]]);
  assert.deepEqual(await watcher.detailNames("ebay", "ddr4", null, at(2)), { status: "limit" });
  assert.equal((await watcher.full("110000000150", at(3))).status, "ok");
  assert.equal(world.fullCalls.length, 150);
  world.found.set("optiplex", Array.from({ length: 160 }, (_, i) => listing(i + 1, { id: String(110000000001 + i), ref: `v1|${110000000001 + i}|0` })));
  await watcher.run(at(24 * 60));
  assert.equal((await watcher.full("110000000155", at(24 * 60 + 1))).status, "ok");
});

test("ending-soon alerts go out soonest first, one each, never inside a roll-up, and the rest follow at the next check", async () => {
  const { world, watcher } = richSetup([bidding], { limits: { alertsPerCheck: 1 } });
  world.found.set("optiplex", [auction(1, 200), auction(2, 190), auction(3, 195)]);
  await watcher.run(at(0));
  const sentAt = async (minutes: number) => {
    const before = world.sent.length;
    await watcher.run(at(minutes));
    return world.sent.slice(before).map((sent) => `${sent.title} / ${sent.message.split("\n")[0].slice(-8)}`);
  };
  assert.deepEqual(await sentAt(175), ["Ending soon: OptiPlex / number 2"]);
  assert.deepEqual(await sentAt(180), ["Ending soon: OptiPlex / number 3"]);
  assert.deepEqual(await sentAt(185), ["Ending soon: OptiPlex / number 1"]);
  assert.deepEqual(await sentAt(189), []);
});

test("an ending-soon alert held by quiet hours or the search's daily limit is kept for the next check, not marked as sent", async () => {
  const quiet = richSetup([bidding], { quiet: { from: "12:10", to: "13:00" } });
  quiet.world.found.set("optiplex", [auction(1, 80)]);
  await quiet.watcher.run(at(0));
  await quiet.watcher.run(at(55));
  assert.equal(quiet.world.sent.length, 1);
  await quiet.watcher.run(at(60));
  assert.deepEqual(titles(quiet.world.sent.slice(1)), ["Ending soon: OptiPlex"]);

  const limited = richSetup([{ ...bidding, alertsPerDay: 1 }]);
  await limited.watcher.run(at(0));
  limited.world.found.set("optiplex", [auction(1, 200), auction(2, 11 * 60 + 45)]);
  await limited.watcher.run(at(5));
  assert.deepEqual(titles(limited.world.sent.slice(1)), ["Deal: OptiPlex"]);
  await limited.watcher.run(at(175));
  assert.equal(limited.world.sent.length, 2);
  limited.world.found.set("optiplex", [auction(2, 11 * 60 + 45)]);
  await limited.watcher.run(at(12 * 60 + 5));
  assert.deepEqual(titles(limited.world.sent.slice(2)), ["Deal: OptiPlex"]);
});

test("the now-watching message still comes in quiet hours, silently", async () => {
  const { world, watcher } = richSetup([optiplex], { quiet: { from: "11:00", to: "13:00" } });
  await watcher.run(at(0));
  assert.deepEqual(world.sent.map((sent) => [sent.title, sent.priority]), [["Deal watcher: now watching", 2]]);
  const loud = richSetup();
  await loud.watcher.run(at(0));
  assert.ok(!Object.hasOwn(loud.world.sent[0], "priority"));
});

test("snoozing a search clears its old failure, so it stops showing as a problem", async () => {
  const { world, watcher } = richSetup();
  world.found.set("optiplex", failed("request"));
  await watcher.run(at(0));
  assert.equal(watcher.problems().length, 1);
  await watcher.snooze("optiplex", null);
  assert.deepEqual(watcher.problems(), []);
  await watcher.run(at(600));
  assert.deepEqual([watcher.problems(), watcher.searches()[0].problem], [[], null]);
});

test("matches can be asked for fewer listings per search, never more than fifty", async () => {
  const { world, watcher } = richSetup();
  world.found.set("optiplex", Array.from({ length: 60 }, (_, i) => listing(i + 1)));
  await watcher.run(at(0));
  assert.deepEqual([15, undefined, 500].map((most) => [watcher.matches(at(1), most)[0].listings.length, watcher.matches(at(1), most)[0].count]), [[15, 60], [50, 60], [50, 60]]);
});

test("a damaged state file's note isn't lost when a snooze and the first check load it at the same moment", async () => {
  const { world, restart } = richSetup();
  let loads = 0;
  const slow = { ...world.store, load: async () => ({ memory: emptyMemory(), note: ++loads === 1 ? "The deal watcher's state file was damaged, so every search started fresh." : null }) };
  const watcher = createDealWatcher({ loadSearches: async () => world.list, sources: {}, store: slow, notify: async () => undefined });
  await Promise.all([watcher.snooze("optiplex", null), watcher.run(at(0))]);
  assert.deepEqual([loads, watcher.status().note], [1, "The deal watcher's state file was damaged, so every search started fresh."]);
  assert.equal(typeof restart, "function");
});

test("an ending-soon alert counts towards the search's daily limit, so a new listing in the same check waits", async () => {
  const { world, watcher } = richSetup([{ ...bidding, alertsPerDay: 1 }]);
  world.found.set("optiplex", [auction(1, 100)]);
  await watcher.run(at(0));
  world.found.set("optiplex", [auction(1, 100), auction(2, 600)]);
  await watcher.run(at(75));
  assert.deepEqual(titles(world.sent.slice(1)), ["Ending soon: OptiPlex"]);
  assert.equal(watcher.searches()[0].alertsToday, 1);
});
test("categories and a category's item details are looked up through the source, counting their calls against the day", async () => {
  const { world, watcher } = richSetup();
  assert.deepEqual(await watcher.categories("ebay", "ddr4", at(0)), { status: "ok", value: { categories: [{ id: "170083", name: "Memory (RAM)", path: "Memory (RAM)" }] } });
  assert.deepEqual(await watcher.categoryDetails("ebay", "170083", at(0)), { status: "ok", value: { categoryId: "170083", details: [] } });
  world.lookupReply = failed("request", 1);
  assert.deepEqual(await watcher.categories("ebay", "ddr4", at(0)), { status: "failed", message: "eBay refused the search" });
  assert.deepEqual(await watcher.categoryDetails("ebay", "1", at(0)), { status: "failed", message: "eBay refused the search" });
  assert.deepEqual(await watcher.categories("other", "ddr4", at(0)), { status: "failed", message: "that source can't suggest categories" });
  assert.deepEqual(await watcher.categoryDetails("other", "1", at(0)), { status: "failed", message: "that source can't list a category's item details" });
  assert.deepEqual(world.lookupCalls, ["categories ddr4", "details 170083", "categories ddr4", "details 1"]);
  await watcher.run(at(0));
  assert.equal(watcher.status().callsToday, 6);
});

test("category lookups stop when the day's calls are used or eBay asked to wait", async () => {
  const { world, watcher } = richSetup([optiplex], { limits: { callsPerDay: 1 } });
  await watcher.run(at(0));
  assert.deepEqual(await watcher.categories("ebay", "ddr4", at(1)), { status: "limit" });
  assert.deepEqual(await watcher.categoryDetails("ebay", "170083", at(1)), { status: "limit" });
  assert.deepEqual(world.lookupCalls, []);
  const { world: second, watcher: other } = richSetup();
  second.lookupReply = failed("busy", 1);
  assert.deepEqual(await other.categories("ebay", "ddr4", at(0)), { status: "failed", message: "eBay says too many requests" });
  assert.deepEqual(await other.categoryDetails("ebay", "170083", at(1)), { status: "waiting" });
});

test("once the day's eBay calls are used, a source that uses none is still checked", async () => {
  const checked: string[] = [];
  const spender: Source = {
    search: async (search) => {
      checked.push(search.id);
      return { listings: [], total: 0, complete: true, calls: 1, skipped: 0 };
    },
  };
  const free: Source = { ...spender, noCalls: true, search: async (search, pages) => ({ ...(await spender.search(search, pages)), calls: 0 }) };
  const list = readSearches(
    JSON.stringify({
      limits: { callsPerDay: 1 },
      searches: [
        { id: "first", name: "First", switch: "on", query: "a" },
        { id: "second", name: "Second", switch: "on", query: "b" },
        { id: "feed", name: "Feed", switch: "on", source: "free", query: "c" },
      ],
    }),
    ["ebay", "free"],
  );
  const watcher = createDealWatcher({
    loadSearches: async () => list,
    sources: { ebay: spender, free },
    store: { load: async () => ({ memory: emptyMemory(), note: null }), save: async () => undefined },
    notify: async () => undefined,
  });
  await watcher.run(at(0));
  assert.deepEqual(checked, ["first", "feed"]);
  assert.equal(watcher.status().callsToday, 1);
});

test("a search that hides item details gets one more page for each, and what they hide is counted under details", async () => {
  const ram = { id: "ram", name: "RAM", switch: "on", query: "ddr4", categoryId: 170083, hideDetails: { "Form Factor": ["SO-DIMM"], "Features": ["Registered"] } };
  const { world, watcher } = richSetup([ram]);
  world.found.set("ram", [listing(1, { id: "110000000001" }), listing(2, { id: "110000000002", hiddenDetail: "Form Factor" })]);
  await watcher.run(at(0));
  assert.deepEqual(world.searchCalls, [{ id: "ram", maxPages: 9 }]);
  const status = watcher.searches()[0];
  assert.equal(status.matches, 1);
  assert.equal(status.hidden?.details, 1);
});

test("matches can keep only some listings, counting what was kept and still placing each among all the matches", async () => {
  const { world, watcher } = richSetup();
  world.found.set("optiplex", [listing(1, { id: "110000000001", title: "OptiPlex 7070 i5", price: 9000 }), listing(2, { id: "110000000002", title: "OptiPlex 7070 i7", price: 12000 }), listing(3, { id: "110000000003", title: "OptiPlex 7070 i7 32GB", price: 15000 })]);
  await watcher.run(at(0));
  const [group] = watcher.matches(at(1), 1, (kept) => kept.title.includes("i7"));
  assert.deepEqual([group.count, group.listings.map((kept) => kept.id), group.listings[0].place], [2, ["110000000002"], 2]);
  assert.equal(watcher.matches(at(1))[0].count, 3);
});

const drive = { id: "drive", name: "4TB drive", switch: "on", query: "4tb nas hard drive", mustInclude: ["4tb"], maxWithPostage: 60, guidePrice: 70, unit: "TB", readOptions: true };

function sizes(group: string, ...priced: [string, number, boolean?][]): ListingOption[] {
  return priced.map(([size, price, inStock], n) => ({ ref: `v1|${group}|${n + 1}`, price, text: `Storage Capacity: ${size}`, inStock: inStock ?? true }));
}

function grouped(n: number, group: string, overrides: Partial<Listing> = {}): Listing {
  return listing(n, { id: `11000000000${n}`, title: `Seagate IronWolf NAS hard drive 1TB 2TB 4TB number ${n}`, price: 1500, postage: 0, variations: true, groupId: group, ref: `v1|${group}|0`, ...overrides });
}

test("with readOptions on, a listing with options is matched, alerted and shown at the price of the option that fits the search", async () => {
  const { world, watcher } = richSetup([drive]);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800], ["8 TB", 9900]));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201"]);
  assert.equal(watcher.status().callsToday, 2);
  const [shown] = watcher.matches(at(1))[0].listings;
  assert.deepEqual([shown.price, shown.total, shown.option, shown.variations, shown.great, shown.perUnit], [4800, 4800, "Storage Capacity: 4 TB", true, true, { unit: "TB", amount: 4, pence: 1200 }]);
  assert.deepEqual(shown.cautions, ["the listing has more than one option, and this is the price of Storage Capacity: 4 TB"]);
  world.groups.set("202", sizes("202", ["2 TB", 2000], ["4 TB", 4000]));
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202")]);
  await watcher.run(at(31));
  assert.deepEqual(world.groupCalls, ["201", "202"]);
  const alert = world.sent.at(-1);
  assert.deepEqual([alert?.title, alert?.priority], ["Deal: 4TB drive", 4]);
  assert.match(alert?.message ?? "", /£40\.00/);
  assert.match(alert?.message ?? "", /About £10\.00 per TB \(4 TB, read from the option\)\./);
  assert.match(alert?.message ?? "", /this is the price of Storage Capacity: 4 TB/);
});

test("with readOptions off, no item group is read and the listing keeps eBay's cheapest price", async () => {
  const { world, watcher } = richSetup([{ ...drive, readOptions: false }]);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, []);
  const [shown] = watcher.matches(at(1))[0].listings;
  assert.deepEqual([shown.price, shown.option, shown.perUnit], [1500, null, null]);
});

test("a listing whose options don't fit stays at eBay's price, and listings that fail other checks, or have no group number, aren't read", async () => {
  const { world, watcher } = richSetup([{ ...drive, exclude: ["sas"] }]);
  world.groups.set("201", sizes("201", ["1 TB", 1500, false], ["4 TB", 4800, false]));
  world.groups.set("202", sizes("202", ["4 TB", 9000]));
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202"), grouped(3, "203", { title: "SAS drive 4TB 1TB" }), grouped(4, "204", { price: 7000 }), listing(5, { title: "4TB drive 1TB 2TB", price: 1500, variations: true })]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201", "202"]);
  assert.deepEqual(watcher.searches()[0].hidden, { price: 2, words: 1 });
  assert.deepEqual(watcher.matches(at(1))[0].listings.map((shown) => [shown.id, shown.price, shown.option]), [["110000000001", 1500, null], ["v1|110000000005|0", 1500, null]]);
});

test("each check reads at most 10 item groups, and the rest are read at the next check", async () => {
  const { world, watcher } = richSetup([drive]);
  const many = Array.from({ length: 12 }, (_, i) => grouped(i + 1, String(300 + i)));
  for (let i = 0; i < 12; i++) world.groups.set(String(300 + i), sizes(String(300 + i), ["4 TB", 4000 + i]));
  world.found.set("drive", many);
  await watcher.run(at(0));
  assert.equal(world.groupCalls.length, 10);
  assert.equal(watcher.status().callsToday, 11);
  assert.deepEqual(watcher.matches(at(1))[0].listings.filter((shown) => shown.option === null).map((shown) => shown.id), ["1100000000011", "1100000000012"]);
  await watcher.run(at(31));
  assert.deepEqual(world.groupCalls.slice(10), ["310", "311"]);
  assert.equal(watcher.matches(at(32))[0].listings.every((shown) => shown.option === "Storage Capacity: 4 TB"), true);
});

test("an item group is read again only after six hours or when the listing's price changes", async () => {
  const { world, watcher } = richSetup([drive]);
  world.groups.set("201", sizes("201", ["4 TB", 4800]));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(0));
  await watcher.run(at(31));
  await watcher.run(at(62));
  assert.equal(world.groupCalls.length, 1);
  world.found.set("drive", [grouped(1, "201", { price: 1400 })]);
  await watcher.run(at(93));
  assert.equal(world.groupCalls.length, 2);
  await watcher.run(at(93 + 5 * 60 + 30));
  assert.equal(world.groupCalls.length, 2);
  await watcher.run(at(93 + 6 * 60 + 1));
  assert.equal(world.groupCalls.length, 3);
});

test("up to 1,000 listings' options are kept, the oldest read going first", async () => {
  const other = { ...drive, id: "drive-2", name: "Another 4TB drive", everyMinutes: 5 };
  const { world, watcher } = richSetup([{ ...drive, everyMinutes: 5 }, other], { limits: { callsPerDay: 5000 } });
  world.found.set("drive", Array.from({ length: 505 }, (_, i) => grouped(i + 1, String(5000 + i))));
  world.found.set("drive-2", Array.from({ length: 505 }, (_, i) => grouped(i + 1001, String(7000 + i))));
  for (let check = 0; check < 51; check++) await watcher.run(at(check * 5));
  assert.equal(world.groupCalls.length, 1010);
  await watcher.run(at(51 * 5));
  assert.deepEqual(world.groupCalls.slice(1010, 1020), ["5000", "5001", "5002", "5003", "5004", "5005", "5006", "5007", "5008", "5009"]);
});

test("a group that has gone or can't be read isn't asked for again soon, and doesn't stop the others being read", async () => {
  const { world, watcher } = richSetup([drive]);
  world.groups.set("201", failed("gone"));
  world.groups.set("202", failed("reply"));
  world.groups.set("203", sizes("203", ["4 TB", 4800]));
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202"), grouped(3, "203")]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201", "202", "203"]);
  assert.equal(watcher.status().callsToday, 4);
  assert.deepEqual(watcher.matches(at(1))[0].listings.map((shown) => [shown.id, shown.price, shown.option]), [["110000000001", 1500, null], ["110000000002", 1500, null], ["110000000003", 4800, "Storage Capacity: 4 TB"]]);
  assert.deepEqual(watcher.status().problems, []);
  await watcher.run(at(31));
  assert.deepEqual(world.groupCalls, ["201", "202", "203"]);
});

test("a busy or refusing eBay stops options being read for a while, but not the searches, and a refusal is shown as a problem", async () => {
  const { world, watcher } = richSetup([drive, { ...drive, id: "drive-2", name: "Second drive", readOptions: false }]);
  world.groups.set("201", failed("busy", 1));
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202")]);
  world.found.set("drive-2", [grouped(3, "203")]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201"]);
  assert.deepEqual(watcher.status().problems, []);
  await watcher.run(at(31));
  assert.deepEqual([world.searchCalls.map((call) => call.id), world.groupCalls], [["drive", "drive-2", "drive", "drive-2"], ["201"]]);
  world.groups.set("201", failed("access", 1));
  await watcher.run(at(61));
  assert.deepEqual(world.groupCalls, ["201", "201"]);
  assert.deepEqual(watcher.status().problems.map((problem) => [problem.code, problem.message]), [["deals-source", "The deal watcher can't read listings' options: eBay says these keys can't read listings' options."]]);
  world.groups.set("201", sizes("201", ["4 TB", 4800]));
  await watcher.run(at(91));
  assert.deepEqual(world.groupCalls, ["201", "201"]);
  await watcher.run(at(122));
  assert.deepEqual(world.groupCalls, ["201", "201", "201", "202"]);
  assert.deepEqual(watcher.status().problems, []);
  assert.equal(world.searchCalls.length, 10);
});

test("no item group is read once half the day's calls are used, so the searches keep the rest", async () => {
  const { world, watcher } = richSetup([drive], { limits: { callsPerDay: 4 } });
  world.groups.set("201", sizes("201", ["4 TB", 4800]));
  world.groups.set("202", sizes("202", ["4 TB", 4900]));
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202")]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201"]);
  assert.equal(watcher.status().callsToday, 2);
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202"), grouped(3, "203")]);
  await watcher.run(at(31));
  assert.deepEqual(world.groupCalls, ["201"]);
  assert.equal(watcher.status().callsToday, 3);
  assert.equal(world.sent.filter((notification) => notification.title.startsWith("Deal:")).length, 1);
});

test("a listing read at its option's price is read in full at that option, and keeps it", async () => {
  const { world, watcher } = richSetup([drive]);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(0));
  world.fullReply = fullOf(listing(1, { price: 4700, variations: true }));
  const reply = await watcher.full("110000000001", at(1));
  assert.deepEqual(world.fullCalls, ["v1|201|2"]);
  assert.equal(reply.status, "ok");
  if (reply.status !== "ok") return;
  assert.deepEqual([reply.listing.price, reply.listing.option, reply.listing.perUnit?.pence], [4700, "Storage Capacity: 4 TB", 1175]);
});


test("with hideVariations too, a listing whose option was read is kept, and one that couldn't be read stays hidden", async () => {
  const { world, watcher } = richSetup([{ ...drive, hideVariations: true }]);
  world.groups.set("201", sizes("201", ["4 TB", 4800]));
  world.groups.set("202", [{ ref: "v1|202|1", price: 3000, text: "", inStock: true }]);
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202"), listing(3, { title: "4TB drive 1TB 2TB", price: 1500, variations: true })]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201", "202"]);
  assert.deepEqual(watcher.searches()[0].hidden, { options: 2 });
  assert.deepEqual(watcher.matches(at(1))[0].listings.map((shown) => [shown.id, shown.price, shown.option]), [["110000000001", 4800, "Storage Capacity: 4 TB"]]);
});


test("with readOptions, a price drop is judged only between prices of the option that fits, never against eBay's cheapest", async () => {
  const { world, watcher } = richSetup([{ ...drive, dropPercent: 10 }]);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(0));
  world.groups.set("201", failed("down"));
  await watcher.run(at(24 * 60 + 1));
  assert.equal(watcher.matches(at(24 * 60 + 2))[0].listings[0].price, 1500);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  await watcher.run(at(25 * 60 + 2));
  assert.equal(watcher.matches(at(25 * 60 + 3))[0].listings[0].price, 4800);
  assert.deepEqual(world.sent.filter((sent) => sent.title.startsWith("Price drop")), []);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 3000]));
  world.found.set("drive", [grouped(1, "201", { price: 1400 })]);
  await watcher.run(at(25 * 60 + 33));
  const drops = world.sent.filter((sent) => sent.title.startsWith("Price drop"));
  assert.equal(drops.length, 1);
  assert.match(drops[0].message, /Was £48\.00, now £30\.00/);
});

test("a listing in two searches is read in full at the option each search chose", async () => {
  const two = { ...drive, id: "drive-2tb", name: "2TB drive", query: "2tb nas hard drive", mustInclude: ["2tb"] };
  const { world, watcher } = richSetup([two, drive]);
  world.groups.set("201", sizes("201", ["2 TB", 3000], ["4 TB", 4800]));
  world.found.set("drive-2tb", [grouped(1, "201", { title: "IronWolf NAS hard drive 2TB 4TB" })]);
  world.found.set("drive", [grouped(1, "201", { title: "IronWolf NAS hard drive 2TB 4TB" })]);
  await watcher.run(at(0));
  assert.deepEqual(watcher.matches(at(1)).map((group) => group.listings[0].price), [3000, 4800]);
  const first = await watcher.full("110000000001", at(1));
  assert.deepEqual([first.status === "ok" && first.searchId, world.fullCalls], ["drive-2tb", ["v1|201|1"]]);
  world.list = readSearches(JSON.stringify({ searches: [{ ...two, switch: "off" }, drive] }), ["ebay"]);
  await watcher.run(at(31));
  const second = await watcher.full("110000000001", at(32));
  assert.deepEqual([second.status === "ok" && second.searchId, second.status === "ok" && second.listing.option, world.fullCalls], ["drive", "Storage Capacity: 4 TB", ["v1|201|1", "v1|201|2"]]);
});

test("a listing whose cheapest option is under the search's lowest price is still read, since the option that fits may be in range", async () => {
  const { world, watcher } = richSetup([{ ...drive, minPrice: 25 }]);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  world.groups.set("202", sizes("202", ["1 TB", 1000], ["4 TB", 2000]));
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202", { price: 1000 }), listing(3, { title: "4TB drive", price: 2000 })]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201", "202"]);
  assert.deepEqual(watcher.searches()[0].hidden, { price: 2 });
  assert.deepEqual(watcher.matches(at(1))[0].listings.map((shown) => [shown.id, shown.price]), [["110000000001", 4800]]);
});

test("with readOptions, a listing first seen before its options were read gets its price for drops from the first read", async () => {
  const { world, watcher } = richSetup([{ ...drive, dropPercent: 10 }]);
  world.groups.set("201", failed("down"));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(0));
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  await watcher.run(at(61));
  assert.equal(watcher.matches(at(62))[0].listings[0].price, 4800);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 3000]));
  world.found.set("drive", [grouped(1, "201", { price: 1400 })]);
  await watcher.run(at(92));
  assert.equal(world.sent.filter((sent) => sent.title.startsWith("Price drop")).length, 1);
});


test("with readOptions, a new listing with options waits for its options to be read, then is alerted at the price of the option that fits", async () => {
  const { world, watcher } = richSetup([drive]);
  world.found.set("drive", []);
  await watcher.run(at(0));
  const many = Array.from({ length: 11 }, (_, i) => grouped(i + 1, String(300 + i)));
  for (let i = 0; i < 11; i++) world.groups.set(String(300 + i), sizes(String(300 + i), ["1 TB", 1500], ["4 TB", 6000 - i * 100]));
  world.groups.set("310", sizes("310", ["1 TB", 1500], ["4 TB", 4000]));
  world.found.set("drive", many);
  await watcher.run(at(31));
  const first = world.sent.filter((sent) => sent.title.startsWith("Deal:") || sent.title.startsWith("More deals"));
  assert.ok(first.length > 0 && first.every((sent) => !sent.message.includes("number 11") && !/^[^\n]*\n£15\.00/.test(sent.message)), JSON.stringify(first));
  const before = world.sent.length;
  await watcher.run(at(62));
  const later = world.sent.slice(before).filter((sent) => sent.title.startsWith("Deal:"));
  assert.deepEqual(later.map((sent) => [sent.title, sent.priority]), [["Deal: 4TB drive", 4]]);
  assert.match(later[0].message, /£40\.00/);
});

test("with readOptions, a new listing is alerted at eBay's price when its options can't be read for now, and not again once they are", async () => {
  const { world, watcher } = richSetup([drive]);
  world.found.set("drive", []);
  await watcher.run(at(0));
  world.groups.set("201", failed("busy", 1));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(31));
  const deals = world.sent.filter((sent) => sent.title.startsWith("Deal:"));
  assert.deepEqual(deals.map((sent) => [sent.title, sent.priority]), [["Deal: 4TB drive", undefined]]);
  assert.match(deals[0].message, /£15\.00[\s\S]*so this may be its lowest price/);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4000]));
  await watcher.run(at(92));
  assert.equal(world.sent.filter((sent) => sent.title.startsWith("Deal:")).length, 1);
  assert.equal(watcher.matches(at(93))[0].listings[0].price, 4000);
});

test("after a restart that forgot what was seen, listings with options from before aren't alerted as new once read", async () => {
  const { world, watcher, restart } = richSetup([drive], { keepSeen: false });
  const old = Array.from({ length: 12 }, (_, i) => grouped(i + 1, String(400 + i)));
  for (let i = 0; i < 12; i++) world.groups.set(String(400 + i), sizes(String(400 + i), ["1 TB", 1500], ["4 TB", 4000]));
  world.found.set("drive", old);
  await watcher.run(at(0));
  const sent = world.sent.length;
  const again = restart();
  await again.run(at(31));
  await again.run(at(62));
  await again.run(at(93));
  assert.deepEqual(world.sent.slice(sent).filter((message) => message.title.startsWith("Deal:") || message.title.startsWith("More deals")), []);
  assert.equal(again.matches(at(94))[0].listings.every((shown) => shown.option === "Storage Capacity: 4 TB"), true);
});

test("readOptions on a search that names no size reads nothing and holds nothing back", async () => {
  const { world, watcher } = richSetup([{ ...drive, query: "ironwolf nas hard drive", mustInclude: ["ironwolf"] }]);
  world.found.set("drive", []);
  await watcher.run(at(0));
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4000]));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(31));
  assert.deepEqual(world.groupCalls, []);
  assert.deepEqual(world.sent.filter((sent) => sent.title.startsWith("Deal:")).map((sent) => sent.title), ["Deal: 4TB drive"]);
});

test("a group that times out waits an hour and doesn't keep the groups after it from being read", async () => {
  const { world, watcher } = richSetup([drive]);
  world.groups.set("201", failed("down"));
  world.groups.set("202", sizes("202", ["4 TB", 4800]));
  world.found.set("drive", [grouped(1, "201"), grouped(2, "202")]);
  await watcher.run(at(0));
  assert.deepEqual(world.groupCalls, ["201"]);
  await watcher.run(at(31));
  assert.deepEqual(world.groupCalls, ["201", "202"]);
  await watcher.run(at(62));
  assert.deepEqual(world.groupCalls, ["201", "202", "201"]);
});

test("trouble reading options is forgotten on Check now, and once no search reads options", async () => {
  const { world, watcher } = richSetup([drive]);
  world.groups.set("201", failed("access", 1));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(0));
  assert.equal(watcher.status().problems.length, 1);
  await watcher.run(at(5), true);
  assert.deepEqual([watcher.status().problems.length, world.groupCalls.length], [1, 2]);
  world.list = readSearches(JSON.stringify({ searches: [{ ...drive, readOptions: false }] }), ["ebay"]);
  await watcher.run(at(40));
  assert.deepEqual(watcher.status().problems, []);
});

test("with readOptions, a new listing whose options can't be read is alerted at eBay's price, with the caution", async () => {
  const { world, watcher } = richSetup([drive]);
  world.found.set("drive", []);
  await watcher.run(at(0));
  world.groups.set("201", failed("reply"));
  world.found.set("drive", [grouped(1, "201")]);
  await watcher.run(at(31));
  const deals = world.sent.filter((sent) => sent.title.startsWith("Deal:"));
  assert.deepEqual(deals.map((sent) => [sent.title, sent.priority]), [["Deal: 4TB drive", undefined]]);
  assert.match(deals[0].message, /£15\.00[\s\S]*so this may be its lowest price/);
});

test("each search keeps up to three titles for each reason it hid listings, from its last check, for six hours", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, exclude: ["micro"], maxPrice: 100 }]);
  world.found.set("optiplex", [
    listing(1, { title: "OptiPlex 7070 Micro one" }),
    listing(2, { title: "OptiPlex 7070 Micro two" }),
    listing(3, { title: "OptiPlex 7070 Micro three" }),
    listing(4, { title: "OptiPlex 7070 Micro four" }),
    listing(5, { title: "OptiPlex 7070 SFF dear", price: 20000 }),
    listing(6, { title: "OptiPlex 7070 SFF fine" }),
  ]);
  await watcher.run(at(0));
  assert.deepEqual(watcher.hidden("optiplex", at(1)), {
    id: "optiplex",
    name: "OptiPlex",
    checkedAt: at(0).toISOString(),
    hidden: { words: 4, price: 1 },
    examples: { words: ["OptiPlex 7070 Micro one", "OptiPlex 7070 Micro two", "OptiPlex 7070 Micro three"], price: ["OptiPlex 7070 SFF dear"] },
  });
  assert.equal(watcher.hidden("optiplex", at(6 * 60 + 1)), null);
  assert.equal(watcher.hidden("nothing", at(1)), null);
  const reply = watcher.hidden("optiplex", at(1));
  reply?.examples.words.push("changed");
  assert.equal(watcher.hidden("optiplex", at(1))?.examples.words.length, 3);
  world.list = readSearches(JSON.stringify({ searches: [{ ...optiplex, switch: "off" }] }), ["ebay"]);
  await watcher.run(at(5));
  assert.equal(watcher.hidden("optiplex", at(6)), null);
});

test("a search reading options reports how many fitted, how many couldn't be told and how many wait to be read", async () => {
  const { world, watcher } = richSetup([drive]);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  world.groups.set("202", sizes("202", ["1 TB", 1500], ["2 TB", 2800]));
  const many = [grouped(1, "201"), grouped(2, "202"), ...Array.from({ length: 10 }, (_, i) => grouped(i + 3, String(300 + i)))];
  world.found.set("drive", many);
  await watcher.run(at(0));
  assert.deepEqual(watcher.searches(at(1))[0].options, { fitted: 1, unknown: 9, unread: 2 });
  assert.deepEqual(watcher.searches(at(1))[0].notes, []);
});

test("a search's notes say when readOptions can't do anything and when its guide price is over 30 days old", async () => {
  const { watcher } = richSetup([{ ...drive, query: "ironwolf nas", mustInclude: [], guideDate: "2026-10-01" }, { ...optiplex, guidePrice: 100, guideDate: "2026-11-01" }]);
  await watcher.run(at(0));
  assert.deepEqual(watcher.searches(at(1)).map((search) => search.notes), [["readOptions does nothing here: the search names no size in GB or TB", "its guide price was set on 2026-10-01, over 30 days ago"], []]);
  assert.deepEqual(watcher.searches(new Date("2026-12-05T00:00:00Z"))[1].notes, ["its guide price was set on 2026-11-01, over 30 days ago"]);
  const cancelled = richSetup([{ ...ram, mustInclude: ["ddr4 ecc", "2x16gb"], exclude: ["registered", "ECC"] }, { ...optiplex, mustInclude: ["7070*"], exclude: ["7070"] }]);
  await cancelled.watcher.run(at(0));
  assert.deepEqual(cancelled.watcher.searches(at(1)).map((search) => search.notes), [['nothing can match: exclude "ECC" hides every title with "ddr4 ecc", which mustInclude needs'], []]);
  const avoided = richSetup([{ ...ram, mustInclude: ["registered ecc"], avoid: ["server ram"] }]);
  await avoided.watcher.run(at(0));
  assert.deepEqual(avoided.watcher.searches(at(1))[0].notes, ['nothing can match: the server ram avoid list\'s "registered" hides every title with "registered ecc", which mustInclude needs']);
  assert.equal(watcher.searches(at(1))[0].options, null);
});

const digests = (sent: Notification[]) => sent.filter((notification) => notification.title.startsWith("Deal digest"));

test("the digest goes once a day, at the first check from its time, and doesn't count as an alert", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, group: "whole pc", guidePrice: 100 }, { ...ram, group: "ram" }], { digest: "12:30" });
  world.found.set("optiplex", [listing(1, { price: 8000, postage: 0 })]);
  world.found.set("ram", [listing(2, { price: 4000, postage: 0 })]);
  await watcher.run(at(0));
  assert.deepEqual(digests(world.sent), []);
  await watcher.run(at(30));
  assert.equal(digests(world.sent).length, 1);
  assert.match(digests(world.sent)[0].message, /^2 matches across 2 part types\. The best of each:\nWhole PCs: .*, £80\.00, 20% under guide \(OptiPlex\)\.\nRAM: 1 match, none under guide\. Cheapest: .*, £40\.00 \(DDR4 RAM\)\.$/);
  assert.equal(watcher.status(at(30)).alertsToday, 0);
  await watcher.run(at(60));
  await watcher.run(at(200));
  assert.equal(digests(world.sent).length, 1);
  await watcher.run(at(24 * 60));
  assert.equal(digests(world.sent).length, 1);
  await watcher.run(at(24 * 60 + 30));
  assert.equal(digests(world.sent).length, 2);
});

test("no digest is sent unless one is set", async () => {
  const { world, watcher } = richSetup([optiplex]);
  world.found.set("optiplex", listings(1));
  for (const minutes of [0, 30, 60, 600, 1440]) await watcher.run(at(minutes));
  assert.deepEqual(digests(world.sent), []);
});

test("the digest waits for quiet hours to end, and is skipped that day if they end three hours or more after its time", async () => {
  const short = richSetup([optiplex], { digest: "12:30", quiet: { from: "12:00", to: "13:00" } });
  short.world.found.set("optiplex", listings(1));
  await short.watcher.run(at(0));
  await short.watcher.run(at(30));
  assert.deepEqual(digests(short.world.sent), []);
  await short.watcher.run(at(60));
  assert.equal(digests(short.world.sent).length, 1);
  assert.equal(digests(short.world.sent)[0].priority, undefined);

  const long = richSetup([optiplex], { digest: "12:30", quiet: { from: "12:00", to: "15:30" } });
  long.world.found.set("optiplex", listings(1));
  for (const minutes of [0, 30, 60, 120, 180, 210, 240, 300]) await long.watcher.run(at(minutes));
  assert.deepEqual(digests(long.world.sent), []);
});

test("a digest that couldn't be sent is tried again at the next check, and one that was sent isn't sent again after a restart", async () => {
  const { world, watcher, restart } = richSetup([optiplex], { digest: "12:30" });
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.failSend = true;
  assert.equal((await watcher.run(at(30))).unsent, true);
  world.failSend = false;
  await watcher.run(at(60));
  assert.equal(digests(world.sent).length, 1);
  assert.equal(JSON.parse(world.disk.text ?? "{}").digested, "2026-11-18");
  const again = restart();
  await again.run(at(90));
  assert.equal(digests(world.sent).length, 1);
});

test("the digest leaves out snoozed searches and says so when nothing is left", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, group: "whole pc" }, { ...ram, group: "ram" }], { digest: "12:30" });
  world.found.set("optiplex", listings(1));
  world.found.set("ram", listings(2));
  await watcher.run(at(0));
  await watcher.snooze("ram", null);
  await watcher.run(at(30));
  assert.match(digests(world.sent)[0].message, /^1 match across 1 part type\. The best of each:\nWhole PCs: /);

  const quiet = richSetup([optiplex], { digest: "12:30" });
  quiet.world.found.set("optiplex", listings(1));
  await quiet.watcher.run(at(0));
  await quiet.watcher.snooze("optiplex", null);
  await quiet.watcher.run(at(30));
  assert.equal(digests(quiet.world.sent)[0].message, "Nothing to report: every search is snoozed, switched off or not checked in the last six hours.");
});

test("the digest leaves out a search whose last check was more than six hours ago", async () => {
  const { world, watcher } = richSetup([{ ...optiplex, everyMinutes: 1440 }], { digest: "19:00" });
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  await watcher.run(at(7 * 60));
  assert.equal(digests(world.sent)[0].message, "Nothing to report: every search is snoozed, switched off or not checked in the last six hours.");
});

test("a digest at 20:59 can still go at a check just before midnight, but never after it", async () => {
  const late = richSetup([optiplex], { digest: "20:59" });
  late.world.found.set("optiplex", listings(1));
  await late.watcher.run(at(0));
  await late.watcher.run(at(11 * 60 + 55));
  assert.equal(digests(late.world.sent).length, 1);

  const night = richSetup([optiplex], { digest: "20:59", quiet: { from: "20:00", to: "00:30" } });
  night.world.found.set("optiplex", listings(1));
  for (const minutes of [0, 9 * 60, 11 * 60 + 55, 12 * 60 + 30, 12 * 60 + 35]) await night.watcher.run(at(minutes));
  assert.deepEqual(digests(night.world.sent), []);
});

test("in summer the digest follows the clock in London, an hour ahead of UTC", async () => {
  const { world, watcher } = richSetup([optiplex], { digest: "08:00" });
  world.found.set("optiplex", listings(1));
  await watcher.run(new Date("2026-07-15T06:58:00.000Z"));
  assert.deepEqual(digests(world.sent), []);
  await watcher.run(new Date("2026-07-15T07:00:00.000Z"));
  assert.equal(digests(world.sent).length, 1);
});

test("status gives the digest's time, whether today's has gone, and whether its three hours passed without it", async () => {
  const { world, watcher } = richSetup([optiplex], { digest: "12:30" });
  world.found.set("optiplex", listings(1));
  assert.equal(watcher.status(at(0)).digest, null);
  await watcher.run(at(0));
  assert.deepEqual(watcher.status(at(0)).digest, { at: "12:30", sentToday: false, skippedToday: false });
  await watcher.run(at(30));
  assert.deepEqual(watcher.status(at(30)).digest, { at: "12:30", sentToday: true, skippedToday: false });
  assert.deepEqual(watcher.status(at(5 * 60)).digest, { at: "12:30", sentToday: true, skippedToday: false });
  assert.deepEqual(watcher.status(at(24 * 60)).digest, { at: "12:30", sentToday: false, skippedToday: false });
  assert.deepEqual(watcher.status(at(24 * 60 + 3 * 60 + 29)).digest, { at: "12:30", sentToday: false, skippedToday: false });
  assert.deepEqual(watcher.status(at(24 * 60 + 3 * 60 + 30)).digest, { at: "12:30", sentToday: false, skippedToday: true });
});

test("a search eBay has more listings for than it reads gets a health note saying so", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", { listings: listings(1, 2, 3), total: 1110, complete: false, calls: 3 });
  await watcher.run(at(0));
  const [search] = watcher.searches(at(1));
  assert.deepEqual(search.health, [{ kind: "incomplete", text: "eBay has 1,110 listings for it with its filters, but only the newest 3 are read, so older ones can be missed. A category or narrower words would bring eBay's count down." }]);
  assert.equal(search.callsToday, 3);
  world.found.set("optiplex", { listings: listings(1, 2, 3), total: 3, complete: true });
  await watcher.run(at(31));
  assert.deepEqual(watcher.searches(at(32))[0].health, []);
});

function junkAndReal(junk: number, real: number, priced = 0): Listing[] {
  return [
    ...Array.from({ length: junk }, (_, n) => listing(1000 + n, { title: `Galaxy Tab S6 Lite keyboard case number ${n}` })),
    ...Array.from({ length: real }, (_, n) => listing(2000 + n)),
    ...Array.from({ length: priced }, (_, n) => listing(3000 + n, { price: 999_999 })),
  ];
}

test("a search whose titles or item details hide at least half of 200 or more listings read gets a health note", async () => {
  const search = { ...optiplex, mustInclude: ["optiplex"], maxPrice: 5000 };
  const cases: [Listing[], string | null][] = [
    [junkAndReal(552, 48), "552 of the 600 listings eBay sent were hidden by their titles or item details, and every 200 read costs a call. A category or narrower words would keep them out before eBay counts."],
    [junkAndReal(100, 100), "100 of the 200 listings eBay sent were hidden by their titles or item details, and every 200 read costs a call. A category or narrower words would keep them out before eBay counts."],
    [junkAndReal(99, 101), null],
    [junkAndReal(199, 0), null],
    [junkAndReal(99, 1, 100), null],
  ];
  for (const [found, text] of cases) {
    const { world, watcher } = setup([search]);
    world.found.set("optiplex", found);
    await watcher.run(at(0));
    const health = watcher.searches(at(1))[0].health.filter((note) => note.kind === "mostlyHidden");
    assert.deepEqual(health, text === null ? [] : [{ kind: "mostlyHidden", text }], String(found.length));
  }
});

test("an eBay search that found nothing gets a health note, and a feed that found nothing doesn't", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  assert.deepEqual(watcher.searches(at(1))[0].health, [{ kind: "nothingFound", text: "eBay found nothing with its filters at the last check. Its cuts show which filter cuts most." }]);
  world.found.set("optiplex", listings(1));
  await watcher.run(at(31));
  assert.deepEqual(watcher.searches(at(32))[0].health, []);

  const feed = createDealWatcher({
    loadSearches: async () => listOf([{ ...optiplex, source: "other" }]),
    sources: { other: { noCalls: true, search: async () => ({ listings: [], total: 0, complete: true, calls: 0, skipped: 0 }) } },
    store: fakeStore(true).store,
    notify: async () => undefined,
  });
  await feed.run(at(0));
  assert.deepEqual(feed.searches(at(1))[0].health, []);
  assert.equal(feed.searches(at(1))[0].callsToday, 0);
});

test("a search with no match for seven days gets a health note naming the day it last matched", async () => {
  const { world, watcher } = setup();
  await watcher.run(at(0));
  const kinds = (minutes: number) => watcher.searches(at(minutes))[0].health.map((note) => note.kind);
  assert.deepEqual(kinds(7 * 1440 - 1), ["nothingFound"]);
  assert.deepEqual(watcher.searches(at(7 * 1440))[0].health.at(-1), { kind: "noMatch", text: "No match since it started watching on 2026-11-18, over 7 days ago." });
  world.found.set("optiplex", listings(1));
  await watcher.run(at(8 * 1440));
  assert.deepEqual(kinds(8 * 1440 + 1), []);
  world.found.set("optiplex", []);
  await watcher.run(at(8 * 1440 + 30));
  assert.deepEqual(kinds(15 * 1440 - 1), ["nothingFound"]);
  assert.deepEqual(watcher.searches(at(15 * 1440))[0].health.at(-1), { kind: "noMatch", text: "No match since 2026-11-26, over 7 days ago." });
});

test("the last match is remembered across a restart, in memory-only mode too, and kept when the same search starts again after a long gap", async () => {
  for (const gap of [60, 3 * 1440]) {
    const { world, watcher, restart } = setup([optiplex], { keepSeen: false });
    world.found.set("optiplex", listings(1));
    await watcher.run(at(0));
    assert.ok((world.disk.text ?? "").includes(`"matched":"${at(0).toISOString()}"`));
    const again = restart();
    world.found.set("optiplex", []);
    await again.run(at(gap));
    assert.deepEqual(again.searches(at(7 * 1440)).flatMap((search) => search.health).at(-1), { kind: "noMatch", text: "No match since 2026-11-18, over 7 days ago." }, String(gap));
  }
});

test("a search whose words change starts its last match afresh", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(1));
  await watcher.run(at(0));
  world.list = listOf([{ ...optiplex, query: "optiplex 7080 sff" }]);
  world.found.set("optiplex", []);
  await watcher.run(at(60));
  assert.deepEqual(watcher.searches(at(7 * 1440 - 1)).flatMap((search) => search.health).map((note) => note.kind), ["nothingFound"]);
  assert.deepEqual(watcher.searches(at(7 * 1440 + 60)).flatMap((search) => search.health).at(-1), { kind: "noMatch", text: "No match since it started watching on 2026-11-18, over 7 days ago." });
});

test("each search's calls today count its searches, option reads and failed calls, start again each day and go with the search", async () => {
  const { world, watcher } = richSetup([drive, { ...optiplex, everyMinutes: 30 }]);
  world.groups.set("201", sizes("201", ["1 TB", 1500], ["4 TB", 4800]));
  world.found.set("drive", [grouped(1, "201")]);
  const broken = new SourceError("down", ebayMessages.down);
  broken.calls = 2;
  world.found.set("optiplex", broken);
  await watcher.run(at(0));
  const calls = (minutes: number) => Object.fromEntries(watcher.searches(at(minutes)).map((search) => [search.id, search.callsToday]));
  assert.deepEqual(calls(1), { drive: 2, optiplex: 2 });
  assert.equal(watcher.status().callsToday, 4);
  world.found.set("optiplex", [listing(1)]);
  await watcher.run(at(31));
  assert.deepEqual(calls(32), { drive: 3, optiplex: 3 });
  await watcher.run(at(1440));
  assert.deepEqual(calls(1441), { drive: 2, optiplex: 1 });
  world.list = readSearches(JSON.stringify({ searches: [drive] }), ["ebay"]);
  await watcher.run(at(1500));
  assert.deepEqual(calls(1501), { drive: 3 });
  assert.ok(!(world.disk.text ?? "").includes('"optiplex"'));
});

test("a snoozed search has no health notes, so a snooze doesn't build up a week of no match", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", { listings: listings(1), total: 900, complete: false });
  await watcher.run(at(0));
  assert.deepEqual(watcher.searches(at(1))[0].health.map((note) => note.kind), ["incomplete"]);
  await watcher.snooze("optiplex", null);
  assert.deepEqual(watcher.searches(at(8 * 1440))[0].health, []);
  await watcher.wake("optiplex");
  assert.deepEqual(watcher.searches(at(8 * 1440 + 1))[0].health.map((note) => note.kind), ["incomplete", "noMatch"]);
});

test("with digestHealth on, the digest names the switched-on searches that need a look, leaving out snoozed ones and finding nothing", async () => {
  for (const digestHealth of ["on", "off", undefined]) {
    const searches = [
      { ...optiplex, group: "whole pc", guidePrice: 100, mustInclude: ["optiplex"] },
      { ...ram, group: "ram" },
      { ...optiplex, id: "dozy", name: "Dozy search" },
      { ...optiplex, id: "empty", name: "Empty search" },
    ];
    const { world, watcher } = richSetup(searches, { digest: "12:30", digestHealth });
    world.found.set("optiplex", [listing(1, { price: 8000, postage: 0 })]);
    world.found.set("ram", [listing(2, { price: 4000, postage: 0 })]);
    world.found.set("dozy", [listing(3)]);
    await watcher.run(at(0));
    await watcher.snooze("dozy", null);
    world.list = readSearches(JSON.stringify({ searches: searches.map((search) => (search.id === "ram" ? { ...search, query: "ddr4 2x16gb kit" } : search)), digest: "12:30", digestHealth }), ["ebay"]);
    world.found.set("optiplex", [listing(1, { price: 8000, postage: 0 }), ...Array.from({ length: 300 }, (_, n) => listing(500 + n, { title: `Galaxy Tab keyboard case ${n}` }))]);
    await watcher.run(at(7 * 1440 + 30));
    const [digest] = digests(world.sent);
    const look = digest.message.split("\n").filter((line) => line.startsWith("Needs a look"));
    assert.deepEqual(look, digestHealth === "on" ? ["Needs a look: OptiPlex (mostly hides junk); Empty search (no match for a week)."] : [], String(digestHealth));
  }
});

test("a search's cuts are read from its source as one lookup, for switched-off searches too, and an unknown search is said so", async () => {
  const asked: string[] = [];
  const cuts = { asWatched: 5, without: [{ filter: "buy it now only", total: 52, by: [] }], wordsAlone: { total: 4409, categoryId: "27386", categories: [] } };
  const { world } = setup();
  const watcher = createDealWatcher({
    loadSearches: async () => listOf([optiplex, { ...ram, switch: "off" }]),
    sources: {
      ebay: {
        search: async () => ({ listings: [], total: 0, complete: true, calls: 1, skipped: 0 }),
        cuts: async (search) => {
          asked.push(search.id);
          return { cuts, calls: 7 };
        },
      },
    },
    store: world.store,
    notify: async () => undefined,
  });
  assert.deepEqual(await watcher.cuts("optiplex", at(0)), { status: "unknown" });
  await watcher.run(at(0));
  assert.deepEqual(await watcher.cuts("optiplex", at(1)), { status: "ok", value: { id: "optiplex", name: "OptiPlex", query: "optiplex 7070 sff", ...cuts } });
  assert.deepEqual(await watcher.cuts("ram", at(2)), { status: "ok", value: { id: "ram", name: "DDR4 RAM", query: "ddr4 2x16gb", ...cuts } });
  assert.deepEqual(await watcher.cuts("nope", at(3)), { status: "unknown" });
  assert.deepEqual(asked, ["optiplex", "ram"]);
  assert.equal(watcher.status().callsToday, 15);
  assert.equal(watcher.searches(at(4)).find((search) => search.id === "optiplex")?.callsToday, 1);
});

test("a search's cuts are refused when its source can't count them, when today's reads are used up, or while eBay asks for a wait", async () => {
  const { world, watcher } = setup([optiplex, { ...optiplex, id: "other-one", source: "other" }]);
  await watcher.run(at(0));
  assert.deepEqual(await watcher.cuts("other-one", at(1)), { status: "unsupported" });

  let reply: Error | null = failed("busy", 3);
  const counting = createDealWatcher({
    loadSearches: async () => listOf([optiplex], { callsPerDay: 5000 }),
    sources: {
      ebay: {
        search: async () => ({ listings: [], total: 0, complete: true, calls: 1, skipped: 0 }),
        cuts: async () => {
          if (reply !== null) throw reply;
          return { cuts: { asWatched: 0, without: [], wordsAlone: { total: 0, categoryId: null, categories: [] } }, calls: 2 };
        },
      },
    },
    store: world.store,
    notify: async () => undefined,
  });
  await counting.run(at(0));
  assert.deepEqual(await counting.cuts("optiplex", at(1)), { status: "failed", message: ebayMessages.busy });
  assert.deepEqual(await counting.cuts("optiplex", at(2)), { status: "waiting" });
  reply = null;
  let ok = 0;
  for (let n = 0; n < 200; n++) {
    const result = await counting.cuts("optiplex", at(120 + n));
    if (result.status === "ok") ok += 1;
    else {
      assert.deepEqual(result, { status: "limit" });
      break;
    }
  }
  assert.equal(ok, 149);
});

test("cuts use at most a quarter of the day's eBay calls, and only start with enough calls left for the most a cuts lookup can take", async () => {
  const { world } = setup();
  let calls = 9;
  let searchCalls = 1;
  const build = (callsPerDay: number) =>
    createDealWatcher({
      loadSearches: async () => listOf([optiplex], { callsPerDay }),
      sources: {
        ebay: {
          search: async () => ({ listings: [], total: 0, complete: true, calls: searchCalls, skipped: 0 }),
          cuts: async () => ({ cuts: { asWatched: 0, without: [], wordsAlone: { total: 0, categoryId: null, categories: [] } }, calls }),
        },
      },
      store: world.store,
      notify: async () => undefined,
    });
  const shared = build(100);
  await shared.run(at(0));
  const statuses: string[] = [];
  for (let n = 0; n < 4; n++) statuses.push((await shared.cuts("optiplex", at(1 + n))).status);
  assert.deepEqual(statuses, ["ok", "ok", "limit", "limit"]);
  calls = 3;
  const next = await shared.cuts("optiplex", at(24 * 60 + 1));
  assert.equal(next.status, "ok");

  const tight = build(30);
  await tight.run(at(0));
  calls = 9;
  assert.equal((await tight.cuts("optiplex", at(1))).status, "limit");

  searchCalls = 92;
  const busy = build(100);
  await busy.run(at(2 * 24 * 60));
  assert.equal((await busy.cuts("optiplex", at(2 * 24 * 60 + 1))).status, "limit");
  searchCalls = 91;
  const roomy = build(100);
  await roomy.run(at(3 * 24 * 60));
  assert.equal((await roomy.cuts("optiplex", at(3 * 24 * 60 + 1))).status, "ok");
});

test("cuts count only their own calls towards their share, not a check that runs while they wait", async () => {
  const { world } = setup();
  let checkDuring = true;
  let built: ReturnType<typeof createDealWatcher> | null = null;
  const watcher = createDealWatcher({
    loadSearches: async () => listOf([optiplex], { callsPerDay: 100 }),
    sources: {
      ebay: {
        search: async () => ({ listings: [], total: 0, complete: true, calls: 10, skipped: 0 }),
        cuts: async () => {
          if (checkDuring && built !== null) {
            checkDuring = false;
            await built.run(at(60), true);
          }
          return { cuts: { asWatched: 0, without: [], wordsAlone: { total: 0, categoryId: null, categories: [] } }, calls: 9 };
        },
      },
    },
    store: world.store,
    notify: async () => undefined,
  });
  built = watcher;
  await watcher.run(at(0));
  assert.equal((await watcher.cuts("optiplex", at(1))).status, "ok");
  assert.equal(watcher.status().callsToday, 29);
  assert.equal((await watcher.cuts("optiplex", at(2))).status, "ok");
  assert.equal((await watcher.cuts("optiplex", at(3))).status, "limit");
});
