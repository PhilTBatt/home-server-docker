import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { cautions, guidePercent, hasPhrase, hiddenReasons, isAuctionOnly, isGreat, matches, plainWords, priorityFor, sizeInTitle, standing, totalPrice, underGuide, unitPrice, whyNot } from "./match.js";
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

test("a hidden listing says why, and the first rule it breaks is the one named", () => {
  const cases: [Record<string, unknown>, Partial<Listing>, string | null][] = [
    [{}, {}, null],
    [{ maxPrice: 90 }, {}, "price"],
    [{ minPrice: 100 }, {}, "price"],
    [{ maxWithPostage: 100 }, {}, "price"],
    [{ conditions: ["new"] }, {}, "condition"],
    [{}, { country: "DE" }, "place"],
    [{ buying: ["auction"] }, {}, "buying"],
    [{ buying: ["auction"], endingWithinHours: 2 }, { buying: ["AUCTION"], endsAt: "2026-11-19T12:00:00.000Z" }, "ending"],
    [{ sellerMinPercent: 99.5 }, {}, "seller"],
    [{ sellerMinFeedback: 5000 }, {}, "seller"],
    [{ sellerType: "business" }, { sellerType: "private" }, "seller"],
    [{ postageShown: true }, { postage: null }, "postage"],
    [{ mustInclude: ["i7"] }, {}, "words"],
    [{ exclude: ["win 11"] }, {}, "words"],
    [{ avoid: ["faulty"] }, { title: "Dell OptiPlex 7070 SFF spares or repair" }, "avoid"],
    [{ maxPrice: 90, exclude: ["win 11"], avoid: ["faulty"] }, { title: "Dell OptiPlex 7070 faulty Win 11" }, "price"],
    [{ exclude: ["faulty"], avoid: ["faulty"] }, { title: "Dell OptiPlex 7070 faulty" }, "words"],
  ];
  for (const [settings, changes, reason] of cases) {
    assert.equal(whyNot(search(settings), listing(changes), now), reason, JSON.stringify(settings));
    assert.equal(matches(search(settings), listing(changes), now), reason === null);
  }
  for (const [, , reason] of cases) assert.ok(reason === null || (hiddenReasons as readonly string[]).includes(reason));
});

test("a wanted seller type hides the other type but not a seller eBay didn't label", () => {
  assert.equal(matches(search({ sellerType: "business" }), listing({ sellerType: "business" }), now), true);
  assert.equal(matches(search({ sellerType: "business" }), listing({ sellerType: null }), now), true);
  assert.equal(matches(search({ sellerType: "private" }), listing({ sellerType: "business" }), now), false);
  assert.equal(matches(search(), listing({ sellerType: "private" }), now), true);
});

test("postageShown hides only listings with no postage price", () => {
  assert.equal(matches(search({ postageShown: true }), listing({ postage: 0 }), now), true);
  assert.equal(matches(search({ postageShown: true }), listing({ postage: 699 }), now), true);
  assert.equal(matches(search({ postageShown: true }), listing({ postage: null }), now), false);
  assert.equal(matches(search(), listing({ postage: null }), now), true);
});

