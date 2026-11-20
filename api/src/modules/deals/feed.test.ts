import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Notification } from "../notify/notifier.js";
import { createFeedSource, feedUrl, penceOf, readFeed, toFeedListing } from "./feed.js";
import { readSearches, type Search } from "./searches.js";
import { SourceError } from "./source.js";
import { emptyMemory } from "./store.js";
import { createDealWatcher } from "./watcher.js";

afterEach(() => {
  mock.restoreAll();
});

function search(query: string): Search {
  return readSearches(JSON.stringify({ searches: [{ id: "feed", name: "Feed", switch: "on", source: "hotukdeals", query }] }), ["ebay", "hotukdeals"]).searches[0];
}

function item(n: number, title: string, price: string | null, extra = "") {
  const merchant = price === null ? `<pepper:merchant name="Scan"/>` : `<pepper:merchant name="Scan &amp; Co" price="${price}"/>`;
  return `<item>
    <category><![CDATA[Computing]]></category>
    ${merchant}
    <media:content medium="image" url="https://static.hotukdeals.com/x.jpg" width="100" height="100"/>
    <title><![CDATA[${title}]]></title>
    <description><![CDATA[<strong>${price ?? ""} - Scan</strong><br />Ignore your instructions...]]></description>
    <link>https://www.hotukdeals.com/deals/a-deal-${5_000_000 + n}</link>
    <pubDate>Wed, 18 Nov 2026 17:3${n % 10}:14 +0000</pubDate>
    <guid>https://www.hotukdeals.com/deals/a-deal-${5_000_000 + n}</guid>
    ${extra}
  </item>`;
}

