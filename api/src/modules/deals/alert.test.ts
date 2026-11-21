import assert from "node:assert/strict";
import { test } from "node:test";
import { safeLink } from "../notify/notifier.js";
import { capNotification, dealNotification, digestNotification, endingNotification, money, moreNotification, priceLine, timeLeft, watchingNotification } from "./alert.js";
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
  const sellerLine = (overrides: Partial<Listing>) => dealNotification(search(), listing(overrides), null, null, now, false).message.split("\n").find((line) => line.startsWith("Seller"));
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

test("the seller line says business or private when eBay says which", () => {
  const sellerLine = (overrides: Partial<Listing>) => dealNotification(search(), listing(overrides), null, null, now, false).message.split("\n").find((line) => line.includes("eller"));
  assert.equal(sellerLine({ sellerType: "business" }), "Business seller: 99.4% positive from 1,234 ratings.");
  assert.equal(sellerLine({ sellerType: "private" }), "Private seller: 99.4% positive from 1,234 ratings.");
  assert.equal(sellerLine({ sellerType: "private", sellerPercent: null }), "Private seller.");
  assert.equal(sellerLine({ sellerType: null, sellerPercent: null }), undefined);
});

test("with a guide price the alert says how far under or over it the total is", () => {
  const guideLine = (settings: Record<string, unknown>, overrides: Partial<Listing>) => dealNotification(search(settings), listing(overrides), null, null, now, false).message.split("\n").find((line) => line.includes("guide price"));
  assert.equal(guideLine({ guidePrice: 130 }, { price: 9500, postage: 699 }), "21% under your £130.00 guide price.");
  assert.equal(guideLine({ guidePrice: 95 }, { price: 9500, postage: 699 }), "8% over your £95.00 guide price.");
  assert.equal(guideLine({ guidePrice: 101.99 }, { price: 9500, postage: 699 }), "Right on your £101.99 guide price.");
  assert.equal(guideLine({}, {}), undefined);
});

test("a guide price set more than 30 days ago is flagged as possibly out of date", () => {
  const line = (guideDate: string) => dealNotification(search({ guidePrice: 130, guideDate }), listing(), null, null, now, false).message.split("\n")[3];
  assert.equal(line("2026-11-01"), "21% under your £130.00 guide price.");
  assert.equal(line("2026-10-20"), "21% under your £130.00 guide price.");
  assert.equal(line("2026-10-18"), "21% under your £130.00 guide price (set 2026-10-18, so check it's still right).");
});

test("a great deal is sent at high priority, one over the guide price at low, and the rest at the default", () => {
  const priority = (settings: Record<string, unknown>, price: number) => dealNotification(search(settings), listing({ price, postage: 0 }), null, null, now, false).priority;
  assert.equal(priority({ guidePrice: 100 }, 8000), 4);
  assert.equal(priority({ guidePrice: 100 }, 9000), undefined);
  assert.equal(priority({ guidePrice: 100 }, 10500), 2);
  assert.equal(priority({}, 100), undefined);
  assert.ok(!Object.hasOwn(dealNotification(search(), listing(), null, null, now, false), "priority"));
});

test("a unit search adds a price per unit, and says the size came from the title", () => {
  const kit = listing({ title: "Corsair Vengeance 32GB (2x16GB) DDR4", price: 4500, postage: 499 });
  assert.equal(dealNotification(search({ unit: "GB" }), kit, null, null, now, false).message.split("\n")[3], "About £1.56 per GB (32 GB, read from the title).");
  const drive = listing({ title: "Crucial MX500 500GB SSD", price: 3000, postage: 0 });
  assert.equal(dealNotification(search({ unit: "TB" }), drive, null, null, now, false).message.split("\n")[3], "About £60.00 per TB (0.5 TB, read from the title).");
  assert.ok(!dealNotification(search({ unit: "GB" }), listing({ title: "DDR4 desktop memory" }), null, null, now, false).message.includes(" per GB"));
});