test("each avoid list hides the listings it's named for and leaves a clean one alone", () => {
  const clean = "Dell OptiPlex 7070 SFF i5-9500 16GB RAM 256GB SSD Win 11";
  const caught: Record<string, string[]> = {
    "faulty": ["OptiPlex 7070 SFF FAULTY", "OptiPlex 7070 for parts", "OptiPlex 7070 not working", "OptiPlex 7070 SFF untested", "OptiPlex 7070 BIOS locked", "OptiPlex 7070 needs repairs", "OptiPlex 7070 spares or repair"],
    "incomplete": ["OptiPlex 7070 SFF no RAM", "OptiPlex 7070 SFF No HDD", "OptiPlex 7070 barebones", "OptiPlex 7070 SFF no hard drive", "OptiPlex 7070 no drives"],
    "parts only": ["OptiPlex 7070 SFF motherboard", "OptiPlex 7070 SFF HDD caddy", "OptiPlex 7070 SFF PSU only", "OptiPlex 7070 front panel", "OptiPlex 7070 SFF power supply only", "HP 800 G4 SFF Mother Board", "HP EliteDesk 800 G4 system board L22111-001", "OptiPlex 7070 mobo", "OptiPlex 7070 SFF board only"],
    "lots": ["Job lot 5x OptiPlex 7070 SFF", "Bulk buy 10 OptiPlex 7070 SFF", "Joblot OptiPlex 7070"],
    "laptop ram": ["Crucial 32GB (2x16GB) DDR4 SODIMM", "Kingston 2x16GB DDR4 laptop memory", "32GB DDR4 SO-DIMM kit", "16GB DDR4 RAM for laptops", "32GB 2x16GB DDR4 3200 260-pin", "Cardiff 16GB DDR4 260pin", "Kingston HyperX Impact 2x16GB DDR4", "Kingston FURY Impact 32GB", "Samsung M471A2K43DB1-CWE 16GB", "DDR5 32GB 262 pins"],
    "server ram": ["Samsung 32GB DDR4 ECC RDIMM", "2x16GB DDR4 registered server memory", "Hynix 32GB LRDIMM", "Samsung M393A2G40DB0-CPB 16GB", "HPE 752369-081 16GB", "16GB 2Rx4 PC4-2133P-R", "Micron 32GB PC4-2666V-R", "Hynix 16GB PC4-2400T-RA1", "Samsung 32GB PC4-2933Y-RB2", "SK hynix 32GB DDR4 3200AA-R", "16GB DDR4 ECC REG"],
  };
  for (const [name, titles] of Object.entries(caught)) {
    for (const title of titles) assert.equal(whyNot(search({ avoid: [name] }), listing({ title }), now), "avoid", `${name}: ${title}`);
    assert.equal(whyNot(search({ avoid: [name] }), listing({ title: clean }), now), null, name);
  }
  assert.equal(whyNot(search({ avoid: ["laptop ram", "server ram", "faulty"] }), listing({ title: "Corsair Vengeance LPX 32GB (2x16GB) DDR4 3200MHz desktop" }), now), null);
  const wanted: [string, string][] = [
    ["server ram", "Corsair Vengeance 32GB (2x16GB) DDR4 Non-ECC Unbuffered Desktop RAM"],
    ["laptop ram", "Corsair Vengeance 32GB DDR4 desktop memory (not laptop)"],
    ["laptop ram", "Kingston FURY Beast 32GB (2x16GB) DDR4 3200MHz 288-pin"],
    ["laptop ram", "Samsung M378A2K43DB1-CTD 16GB DDR4 desktop"],
    ["server ram", "Crucial 16GB DDR4 3200 1Rx8 CT16G4DFRA32A"],
    ["server ram", "Hynix 8GB PC4-2400T-UA1 desktop"],
    ["server ram", "Samsung 8GB DDR4 PC4-2400T RAM Desktop Memory"],
    ["server ram", "16GB DDR4 PC4-2133P Ram for desktop"],
    ["server ram", "Corsair 32GB 3200AA Retail box"],
    ["server ram", "Kingston 2933Y Rev 1.0 16GB"],
    ["server ram", "G.Skill 2666V RGB 2x8GB"],
    ["server ram", "Kingston FURY Beast 2x16GB 2Rx8 DDR4 3200"],
    ["server ram", "HP EliteDesk 800 G4 16GB DDR4 RAM upgrade"],
    ["parts only", "HP EliteDesk 800 G4 SFF i5 16GB, board and case clean"],
    ["incomplete", "Dell OptiPlex 7070 SFF i5 16GB 256GB SSD No OS"],
    ["parts only", "Dell OptiPlex 7070 SFF i5 16GB 512GB SSD Win 11 + Power Supply"],
    ["parts only", "Dell OptiPlex 7070 SFF i5 16GB with 250W PSU"],
    ["lots", "Dell OptiPlex 7070 SFF bundle with keyboard and mouse"],
    ["faulty", "Dell OptiPlex 7070 SFF, repaired & tested"],
    ["faulty", "Dell OptiPlex 7070 SFF, box damaged, PC perfect"],
  ];
  for (const [name, title] of wanted) assert.equal(whyNot(search({ avoid: [name] }), listing({ title }), now), null, `${name}: ${title}`);
  assert.equal(whyNot(search({ avoid: ["parts only"] }), listing({ title: "OptiPlex 7070 SFF psus" }), now), null);
});

test("the size is read from a title as gigabytes, taking a kit's total", () => {
  const cases: [string, number | null][] = [
    ["Corsair Vengeance 32GB (2x16GB) DDR4 3200MHz", 32],
    ["Corsair Vengeance 2x16GB DDR4", 32],
    ["Kingston Fury 2 x 16 GB DDR4", 32],
    ["Crucial 16GB DDR4 3200MHz", 16],
    ["G.Skill 4x8GB DDR4", 32],
    ["Crucial 16GB x2 DDR4", 32],
    ["Crucial 16GBx2 DDR4", 32],
    ["Crucial 16GB x 2 DDR4", 32],
    ["Samsung 870 EVO 1TB SSD", 1000],
    ["Seagate 2 x 4TB NAS drives", 8000],
    ["WD Blue 1.5TB", 1500],
    ["Dell OptiPlex i5-9500 3.0GHz 16GB RAM 256GB SSD", 256],
    ["8GB/16GB/32GB DDR4 options", 32],
    ["PC4-25600 DDR4-3200 16 GB", 16],
    ["RTX 3060 12GB", 12],
    ["DDR4 3200MHz CL16 desktop memory", null],
    ["16GBs of memory", null],
    ["0GB placeholder", null],
    ["Box of 99x9999TB", null],
    ["", null],
  ];
  for (const [title, size] of cases) assert.equal(sizeInTitle(title), size, title);
});