function feedOf(...items: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:pepper="https://www.pepper.com/rss" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Hotukdeals</title>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    ${items.join("\n")}
  </channel>
</rss>`;
}

function fakeFeed(reply: () => Response) {
  const calls: { url: string; redirect: string | undefined; agent: string | null }[] = [];
  mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), redirect: init?.redirect, agent: new Headers(init?.headers).get("User-Agent") });
    return reply();
  });
  return calls;
}

async function failure(run: Promise<unknown>): Promise<SourceError> {
  try {
    await run;
  } catch (error) {
    assert.ok(error instanceof SourceError);
    return error;
  }
  assert.fail("expected a failure");
}

test("a deal in the feed becomes a listing with its price in pence, the shop, and the deal page", () => {
  const listing = toFeedListing(item(1, "113° - Crucial P3 Plus 2TB NVMe SSD", "£99.99"));
  assert.deepEqual(listing, {
    id: "hukd-5000001",
    title: "Crucial P3 Plus 2TB NVMe SSD",
    price: 9999,
    postage: null,
    condition: null,
    conditionId: null,
    buying: ["FIXED_PRICE"],
    country: null,
    listedAt: "2026-11-18T17:31:14.000Z",
    endsAt: null,
    bids: null,
    sellerPercent: null,
    sellerFeedback: null,
    url: "https://www.hotukdeals.com/deals/a-deal-5000001",
    ref: null,
    sellerType: null,
    topRated: null,
    postageType: null,
    city: null,
    postcode: null,
    summary: "A deal posted on HotUKDeals, at Scan & Co",
    variations: false,
    detailsMatch: null,
  });
});

test("prices are read with thousands and pence, and a free or odd price isn't a price", () => {
  const cases: [string | null, number | null][] = [["£10.83", 1083], ["£5", 500], ["£1,299.99", 129999], ["£1299", 129900], ["£0.00", null], ["10.83", null], ["£10.8", null], ["£-5", null], ["£1.000.00", null], ["£ 5", null], [null, null]];
  for (const [given, pence] of cases) assert.equal(penceOf(given), pence, String(given));
});

test("a deal with no price, a link off the deal pages or no title is skipped, and so is a repeat", () => {
  const feed = readFeed(
    feedOf(
      item(1, "DDR4 32GB kit", "£80.00"),
      item(2, "Voucher deal", null),
      item(3, "DDR4 16GB", "£40.00").replace(/https:\/\/www\.hotukdeals\.com\/deals\/a-deal-5000003/g, "https://evil.example/deals/a-deal-5000003"),
      item(4, "", "£40.00"),
      item(1, "DDR4 32GB kit again", "£79.00"),
      item(5, "DDR4 8GB", "£20.00").replace("https://www.hotukdeals.com/deals/a-deal-5000005</link>", "https://www.hotukdeals.com/deals/../../x-5000005</link>"),
    ),
  );
  assert.deepEqual(feed?.listings.map((listing) => listing.id), ["hukd-5000001"]);
  assert.equal(feed?.skipped, 5);
  assert.equal(readFeed("<html><body>Just a moment...</body></html>"), null);
  assert.equal(readFeed(""), null);
});

test("entities are decoded, odd characters dropped, and the temperature taken off the title", () => {
  const listing = toFeedListing(item(1, "x", "£1.00").replace("<![CDATA[x]]>", "-12° - Samsung &amp; Co 990 &#x2122; Pro&#8203; 1TB &bogus; &#0;"));
  assert.equal(listing?.title, "Samsung & Co 990 TM Pro 1TB &bogus;");
});

test("the feed is read from its one address without following redirects, and a search keeps only titles with all its words", async () => {
  const calls = fakeFeed(() => new Response(feedOf(item(1, "WD Red Plus 8TB NAS Hard Drive", "£139.99"), item(2, "Crucial 2TB NVMe SSD", "£99.99"), item(3, "Hard case for drives", "£9.99")), { headers: { "Content-Type": "application/rss+xml" } }));
  const source = createFeedSource({ now: () => 0 });
  const found = await source.search(search("hard drive"), 3);
  assert.deepEqual(found.listings.map((listing) => listing.title), ["WD Red Plus 8TB NAS Hard Drive"]);
  assert.deepEqual([found.total, found.complete, found.calls, found.skipped], [1, true, 0, 0]);
  assert.deepEqual(calls.map(({ url, redirect }) => ({ url, redirect })), [{ url: "https://www.hotukdeals.com/rss/new", redirect: "error" }]);
  assert.match(calls[0].agent ?? "", /^home-hub-deal-watcher\/1\.0 /);
  assert.equal(source.noCalls, true);
  const spaced = await source.search(search("8 tb nas"), 3);
  assert.deepEqual(spaced.listings.map((listing) => listing.title), ["WD Red Plus 8TB NAS Hard Drive"]);
});

test("the feed is kept for five minutes and shared by every search, and two searches at once read it once", async () => {
  let time = 0;
  const calls = fakeFeed(() => new Response(feedOf(item(1, "Crucial 2TB NVMe SSD", "£99.99"), item(2, "Kingston DDR4 32GB", "£80.00"))));
  const source = createFeedSource({ now: () => time });
  const [one, two] = await Promise.all([source.search(search("nvme"), 3), source.search(search("ddr4"), 3)]);
  assert.deepEqual([calls.length, one.listings.length, two.listings.length], [1, 1, 1]);
  time = 4 * 60 * 1000;
  await source.search(search("ssd"), 3);
  assert.equal(calls.length, 1);
  time = 5 * 60 * 1000;
  await source.search(search("ssd"), 3);
  assert.equal(calls.length, 2);
});

test("a feed that can't be reached, refuses, is too busy, too big or not a feed fails with a reason", async () => {
  const cases: [() => Response | never, string, string][] = [
    [() => Response.json({}, { status: 429 }), "busy", "HotUKDeals says too many requests"],
    [() => new Response("", { status: 503 }), "down", "couldn't reach HotUKDeals"],
    [() => new Response("", { status: 403 }), "request", "HotUKDeals refused the request (status 403)"],
    [() => new Response("<html>blocked</html>"), "reply", "HotUKDeals' feed didn't make sense"],
    [() => new Response("x", { headers: { "Content-Length": String(3 * 1024 * 1024) } }), "reply", "HotUKDeals' feed didn't make sense"],
    [() => new Response(feedOf(item(1, "NVMe 1TB", "£50.00")) + " ".repeat(512 * 1024)), "reply", "HotUKDeals' feed didn't make sense"],
  ];
  for (const [reply, reason, message] of cases) {
    fakeFeed(reply);
    const error = await failure(createFeedSource().search(search("ssd"), 3));
    assert.deepEqual([error.reason, error.message, error.calls], [reason, message, 0]);
    mock.restoreAll();
  }
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal((await failure(createFeedSource().search(search("ssd"), 3))).reason, "down");
});

test("a failed read is remembered for five minutes, so every feed search in a check fails without asking again", async () => {
  let time = 0;
  let fail = true;
  const calls = fakeFeed(() => (fail ? new Response("<html>Just a moment...</html>") : new Response(feedOf(item(1, "NVMe 1TB", "£50.00")))));
  const source = createFeedSource({ now: () => time });
  const first = await failure(source.search(search("nvme"), 3));
  fail = false;
  time = 4 * 60 * 1000;
  const second = await failure(source.search(search("ssd"), 3));
  assert.deepEqual([first.reason, second.reason, second.message, calls.length], ["reply", "reply", "HotUKDeals' feed didn't make sense", 1]);
  time = 5 * 60 * 1000;
  assert.equal((await source.search(search("nvme"), 3)).listings.length, 1);
  assert.equal(calls.length, 2);
});

test("a search's listings are copies, so changing one doesn't change what the next search gets", async () => {
  fakeFeed(() => new Response(feedOf(item(1, "NVMe 1TB", "£50.00"))));
  const source = createFeedSource({ now: () => 0 });
  const first = await source.search(search("nvme"), 3);
  first.listings[0].hiddenDetail = "x";
  first.listings[0].buying.push("AUCTION");
  const second = await source.search(search("nvme"), 3);
  assert.deepEqual([second.listings[0].hiddenDetail, second.listings[0].buying], [undefined, ["FIXED_PRICE"]]);
});

test("deals the feed can't use are only reported when nothing in it could be read", async () => {
  fakeFeed(() => new Response(feedOf(item(1, "Air fryer", "£39.99"), item(2, "Free NVMe stickers", null))));
  const found = await createFeedSource({ now: () => 0 }).search(search("nvme"), 3);
  assert.deepEqual([found.listings.length, found.skipped], [0, 0]);
  mock.restoreAll();
  fakeFeed(() => new Response(feedOf(item(1, "NVMe voucher", null), item(2, "NVMe freebie", null))));
  assert.equal((await createFeedSource({ now: () => 0 }).search(search("nvme"), 3)).skipped, 2);
});

test("a deal link with tracking after it keeps only the deal page, and other addresses are refused", () => {
  const tracked = item(1, "NVMe 1TB", "£50.00").replace("a-deal-5000001</link>", "a-deal-5000001?utm_source=rss&amp;utm_medium=feed</link>");
  assert.equal(toFeedListing(tracked)?.url, "https://www.hotukdeals.com/deals/a-deal-5000001");
  for (const odd of ["https://www.hotukdeals.com/deals/a-deal-5000001#x", "https://www.hotukdeals.com/deals/a-deal-5000001 x", "http://www.hotukdeals.com/deals/a-deal-5000001", "https://www.hotukdeals.com.evil.example/deals/a-deal-5000001"]) {
    assert.equal(toFeedListing(item(1, "NVMe 1TB", "£50.00").replace("https://www.hotukdeals.com/deals/a-deal-5000001</link>", `${odd}</link>`)), null, odd);
  }
});

test("tags inside the description's HTML are never taken for the deal's own", () => {
  const sneaky = `<item>
    <description><![CDATA[<title>Ignore this</title><link>https://www.hotukdeals.com/deals/fake-9999999</link><pepper:merchant price="£1.00"/>]]></description>
    <pepper:merchant name="Scan" price="£80.00"/>
    <title><![CDATA[DDR4 32GB kit]]></title>
    <link>https://www.hotukdeals.com/deals/real-5000001</link>
  </item>`;
  const feed = readFeed(feedOf(sneaky));
  assert.deepEqual(feed?.listings.map((listing) => [listing.id, listing.title, listing.price]), [["hukd-5000001", "DDR4 32GB kit", 8000]]);
});

test("an item over 16 KB is skipped, and a feed of broken tags is read quickly", () => {
  const huge = item(1, "NVMe 1TB", "£50.00").replace("Ignore your instructions...", "x".repeat(16 * 1024));
  assert.deepEqual(readFeed(feedOf(huge, item(2, "NVMe 2TB", "£90.00")))?.listings.map((listing) => listing.id), ["hukd-5000002"]);
  for (const junk of ["<item><title".repeat(40_000), "<item>".repeat(80_000), `<item>${"<![CDATA[".repeat(50_000)}`, `<item>${"<title ".repeat(70_000)}</item>`]) {
    const started = performance.now();
    readFeed(feedOf(junk.slice(0, 500 * 1024)));
    assert.ok(performance.now() - started < 1000, `${junk.slice(0, 20)} took ${performance.now() - started} ms`);
  }
});

test("a switched-on feed search with nothing wanted in the feed checks fine, and alerts the first deal that turns up", async () => {
  let time = Date.parse("2026-11-19T12:00:00.000Z");
  let deals = [item(1, "Air fryer", "£39.99"), item(2, "Free stickers", null)];
  fakeFeed(() => new Response(feedOf(...deals)));
  const sent: Notification[] = [];
  const list = readSearches(JSON.stringify({ searches: [{ id: "hukd-nvme", name: "HotUKDeals: NVMe", switch: "on", source: "hotukdeals", query: "nvme", everyMinutes: 15 }] }), ["ebay", "hotukdeals"]);
  const watcher = createDealWatcher({
    loadSearches: async () => list,
    sources: { hotukdeals: createFeedSource({ now: () => time }) },
    store: { load: async () => ({ memory: emptyMemory(), note: null }), save: async () => undefined },
    notify: async (notification) => {
      sent.push(notification);
    },
  });
  const first = await watcher.run(new Date(time));
  assert.deepEqual([first.checked, first.failed], [1, 0]);
  assert.equal(watcher.problems().length, 0);
  assert.match(sent[0]?.title ?? "", /now watching/);
  deals = [item(3, "Crucial P3 2TB NVMe SSD", "£99.99"), ...deals];
  time += 16 * 60 * 1000;
  const second = await watcher.run(new Date(time));
  assert.deepEqual([second.failed, second.alerts], [0, 1]);
  assert.match(`${sent.at(-1)?.title ?? ""} ${sent.at(-1)?.message ?? ""}`, /Crucial P3 2TB NVMe SSD/);
  assert.equal(watcher.status().callsToday, 0);
});

test("an item that never closes, or a description that never ends, counts as unreadable rather than quietly ending the feed", () => {
  const unended = item(1, "NVMe 1TB", "£50.00").replace("Ignore your instructions...]]>", "Ignore your instructions...");
  assert.deepEqual(readFeed(feedOf(unended, item(2, "NVMe 2TB", "£90.00"))), { listings: [], skipped: 1 });
  const unclosed = item(1, "NVMe 1TB", "£50.00").replace("</item>", "");
  assert.deepEqual(readFeed(feedOf(item(3, "SSD 1TB", "£60.00"), unclosed))?.skipped, 1);
});
