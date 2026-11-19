import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPhrase, isAuctionOnly, matches, plainWords, standing, totalPrice } from "./match.js";
import { readSearches, type Search } from "./searches.js";
import type { Listing } from "./source.js";

const now = new Date("2026-11-18T12:00:00.000Z");

function search(overrides: Record<string, unknown> = {}): Search {
  const text = JSON.stringify({ searches: [{ id: "optiplex", name: "OptiPlex", switch: "on", query: "optiplex 7070 sff", ...overrides }] });
  return readSearches(text, ["ebay"]).searches[0];
}

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "v1|110000000001|0",
    title: "Dell OptiPlex 7070 SFF i5-9500 16GB RAM 256GB SSD Win 11",
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

test("a plain search matches a plain listing", () => {
  assert.equal(matches(search(), listing(), now), true);
});

test("plainWords lowers the case, drops accents and turns everything else into single spaces", () => {
  assert.equal(plainWords("Dell OptiPlex-7070/SFF  (i5)"), " dell optiplex 7070 sff i5 ");
  assert.equal(plainWords("Café CRÈME"), " cafe creme ");
  assert.equal(plainWords("NO RAM/HDD!!"), " no ram hdd ");
  assert.equal(plainWords(""), "  ");
  assert.equal(plainWords("\u{1F525}\u{1F525}"), "  ");
});

test("a phrase matches whole words only, whatever the case or punctuation", () => {
  assert.equal(hasPhrase("Dell OptiPlex 7070 SFF NO RAM/HDD", "no ram"), true);
  assert.equal(hasPhrase("Dell OptiPlex 7070 SFF *FAULTY*", "faulty"), true);
  assert.equal(hasPhrase("Dell OptiPlex 7070 SFF", "SFF"), true);
  assert.equal(hasPhrase("Dell OptiPlex 7070 SFF", "optiplex 7070"), true);
  assert.equal(hasPhrase("Corsair SO-DIMM 2x16GB", "so dimm"), true);
  assert.equal(hasPhrase("Corsair SO-DIMM 2x16GB", "so-dimm"), true);
});

test("a phrase never matches inside a longer word", () => {
  assert.equal(hasPhrase("Aluminium frame for Dell", "ram"), false);
  assert.equal(hasPhrase("Dell OptiPlex 70700", "7070"), false);
  assert.equal(hasPhrase("Dell OptiPlex 17070", "7070"), false);
  assert.equal(hasPhrase("Spare keys", "spares"), false);
  assert.equal(hasPhrase("Programme", "ram"), false);
  assert.equal(hasPhrase("no rambling", "no ram"), false);
});

test("a phrase ending in * matches any word that starts that way", () => {
  assert.equal(hasPhrase("For spares or repairs", "repair*"), true);
  assert.equal(hasPhrase("Needs repairing", "repair*"), true);
  assert.equal(hasPhrase("Repair needed", "repair*"), true);
  assert.equal(hasPhrase("Unrepaired", "repair*"), false);
  assert.equal(hasPhrase("Dell barebones unit", "barebone*"), true);
  assert.equal(hasPhrase("no ramps", "no ram*"), true);
});

test("words must be in the phrase's order and next to each other", () => {
  assert.equal(hasPhrase("RAM not included, no HDD", "no ram"), false);
  assert.equal(hasPhrase("no hdd or ram", "no ram"), false);
});

test("an empty phrase matches nothing", () => {
  assert.equal(hasPhrase("anything at all", ""), false);
  assert.equal(hasPhrase("anything at all", "***"), false);
  assert.equal(hasPhrase("anything at all", " - "), false);
});

test("hidden characters in a title can't hide an excluded word", () => {
  assert.equal(hasPhrase("Dell OptiPlex FAULTY\u00A0unit", "faulty"), true);
  assert.equal(hasPhrase("Dell OptiPlex FÁULTY", "faulty"), true);
  assert.equal(hasPhrase("Dell OptiPlex ＦＡＵＬＴＹ", "faulty"), true);
});

