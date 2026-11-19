import assert from "node:assert/strict";
import { test } from "node:test";
import { safeLink } from "../notify/notifier.js";
import { capNotification, dealNotification, money, moreNotification, priceLine, timeLeft, watchingNotification } from "./alert.js";
import { readSearches, type Search } from "./searches.js";
import type { Listing } from "./source.js";

const now = new Date("2026-11-18T12:00:00.000Z");

function search(overrides: Record<string, unknown> = {}): Search {
  const text = JSON.stringify({ searches: [{ id: "optiplex", name: "OptiPlex 7070 SFF", switch: "on", query: "optiplex 7070 sff", ...overrides }] });
  return readSearches(text, ["ebay"]).searches[0];
}

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "v1|110000000001|0",
    title: "Dell OptiPlex 7070 SFF i5-9500 16GB RAM 256GB SSD",
    price: 9500,
    postage: 699,
    condition: "Used",
    conditionId: "3000",
    buying: ["FIXED_PRICE"],
    country: "GB",
    listedAt: "2026-11-18T11:00:00.000Z",
    endsAt: null,
    bids: null,
    sellerPercent: 99.4,
    sellerFeedback: 1234,
    url: "https://www.ebay.co.uk/itm/110000000001",
    ...overrides,
  };
}

test("money is pounds and pence, always two decimals", () => {
  assert.equal(money(9500), "£95.00");
  assert.equal(money(699), "£6.99");
  assert.equal(money(5), "£0.05");
  assert.equal(money(0), "£0.00");
  assert.equal(money(100501), "£1005.01");
});

test("the price line shows postage and the total when postage is known", () => {
  assert.equal(priceLine(listing()), "£95.00 + £6.99 postage = £101.99");
  assert.equal(priceLine(listing({ postage: 0 })), "£95.00 with free postage");
  assert.equal(priceLine(listing({ postage: null })), "£95.00, postage not shown");
});

test("time left is in the two biggest units", () => {
  assert.equal(timeLeft("2026-11-18T14:10:00.000Z", now), "2h 10m");
  assert.equal(timeLeft("2026-11-18T12:45:30.000Z", now), "45m");
  assert.equal(timeLeft("2026-11-21T16:20:00.000Z", now), "3d 4h");
  assert.equal(timeLeft("2026-11-18T13:00:00.000Z", now), "1h 0m");
  assert.equal(timeLeft("2026-11-18T12:00:30.000Z", now), "under a minute");
  assert.equal(timeLeft("2026-11-18T11:00:00.000Z", now), "under a minute");
  assert.equal(timeLeft("not a date", now), "under a minute");
});

test("a new deal's message has the title, price, condition, standing and seller, and opens the listing", () => {
  assert.deepEqual(dealNotification(search(), listing(), { place: 1, of: 14, other: 11000 }, null, now, false), {
    title: "Deal: OptiPlex 7070 SFF",
    message: [
      "Dell OptiPlex 7070 SFF i5-9500 16GB RAM 256GB SSD",
      "£95.00 + £6.99 postage = £101.99",
      "Used. Buy it now.",
      "Cheapest of 14 matches right now; the next is £110.00.",
      "Seller: 99.4% positive from 1,234 ratings.",
    ].join("\n"),
    tags: "moneybag",
    click: "https://www.ebay.co.uk/itm/110000000001",
  });
});

test("lines with nothing to say are left out", () => {
  const bare = listing({ condition: null, sellerPercent: null, sellerFeedback: null, postage: null });
  assert.equal(dealNotification(search(), bare, null, null, now, false).message, "Dell OptiPlex 7070 SFF i5-9500 16GB RAM 256GB SSD\n£95.00, postage not shown\nBuy it now.");
});

test("a listing that takes offers says so", () => {
  const message = dealNotification(search(), listing({ buying: ["FIXED_PRICE", "BEST_OFFER"] }), null, null, now, false).message;
  assert.ok(message.includes("Used. Buy it now, or make an offer."));
});