test("a price per unit uses the total with postage, in the unit the search asks for", () => {
  const kit = listing({ title: "Corsair 32GB (2x16GB) DDR4", price: 4500, postage: 499 });
  assert.deepEqual(unitPrice(search({ unit: "GB" }), kit), { unit: "GB", amount: 32, pence: 156 });
  assert.deepEqual(unitPrice(search({ unit: "TB" }), listing({ title: "Seagate 4TB", price: 6000, postage: 0 })), { unit: "TB", amount: 4, pence: 1500 });
  assert.deepEqual(unitPrice(search({ unit: "TB" }), listing({ title: "Crucial 500GB SSD", price: 3000, postage: 0 })), { unit: "TB", amount: 0.5, pence: 6000 });
  assert.equal(unitPrice(search(), kit), null);
  assert.equal(unitPrice(search({ unit: "GB" }), { ...kit, variations: true }), null);
  assert.equal(unitPrice(search({ unit: "GB" }), { ...kit, buying: ["AUCTION"] }), null);
  assert.equal(unitPrice(search({ unit: "GB" }), listing({ title: "DDR4 desktop memory" })), null);
});

test("a listing is measured against the guide price by its total, as a whole percentage", () => {
  const guide = search({ guidePrice: 110 });
  assert.equal(underGuide(guide, listing({ price: 8500, postage: 0 })), 22);
  assert.equal(underGuide(search({ guidePrice: 100 }), listing({ price: 8040, postage: 0 })), 19);
  assert.equal(underGuide(search({ guidePrice: 100 }), listing({ price: 10040, postage: 0 })), -1);
  assert.equal(underGuide(search({ guidePrice: 100 }), listing({ price: 9999, postage: 0 })), 0);
  assert.equal(underGuide(guide, listing({ price: 10000, postage: 1000 })), 0);
  assert.equal(underGuide(guide, listing({ price: 12000, postage: 100 })), -10);
  assert.equal(underGuide(guide, listing({ price: 8500, postage: null })), 22);
  assert.equal(underGuide(guide, listing({ price: 99, postage: 0, buying: ["AUCTION"] })), null);
  assert.equal(guidePercent(guide, listing({ price: 99, postage: 0, buying: ["AUCTION"] })), 99);
  assert.equal(underGuide(guide, listing({ price: 8500, postage: 0, buying: ["AUCTION", "FIXED_PRICE"] })), 22);
  assert.equal(underGuide(search(), listing()), null);
});

test("a great deal is at least the chosen percentage under the guide price, and sets the alert's priority", () => {
  const guide = search({ guidePrice: 100 });
  assert.equal(isGreat(guide, listing({ price: 8000, postage: 0 })), true);
  assert.equal(isGreat(guide, listing({ price: 8001, postage: 0 })), false);
  assert.equal(isGreat(guide, listing({ price: 7500, postage: 500 })), true);
  assert.equal(isGreat(search({ guidePrice: 100, greatPercent: 50 }), listing({ price: 5001, postage: 0 })), false);
  assert.equal(isGreat(search(), listing({ price: 1, postage: 0 })), false);
  assert.equal(priorityFor(guide, listing({ price: 8000, postage: 0 })), 4);
  assert.equal(priorityFor(guide, listing({ price: 9000, postage: 0 })), 3);
  assert.equal(priorityFor(guide, listing({ price: 10000, postage: 0 })), 3);
  assert.equal(priorityFor(guide, listing({ price: 10001, postage: 0 })), 2);
  assert.equal(priorityFor(search(), listing({ price: 1, postage: 0 })), 3);
  const bid = listing({ price: 99, postage: 0, buying: ["AUCTION"] });
  assert.deepEqual([isGreat(guide, bid), priorityFor(guide, bid), cautions(guide, bid)], [false, 3, []]);
  assert.equal(priorityFor(guide, listing({ price: 15000, postage: 0, buying: ["AUCTION"] })), 3);
  assert.equal(priorityFor(guide, listing({ price: 15000, postage: 0, buying: ["AUCTION", "FIXED_PRICE"] })), 2);
});