test("any excluded word drops the listing", () => {
  const withExcludes = search({ exclude: ["faulty", "spares", "no ram"] });
  assert.equal(matches(withExcludes, listing(), now), true);
  assert.equal(matches(withExcludes, listing({ title: "Dell OptiPlex 7070 SFF Faulty" }), now), false);
  assert.equal(matches(withExcludes, listing({ title: "Dell OptiPlex 7070 SFF for SPARES" }), now), false);
  assert.equal(matches(withExcludes, listing({ title: "Dell OptiPlex 7070 SFF - No RAM, no SSD" }), now), false);
});

test("every must-include word has to be there", () => {
  const strict = search({ mustInclude: ["7070", "i5"] });
  assert.equal(matches(strict, listing(), now), true);
  assert.equal(matches(strict, listing({ title: "Dell OptiPlex 7060 SFF i5" }), now), false);
  assert.equal(matches(strict, listing({ title: "Dell OptiPlex 7070 SFF i7" }), now), false);
  assert.equal(matches(strict, listing({ title: "Dell OptiPlex 7070 SFF i5-9500" }), now), true);
});

test("the top price is the item's price, and exactly the limit still matches", () => {
  const capped = search({ maxPrice: 95 });
  assert.equal(matches(capped, listing({ price: 9500 }), now), true);
  assert.equal(matches(capped, listing({ price: 9501 }), now), false);
  assert.equal(matches(capped, listing({ price: 9500, postage: 5000 }), now), true);
});

test("the bottom price drops anything cheaper, which is usually parts or a scam", () => {
  const floored = search({ minPrice: 40 });
  assert.equal(matches(floored, listing({ price: 4000 }), now), true);
  assert.equal(matches(floored, listing({ price: 3999 }), now), false);
  assert.equal(matches(floored, listing({ price: 100, postage: 9000 }), now), false);
});

test("the with-postage limit counts the cheapest postage, and unknown postage counts as none", () => {
  const capped = search({ maxWithPostage: 100 });
  assert.equal(matches(capped, listing({ price: 9500, postage: 500 }), now), true);
  assert.equal(matches(capped, listing({ price: 9500, postage: 501 }), now), false);
  assert.equal(matches(capped, listing({ price: 9500, postage: 0 }), now), true);
  assert.equal(matches(capped, listing({ price: 10000, postage: null }), now), true);
  assert.equal(matches(capped, listing({ price: 10001, postage: null }), now), false);
});

test("both price limits apply together", () => {
  const both = search({ maxPrice: 95, maxWithPostage: 100 });
  assert.equal(matches(both, listing({ price: 9500, postage: 500 }), now), true);
  assert.equal(matches(both, listing({ price: 9600, postage: 0 }), now), false);
  assert.equal(matches(both, listing({ price: 9500, postage: 600 }), now), false);
});

test("totalPrice adds known postage only", () => {
  assert.equal(totalPrice(listing({ price: 9500, postage: 699 })), 10199);
  assert.equal(totalPrice(listing({ price: 9500, postage: null })), 9500);
  assert.equal(totalPrice(listing({ price: 9500, postage: 0 })), 9500);
});

test("a listing in the wrong condition is dropped, and one with no condition number is trusted to eBay's filter", () => {
  const usedOnly = search({ conditions: ["used", "seller refurbished"] });
  assert.equal(matches(usedOnly, listing({ conditionId: "3000" }), now), true);
  assert.equal(matches(usedOnly, listing({ conditionId: "2500" }), now), true);
  assert.equal(matches(usedOnly, listing({ conditionId: "7000" }), now), false);
  assert.equal(matches(usedOnly, listing({ conditionId: "1000" }), now), false);
  assert.equal(matches(usedOnly, listing({ conditionId: null }), now), true);
  assert.equal(matches(search(), listing({ conditionId: "7000" }), now), true);
});