test("the standing line reads naturally in every place", () => {
  const line = (place: number, of: number, other: number) => dealNotification(search(), listing(), { place, of, other }, null, now, false).message.split("\n")[3];
  assert.equal(line(1, 2, 12000), "Cheapest of 2 matches right now; the next is £120.00.");
  assert.equal(line(1, 5, 10199), "Joint cheapest of 5 matches right now.");
  assert.equal(line(2, 14, 8900), "2nd cheapest of 14 matches right now; the cheapest is £89.00.");
  assert.equal(line(3, 14, 8900), "3rd cheapest of 14 matches right now; the cheapest is £89.00.");
  assert.equal(line(4, 14, 8900), "4th cheapest of 14 matches right now; the cheapest is £89.00.");
  assert.equal(line(11, 30, 8900), "11th cheapest of 30 matches right now; the cheapest is £89.00.");
  assert.equal(line(12, 30, 8900), "12th cheapest of 30 matches right now; the cheapest is £89.00.");
  assert.equal(line(13, 30, 8900), "13th cheapest of 30 matches right now; the cheapest is £89.00.");
  assert.equal(line(21, 30, 8900), "21st cheapest of 30 matches right now; the cheapest is £89.00.");
  assert.equal(line(22, 30, 8900), "22nd cheapest of 30 matches right now; the cheapest is £89.00.");
  assert.equal(line(101, 200, 8900), "101st cheapest of 200 matches right now; the cheapest is £89.00.");
  assert.equal(line(111, 200, 8900), "111th cheapest of 200 matches right now; the cheapest is £89.00.");
});

test("the seller line copes with one rating and with no count", () => {
  const sellerLine = (overrides: Partial<Listing>) => dealNotification(search(), listing(overrides), null, null, now, false).message.split("\n").at(-1);
  assert.equal(sellerLine({ sellerPercent: 100, sellerFeedback: 1 }), "Seller: 100% positive from 1 rating.");
  assert.equal(sellerLine({ sellerPercent: 98.5, sellerFeedback: null }), "Seller: 98.5% positive.");
  assert.equal(sellerLine({ sellerPercent: 0, sellerFeedback: 0 }), "Seller: 0% positive from 0 ratings.");
  assert.equal(sellerLine({ sellerPercent: 97, sellerFeedback: 1234567 }), "Seller: 97% positive from 1,234,567 ratings.");
});

test("an auction's message gives the bid, the bids so far and how long is left", () => {
  const auction = listing({ buying: ["AUCTION"], price: 4000, bids: 3, endsAt: "2026-11-18T14:10:00.000Z" });
  const lines = dealNotification(search({ buying: ["auction"] }), auction, null, null, now, false).message.split("\n");
  assert.equal(lines[1], "Current bid £40.00 + £6.99 postage = £46.99");
  assert.equal(lines[2], "Used. Auction, 3 bids so far, ends in 2h 10m.");
  const quiet = listing({ buying: ["AUCTION"], price: 4000, bids: 1, endsAt: null, condition: null });
  assert.equal(dealNotification(search(), quiet, null, null, now, false).message.split("\n")[2], "Auction, 1 bid so far.");
  const unknown = listing({ buying: ["AUCTION"], bids: null, endsAt: null });
  assert.equal(dealNotification(search(), unknown, null, null, now, false).message.split("\n")[2], "Used. Auction.");
});

test("an auction with a buy-it-now price reads as buy it now", () => {
  const both = listing({ buying: ["FIXED_PRICE", "AUCTION"] });
  assert.ok(dealNotification(search(), both, null, null, now, false).message.includes("\n£95.00 + £6.99 postage = £101.99\nUsed. Buy it now."));
});

test("a price drop says what it was and what it is now, with its own title and tag", () => {
  const dropped = dealNotification(search(), listing({ price: 8000 }), null, 9500, now, false);
  assert.equal(dropped.title, "Price drop: OptiPlex 7070 SFF");
  assert.equal(dropped.tags, "chart_with_downwards_trend");
  assert.equal(dropped.message.split("\n")[1], "Was £95.00, now £80.00 + £6.99 postage = £86.99");
  assert.equal(dropped.click, "https://www.ebay.co.uk/itm/110000000001");
});

test("sandbox messages say sandbox in the title, so made-up listings can't be mistaken for real ones", () => {
  assert.equal(dealNotification(search(), listing(), null, null, now, true).title, "Sandbox deal: OptiPlex 7070 SFF");
  assert.equal(dealNotification(search(), listing(), null, 9900, now, true).title, "Sandbox price drop: OptiPlex 7070 SFF");
  assert.equal(moreNotification(search(), [listing(), listing()], true).title, "Sandbox deals: 2 more for OptiPlex 7070 SFF");
  assert.equal(watchingNotification([], true).title, "Deal watcher: now watching (sandbox)");
});

