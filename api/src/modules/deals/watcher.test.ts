import assert from "node:assert/strict";
import { test } from "node:test";
import type { Notification } from "../notify/notifier.js";
import { ebayMessages } from "./ebay.js";
import { readSearches, type Search, type SearchList } from "./searches.js";
import { SourceError, type FailReason, type Listing, type SearchResult, type Source } from "./source.js";
import { emptyMemory, readMemory, writeMemory, type Store } from "./store.js";
import { createDealWatcher } from "./watcher.js";

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

function titles(sent: Notification[]): string[] {
  return sent.map((notification) => notification.title);
}

test("a new search's first check alerts nothing and sends one now-watching message", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", listings(3, 1, 2));
  const summary = await watcher.run(at(0));
  assert.deepEqual(summary, { ran: true, checked: 1, alerts: 0, failed: 0, unsent: false });
  assert.deepEqual(world.sent, [
    { title: "Deal watcher: now watching", message: "OptiPlex: 3 match now, from £91.00.\nYou'll hear about new ones as they appear.", tags: "eyes" },
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
  assert.equal(world.sent[0].message, "OptiPlex: 2 match now, from £91.00.\nDDR4 RAM: nothing matches yet.\nYou'll hear about new ones as they appear.");
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
  assert.deepEqual(world.sent, [{ title: "Deal watcher: now watching", message: "OptiPlex: 8 match now, from £91.00.\nYou'll hear about new ones as they appear.", tags: "eyes" }]);
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
  assert.deepEqual(Object.keys(JSON.parse(text).searches.optiplex).sort(), ["checked", "criteria", "since", "wide"]);
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
  assert.deepEqual(watcher.matches(at(1)), [
    {
      id: "optiplex",
      name: "OptiPlex",
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
    { id: "ram", name: "DDR4 RAM", source: "ebay", checkedAt: at(0).toISOString(), count: 0, listings: [] },
  ]);
});

test("matches never shows seller numbers or eBay's item ids", async () => {
  const { world, watcher } = setup();
  world.found.set("optiplex", [listing(1, { sellerPercent: 87.65, sellerFeedback: 424242 })]);
  await watcher.run(at(0));
  const text = JSON.stringify(watcher.matches(at(1)));
  assert.ok(!text.includes("87.65") && !text.includes("424242") && !text.includes("v1|"));
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
    { id: "optiplex", name: "OptiPlex", on: true, source: "ebay", query: "optiplex 7070 sff", everyMinutes: 30, lastChecked: at(0).toISOString(), watchingSince: at(0).toISOString(), matches: 2, total: 2, complete: true, problem: null },
    { id: "ram", name: "DDR4 RAM", on: false, source: "ebay", query: "ddr4 2x16gb", everyMinutes: 60, lastChecked: null, watchingSince: null, matches: null, total: null, complete: null, problem: null },
  ]);
});

test("the status starts empty and then counts the day's calls and alerts", async () => {
  const { world, watcher } = setup([optiplex], { limits: { callsPerDay: 500, alertsPerDay: 20 } });
  assert.deepEqual(watcher.status(), { lastRun: null, callsToday: 0, callsPerDay: 1000, alertsToday: 0, alertsPerDay: 60, note: null, problems: [] });
  assert.deepEqual(watcher.problems(), []);
  assert.deepEqual(watcher.searches(), []);
  assert.deepEqual(watcher.matches(at(0)), []);
  await watcher.run(at(0));
  world.found.set("optiplex", listings(1, 2));
  await watcher.run(at(30));
  assert.deepEqual(watcher.status(), { lastRun: at(30).toISOString(), callsToday: 2, callsPerDay: 500, alertsToday: 2, alertsPerDay: 20, note: null, problems: [] });
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