test("UK only drops a listing eBay says is abroad", () => {
  assert.equal(matches(search(), listing({ country: "GB" }), now), true);
  assert.equal(matches(search(), listing({ country: "DE" }), now), false);
  assert.equal(matches(search(), listing({ country: "CN" }), now), false);
  assert.equal(matches(search(), listing({ country: null }), now), true);
  assert.equal(matches(search({ ukOnly: false }), listing({ country: "DE" }), now), true);
});

test("a buy-it-now search never matches an auction, and the other way round", () => {
  assert.equal(matches(search(), listing({ buying: ["AUCTION"] }), now), false);
  assert.equal(matches(search(), listing({ buying: ["FIXED_PRICE", "BEST_OFFER"] }), now), true);
  assert.equal(matches(search(), listing({ buying: ["BEST_OFFER"] }), now), false);
  assert.equal(matches(search(), listing({ buying: ["CLASSIFIED_AD"] }), now), false);
  assert.equal(matches(search({ buying: ["auction"] }), listing({ buying: ["FIXED_PRICE"] }), now), false);
  assert.equal(matches(search({ buying: ["auction"] }), listing({ buying: ["AUCTION"] }), now), true);
  assert.equal(matches(search({ buying: ["auction", "buy it now"] }), listing({ buying: ["FIXED_PRICE"] }), now), true);
  assert.equal(matches(search(), listing({ buying: [] }), now), true);
});

test("isAuctionOnly is true only when there's no buy-it-now price", () => {
  assert.equal(isAuctionOnly(listing({ buying: ["AUCTION"] })), true);
  assert.equal(isAuctionOnly(listing({ buying: ["AUCTION", "BEST_OFFER"] })), true);
  assert.equal(isAuctionOnly(listing({ buying: ["AUCTION", "FIXED_PRICE"] })), false);
  assert.equal(isAuctionOnly(listing({ buying: ["FIXED_PRICE"] })), false);
  assert.equal(isAuctionOnly(listing({ buying: [] })), false);
});

test("with endingWithinHours, an auction only matches once it's inside the window", () => {
  const ending = search({ buying: ["auction"], endingWithinHours: 6 });
  const auction = (endsAt: string | null) => listing({ buying: ["AUCTION"], endsAt });
  assert.equal(matches(ending, auction("2026-11-18T18:00:00.000Z"), now), true);
  assert.equal(matches(ending, auction("2026-11-18T12:00:01.000Z"), now), true);
  assert.equal(matches(ending, auction("2026-11-18T18:00:01.000Z"), now), false);
  assert.equal(matches(ending, auction("2026-11-25T12:00:00.000Z"), now), false);
  assert.equal(matches(ending, auction("2026-11-18T12:00:00.000Z"), now), false);
  assert.equal(matches(ending, auction("2026-11-18T11:00:00.000Z"), now), false);
  assert.equal(matches(ending, auction(null), now), false);
  assert.equal(matches(ending, auction("not a date"), now), false);
});

test("the ending window never applies to a buy-it-now listing", () => {
  const ending = search({ buying: ["auction", "buy it now"], endingWithinHours: 6 });
  assert.equal(matches(ending, listing({ buying: ["FIXED_PRICE"], endsAt: "2026-12-18T12:00:00.000Z" }), now), true);
  assert.equal(matches(ending, listing({ buying: ["AUCTION", "FIXED_PRICE"], endsAt: "2026-12-18T12:00:00.000Z" }), now), true);
  assert.equal(matches(ending, listing({ buying: ["AUCTION"], endsAt: "2026-12-18T12:00:00.000Z" }), now), false);
});

test("without endingWithinHours an auction matches whenever it ends", () => {
  assert.equal(matches(search({ buying: ["auction"] }), listing({ buying: ["AUCTION"], endsAt: "2026-12-18T12:00:00.000Z" }), now), true);
  assert.equal(matches(search({ buying: ["auction"] }), listing({ buying: ["AUCTION"], endsAt: null }), now), true);
});