test("a listing with several options is never a great deal, and over the guide price it's low priority, since its cheapest option already is", () => {
  const guide = search({ guidePrice: 100 });
  const options = (price: number) => listing({ price, postage: 0, variations: true });
  assert.deepEqual([isGreat(guide, options(1000)), priorityFor(guide, options(1000))], [false, 3]);
  assert.deepEqual([isGreat(guide, options(10000)), priorityFor(guide, options(10000))], [false, 3]);
  assert.deepEqual([isGreat(guide, options(20000)), priorityFor(guide, options(20000))], [false, 2]);
  assert.equal(underGuide(guide, options(1000)), 90);
  assert.deepEqual([isGreat(guide, listing({ price: 1000, postage: 0 })), priorityFor(guide, listing({ price: 1000, postage: 0 }))], [true, 4]);
});

test("cautions name what's worth a second look, and an ordinary listing has none", () => {
  assert.deepEqual(cautions(search(), listing()), []);
  assert.deepEqual(cautions(search(), listing({ sellerFeedback: 9 })), ["the seller has under 10 ratings"]);
  assert.deepEqual(cautions(search(), listing({ sellerFeedback: 10 })), []);
  assert.deepEqual(cautions(search(), listing({ sellerFeedback: null })), []);
  assert.deepEqual(cautions(search({ guidePrice: 250 }), listing({ price: 9500, postage: 699 })), ["it's under half your guide price"]);
  assert.deepEqual(cautions(search({ guidePrice: 200 }), listing({ price: 9500, postage: 500 })), []);
  assert.deepEqual(cautions(search(), listing({ variations: true })), ["the listing has more than one option, so this may be its lowest price"]);
  assert.deepEqual(cautions(search(), listing({ postage: null })), ["postage isn't shown, so it may be collection only"]);
  assert.equal(cautions(search({ guidePrice: 500 }), listing({ sellerFeedback: 0, variations: true, postage: null })).length, 4);
});
test("a listing that eBay says has a hidden item detail is hidden for its details, after every other rule", () => {
  assert.equal(whyNot(search(), listing({ hiddenDetail: "Form Factor" }), now), "details");
  assert.equal(whyNot(search({ maxPrice: 50 }), listing({ hiddenDetail: "Form Factor" }), now), "price");
  assert.equal(whyNot(search(), listing(), now), null);
});

test("a deal from a feed gets a check-at-the-shop caution instead of the collection one", () => {
  const feed = readSearches(JSON.stringify({ searches: [{ id: "nvme", name: "NVMe", switch: "on", source: "hotukdeals", query: "nvme" }] }), ["ebay", "hotukdeals"]).searches[0];
  assert.deepEqual(cautions(feed, listing({ postage: null })), ["it's a deal someone posted, so check the price, postage and stock at the shop"]);
});

test("a listing with several options is hidden for them only when its search says so, after every other rule", () => {
  assert.equal(whyNot(search({ hideVariations: true }), listing({ variations: true }), now), "options");
  assert.equal(whyNot(search({ hideVariations: true }), listing({ variations: false }), now), null);
  assert.equal(whyNot(search(), listing({ variations: true }), now), null);
  assert.equal(whyNot(search({ hideVariations: true, maxPrice: 50 }), listing({ variations: true }), now), "price");
  assert.ok(hiddenReasons.includes("options"));
});

test("the catalogue's USB Wi-Fi search keeps adapters by any of its model names and drops antennas and internal cards", async () => {
  const text = await readFile(new URL("../../../src/modules/deals/catalogue.example.json", import.meta.url), "utf8");
  const raw = (JSON.parse(text) as { searches: Record<string, unknown>[] }).searches.find((entry) => entry.id === "usb-wifi-linux");
  assert.ok(raw !== undefined);
  const wifi = search({ ...raw, switch: "on" });
  assert.deepEqual(wifi.mustInclude, []);
  const cheap = { price: 2500, postage: 399 };
  for (const title of ["ALFA AWUS036ACM Dual Band AC1200 USB WiFi Adapter", "Alfa Network AWUS036AXML WiFi 6E USB adapter Bluetooth", "Panda PAU0F AXE3000 USB Wi-Fi adapter", "USB WiFi 6 adapter MT7921AU Linux"]) {
    assert.equal(whyNot(wifi, listing({ title, ...cheap }), now), null, title);
  }
  for (const title of ["ALFA AWUS036ACM antenna only", "Antenna for ALFA AWUS036ACM", "MT7921K PCIe WiFi 6E card", "AWUS036AXML case only", "M.2 MT7921AU wifi card"]) {
    assert.equal(whyNot(wifi, listing({ title, ...cheap }), now), "words", title);
  }
  assert.equal(whyNot(wifi, listing({ title: "Alfa AWUS036AXML", price: 7500, postage: 0 }), now), null);
  assert.equal(whyNot(wifi, listing({ title: "Alfa AWUS036AXML", price: 7501, postage: 0 }), now), "price");
  assert.deepEqual([wifi.guidePrice, wifi.greatPercent], [3500, 50]);
});