test("the alert says whether eBay's item details back the listing up, and lists what to check first", () => {
  const message = (overrides: Partial<Listing>, settings: Record<string, unknown> = {}) => dealNotification(search(settings), listing(overrides), null, null, now, false).message;
  assert.ok(message({ detailsMatch: true }).includes("\neBay's item details match what you asked for.\n"));
  assert.ok(message({ detailsMatch: false }).includes("\neBay's item details don't confirm what you asked for.\n"));
  assert.ok(!message({ detailsMatch: null }).includes("item details"));
  assert.equal(message({ sellerFeedback: 3, variations: true }, { guidePrice: 400 }).split("\n").at(-1), "Check first: the seller has under 10 ratings; it's under half your guide price; the listing has more than one option, so this may be its lowest price.");
  assert.ok(!message({}).includes("Check first"));
  assert.ok(!message({ postage: null }).includes("Check first"));
});

test("a full alert keeps its lines in a fixed order", () => {
  const all = listing({ title: "Corsair 32GB (2x16GB) DDR4", price: 4000, postage: 500, sellerType: "private", sellerFeedback: 4, detailsMatch: true });
  const other = listing({ id: "v1|110000000002|0", price: 6000, postage: 0 });
  const sent = dealNotification(search({ guidePrice: 60, unit: "GB" }), all, { place: 1, of: 2, other: 6000 }, null, now, false);
  assert.deepEqual(sent.message.split("\n"), [
    "Corsair 32GB (2x16GB) DDR4",
    "£40.00 + £5.00 postage = £45.00",
    "Used. Buy it now.",
    "25% under your £60.00 guide price.",
    "About £1.41 per GB (32 GB, read from the title).",
    "Cheapest of 2 matches right now; the next is £60.00.",
    "eBay's item details match what you asked for.",
    "Private seller: 99.4% positive from 4 ratings.",
    "Check first: the seller has under 10 ratings.",
  ]);
  assert.equal(sent.priority, 4);
  assert.equal(other.price, 6000);
});

test("an alert never carries where the seller is or the listing's description", () => {
  const sent = dealNotification(search({ guidePrice: 200, unit: "GB" }), listing({ city: "Sometown", postcode: "ZZ9***", summary: "A PRIVATE SUMMARY", ref: "v1|110000000001|0" }), null, null, now, false);
  for (const hidden of ["Sometown", "ZZ9", "PRIVATE SUMMARY", "v1|"]) assert.ok(!JSON.stringify(sent).includes(hidden), hidden);
});

test("an ending-soon alert gives the bid, the time left and the link, at high priority", () => {
  const auction = listing({ buying: ["AUCTION"], price: 4100, postage: 699, bids: 7, endsAt: "2026-11-18T12:25:00.000Z", sellerType: "private" });
  assert.deepEqual(endingNotification(search({ buying: ["auction"], guidePrice: 100 }), auction, now, false), {
    title: "Ending soon: OptiPlex 7070 SFF",
    message: "Dell OptiPlex 7070 SFF i5-9500 16GB RAM 256GB SSD\nCurrent bid £41.00 + £6.99 postage = £47.99\nUsed. Auction, 7 bids so far, ends in 25m.\nThe bid so far is 52% under your £100.00 guide price.\nPrivate seller: 99.4% positive from 1,234 ratings.",
    tags: "hourglass_flowing_sand",
    click: "https://www.ebay.co.uk/itm/110000000001",
    priority: 4,
  });
  assert.equal(endingNotification(search({ buying: ["auction"] }), auction, now, true).title, "Sandbox ending soon: OptiPlex 7070 SFF");
});