test("every title is plain ASCII, whatever the listing says, because it travels in an HTTP header", () => {
  const nasty = listing({ title: "£££ \u{1F525} FIRE SALE\r\nX-Priority: 5", condition: "Uséd" });
  const notifications = [
    dealNotification(search(), nasty, { place: 1, of: 3, other: 100 }, null, now, false),
    dealNotification(search(), nasty, null, 9900, now, true),
    moreNotification(search(), [nasty, nasty], false),
    watchingNotification([{ name: search().name, count: 2, cheapest: 100 }], false),
    capNotification(60),
  ];
  for (const notification of notifications) {
    assert.match(notification.title, /^[\x20-\x7E]+$/);
    assert.match(notification.tags, /^[a-z_]+$/);
    assert.doesNotThrow(() => new Headers({ Title: notification.title, Tags: notification.tags }));
  }
});

test("a deal's link is always one the notifier will send", () => {
  const notification = dealNotification(search(), listing(), null, null, now, false);
  assert.equal(safeLink(notification.click), "https://www.ebay.co.uk/itm/110000000001");
});

test("a deal message stays well inside ntfy's size limit even with the longest title", () => {
  const long = listing({ title: "\u{1F525}".repeat(100), condition: "x".repeat(40), sellerFeedback: 999_999_999 });
  const message = dealNotification(search({ name: "N".repeat(40) }), long, { place: 111, of: 5000, other: 999_999_999 }, 999_999_999, now, true).message;
  assert.ok(Buffer.byteLength(message) < 1000, String(Buffer.byteLength(message)));
});

test("the roll-up lists the first five by total price and counts the rest", () => {
  const rest = Array.from({ length: 8 }, (_, i) => listing({ id: `v1|${i}|0`, title: `Listing ${i + 1}`, price: 9000 + i * 100, postage: 0 }));
  assert.deepEqual(moreNotification(search(), rest, false), {
    title: "Deals: 8 more for OptiPlex 7070 SFF",
    message: ["£90.00: Listing 1", "£91.00: Listing 2", "£92.00: Listing 3", "£93.00: Listing 4", "£94.00: Listing 5", "And 3 more."].join("\n"),
    tags: "moneybag",
  });
});

test("a short roll-up lists everything and carries no link", () => {
  const notification = moreNotification(search(), [listing({ title: "Only one", postage: 500 })], false);
  assert.equal(notification.title, "Deals: 1 more for OptiPlex 7070 SFF");
  assert.equal(notification.message, "£100.00: Only one");
  assert.equal(notification.click, undefined);
});

test("a roll-up stays inside ntfy's size limit", () => {
  const rest = Array.from({ length: 200 }, () => listing({ title: "\u{1F525}".repeat(100) }));
  assert.ok(Buffer.byteLength(moreNotification(search(), rest, false).message) < 4096);
});

test("the watching message has one line per search and says what happens next", () => {
  const notification = watchingNotification(
    [
      { name: "OptiPlex 7070 SFF", count: 37, cheapest: 8900 },
      { name: "EliteDesk 800 G4", count: 1, cheapest: 12000 },
      { name: "DDR4 RAM", count: 0, cheapest: null },
    ],
    false,
  );
  assert.deepEqual(notification, {
    title: "Deal watcher: now watching",
    message: ["OptiPlex 7070 SFF: 37 matches now, from £89.00.", "EliteDesk 800 G4: 1 match now, from £120.00.", "DDR4 RAM: nothing matches yet.", "You'll hear about new ones as they appear."].join("\n"),
    tags: "eyes",
  });
});

test("the watching message stays inside ntfy's size limit with 50 searches", () => {
  const started = Array.from({ length: 50 }, () => ({ name: "N".repeat(40), count: 12345, cheapest: 999_999_999 }));
  assert.ok(Buffer.byteLength(watchingNotification(started, true).message) < 4096);
});

test("the paused message names the limit and says nothing is lost", () => {
  assert.deepEqual(capNotification(60), {
    title: "Deal watcher: alerts paused",
    message: "Today's limit of 60 deal alerts is used up. Alerts start again tomorrow, with anything still unseen.",
    tags: "zzz",
  });
});