test("a seller below the feedback bar is dropped, and so is one whose feedback is unknown", () => {
  const careful = search({ sellerMinPercent: 98, sellerMinFeedback: 50 });
  assert.equal(matches(careful, listing({ sellerPercent: 98, sellerFeedback: 50 }), now), true);
  assert.equal(matches(careful, listing({ sellerPercent: 97.9, sellerFeedback: 5000 }), now), false);
  assert.equal(matches(careful, listing({ sellerPercent: 100, sellerFeedback: 49 }), now), false);
  assert.equal(matches(careful, listing({ sellerPercent: null, sellerFeedback: 5000 }), now), false);
  assert.equal(matches(careful, listing({ sellerPercent: 100, sellerFeedback: null }), now), false);
  assert.equal(matches(careful, listing({ sellerPercent: 0, sellerFeedback: 0 }), now), false);
});

test("each seller check works on its own, and a 0 bar still needs the number to be known", () => {
  assert.equal(matches(search({ sellerMinPercent: 98 }), listing({ sellerPercent: 99, sellerFeedback: null }), now), true);
  assert.equal(matches(search({ sellerMinFeedback: 10 }), listing({ sellerPercent: null, sellerFeedback: 10 }), now), true);
  assert.equal(matches(search({ sellerMinFeedback: 0 }), listing({ sellerFeedback: 0 }), now), true);
  assert.equal(matches(search({ sellerMinFeedback: 0 }), listing({ sellerFeedback: null }), now), false);
  assert.equal(matches(search(), listing({ sellerPercent: null, sellerFeedback: null }), now), true);
});

test("matching never changes the search or the listing", () => {
  const strict = search({ exclude: ["faulty"], mustInclude: ["7070"], maxPrice: 150, conditions: ["used"] });
  const item = listing();
  const before = JSON.stringify([strict, item]);
  matches(strict, item, now);
  assert.equal(JSON.stringify([strict, item]), before);
});

test("standing says where a listing sits among the current matches by total price", () => {
  const a = listing({ id: "a", price: 9000, postage: 0 });
  const b = listing({ id: "b", price: 8000, postage: 2500 });
  const c = listing({ id: "c", price: 12000, postage: null });
  assert.deepEqual(standing([a, b, c], a), { place: 1, of: 3, other: 10500 });
  assert.deepEqual(standing([a, b, c], b), { place: 2, of: 3, other: 9000 });
  assert.deepEqual(standing([a, b, c], c), { place: 3, of: 3, other: 9000 });
});

test("listings at the same total share the better place", () => {
  const a = listing({ id: "a", price: 9000, postage: 0 });
  const b = listing({ id: "b", price: 8500, postage: 500 });
  assert.deepEqual(standing([a, b], a), { place: 1, of: 2, other: 9000 });
  assert.deepEqual(standing([a, b], b), { place: 1, of: 2, other: 9000 });
});

test("standing says nothing when there's nothing to compare with", () => {
  const a = listing({ id: "a" });
  assert.equal(standing([a], a), null);
  assert.equal(standing([], a), null);
  assert.equal(standing([listing({ id: "b" }), listing({ id: "c" })], a), null);
});

test("a trademark or other symbol stuck to a word can't hide it or glue letters onto it", () => {
  assert.equal(hasPhrase("Dell OptiPlex\u2122 7070 SFF", "optiplex"), true);
  assert.equal(hasPhrase("Dell OptiPlex\u00ae 7070", "optiplex 7070"), true);
  assert.equal(hasPhrase("Dell OptiPlex 7070 Faulty\u2122", "faulty"), true);
  assert.equal(hasPhrase("FAULTY\u00a9\u2120", "faulty"), true);
  assert.equal(plainWords("i5+16GB = \u00a395 \u2605\u2605"), " i5 16gb 95 ");
  assert.equal(matches(search({ exclude: ["faulty"] }), listing({ title: "Dell OptiPlex 7070 Faulty\u2122" }), now), false);
  assert.equal(matches(search({ mustInclude: ["optiplex"] }), listing({ title: "Dell OptiPlex\u2122 7070" }), now), true);
});