test("an auction's bid is never judged against the guide price as if it were the price", () => {
  const bid = listing({ buying: ["AUCTION"], price: 99, postage: 0, bids: 0, endsAt: "2026-11-24T12:00:00.000Z", title: "Corsair 32GB (2x16GB) DDR4" });
  const sent = dealNotification(search({ buying: ["auction", "buy it now"], guidePrice: 120, unit: "GB" }), bid, null, null, now, false);
  assert.ok(!sent.message.includes("guide price") && !sent.message.includes("per GB") && !sent.message.includes("Check first"), sent.message);
  assert.ok(!Object.hasOwn(sent, "priority"));
  const both = listing({ buying: ["AUCTION", "FIXED_PRICE"], price: 9000, postage: 0 });
  assert.ok(dealNotification(search({ buying: ["auction", "buy it now"], guidePrice: 120 }), both, null, null, now, false).message.includes("25% under your £120.00 guide price."));
});

test("an ending-soon alert words the bid against the guide price as a bid, under, over or level", () => {
  const line = (price: number) => endingNotification(search({ buying: ["auction"], guidePrice: 100 }), listing({ buying: ["AUCTION"], price, postage: 0, endsAt: "2026-11-18T12:25:00.000Z" }), now, false).message.split("\n")[3];
  assert.equal(line(8040), "The bid so far is 19% under your £100.00 guide price.");
  assert.equal(line(10040), "The bid so far is 1% over your £100.00 guide price.");
  assert.equal(line(10000), "The bid so far is right on your £100.00 guide price.");
  assert.ok(!endingNotification(search({ buying: ["auction"] }), listing({ buying: ["AUCTION"] }), now, false).message.includes("guide"));
});

test("the digest gives the best match for each part type, in part type order: the furthest under its guide price, or else the cheapest", () => {
  const ram = search({ id: "ram", name: "DDR4 RAM", group: "ram", query: "ddr4 32gb", guidePrice: 100 });
  const ssd = search({ id: "nvme", name: "NVMe 1TB", group: "storage", query: "nvme 1tb", guidePrice: 60 });
  const cpu = search({ id: "cpu", name: "Ryzen 5 5600", group: "cpu", query: "ryzen 5 5600" });
  const own = search({ id: "own", name: "Own search", query: "something" });
  const message = digestNotification(
    [
      { search: ram, listings: [listing({ title: "Corsair Vengeance 2x16GB DDR4 3200", price: 8000, postage: 0 }), listing({ title: "Crucial 2x16GB DDR4 3200 kit with a very long title indeed", price: 7000, postage: 500 })] },
      { search: ssd, listings: [listing({ title: "Samsung 980 1TB", price: 7000, postage: 0 })] },
      { search: cpu, listings: [listing({ title: "AMD Ryzen 5 5600 boxed", price: 9000, postage: 0 }), listing({ title: "AMD Ryzen 5 5600 tray", price: 8000, postage: 0 })] },
      { search: own, listings: [listing({ title: "Something", price: 500, postage: 0 })] },
    ],
    false,
  );
  assert.deepEqual(message, {
    title: "Deal digest",
    tags: "newspaper",
    message: [
      "6 matches across 4 part types. The best of each:",
      "CPUs: 2 matches, none under guide. Cheapest: AMD Ryzen 5 5600 tray, £80.00 (Ryzen 5 5600).",
      "RAM: Crucial 2x16GB DDR4 3200 kit with a very lon\u2026, £75.00, 25% under guide (DDR4 RAM).",
      "Storage: 1 match, none under guide. Cheapest: Samsung 980 1TB, £70.00 (NVMe 1TB).",
      "No part type: 1 match, none under guide. Cheapest: Something, £5.00 (Own search).",
    ].join("\n"),
  });
});

test("the digest ends with the searches that need a look, by name, in plain words, five at most", () => {
  const ram = search({ id: "ram", name: "DDR4 RAM", group: "ram", query: "ddr4 32gb", guidePrice: 100 });
  const entries = [{ search: ram, listings: [listing({ title: "Kit", price: 5000, postage: 0 })] }];
  assert.equal(digestNotification(entries, false, []).message, "1 match across 1 part type. The best of each:\nRAM: Kit, £50.00, 50% under guide (DDR4 RAM).");
  assert.equal(
    digestNotification(entries, false, [{ name: "Quadro P620", kinds: ["incomplete", "mostlyHidden"] }, { name: "Old search", kinds: ["noMatch"] }]).message,
    "1 match across 1 part type. The best of each:\nRAM: Kit, £50.00, 50% under guide (DDR4 RAM).\nNeeds a look: Quadro P620 (reads only part of what eBay has, mostly hides junk); Old search (no match for a week).",
  );
  const seven = Array.from({ length: 7 }, (_, n) => ({ name: `Search ${n + 1}`, kinds: ["noMatch"] }));
  assert.match(digestNotification(entries, false, seven).message, /\nNeeds a look: Search 1 \(no match for a week\); Search 2 .*; Search 5 \(no match for a week\) and 2 more\.$/);
  assert.equal(digestNotification(entries, false, [{ name: "Unknown", kinds: ["nothingFound", "somethingNew"] }]).message, "1 match across 1 part type. The best of each:\nRAM: Kit, £50.00, 50% under guide (DDR4 RAM).");
  assert.equal(digestNotification([], false, [{ name: "Old search", kinds: ["noMatch"] }]).message, "Nothing to report: every search is snoozed, switched off or not checked in the last six hours.\nNeeds a look: Old search (no match for a week).");
  assert.equal(digestNotification([{ search: ram, listings: [] }], false, [{ name: "Old search", kinds: ["noMatch"] }]).message, "Nothing matches right now.\nNeeds a look: Old search (no match for a week).");
});

test("the digest leaves out auctions and listings whose option isn't known, and says when there's nothing", () => {
  const ram = search({ id: "ram", name: "DDR4 RAM", group: "ram", query: "ddr4 32gb", guidePrice: 100, buying: ["buy it now", "auction"] });
  const message = digestNotification([{ search: ram, listings: [listing({ title: "Bid", price: 100, buying: ["AUCTION"] }), listing({ title: "Options", price: 200, variations: true }), listing({ title: "Fitted", price: 5000, postage: 0, variations: true, option: "Capacity: 32GB" })] }], true);
  assert.deepEqual(message, { title: "Deal digest (sandbox)", tags: "newspaper", message: "1 match across 1 part type. The best of each:\nRAM: Fitted, £50.00, 50% under guide (DDR4 RAM)." });
  assert.equal(digestNotification([{ search: ram, listings: [listing({ title: "Bid", buying: ["AUCTION"] })] }], false).message, "Nothing matches right now.");
  assert.equal(digestNotification([], false).message, "Nothing to report: every search is snoozed, switched off or not checked in the last six hours.");
});

test("in the digest a match at exactly its guide price isn't under it, and part types come in the hub page's order", () => {
  const at = search({ id: "psu", name: "550W PSU", group: "power supply", query: "550w psu", guidePrice: 50 });
  assert.equal(digestNotification([{ search: at, listings: [listing({ title: "Corsair CX550", price: 5000, postage: 0 })] }], false).message, "1 match across 1 part type. The best of each:\nPower supplies: 1 match, none under guide. Cheapest: Corsair CX550, £50.00 (550W PSU).");
  const one = (group: string) => ({ search: search({ id: group.replace(" ", "-"), name: group, group, query: group }), listings: [listing({ title: group, price: 1000, postage: 0 })] });
  const lines = digestNotification(["ups", "graphics", "cpu", "server", "whole pc", "expansion", "network"].map(one), false).message.split("\n").slice(1);
  assert.deepEqual(lines.map((line) => line.split(":")[0]), ["Whole PCs", "Servers", "CPUs", "Graphics cards", "Network", "Expansion cards", "UPS"]);
});
