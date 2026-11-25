import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { alwaysExcluded, ruleChecks, offEbaySign, cautions, chooseOption, guidePercent, hasPhrase, hiddenReasons, isAuctionOnly, isGreat, matches, plainWords, priorityFor, sizeInTitle, standing, totalPrice, underGuide, unitPrice, whyNot, withOption } from "./match.js";
import { plainText } from "./ebay.js";
import { readSearches, type Search } from "./searches.js";
import type { Listing, ListingOption } from "./source.js";

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

test("a number and its unit match with or without a space between them", () => {
  assert.equal(plainWords("RTX3060 12GB, 2x8GB DDR4 3200MHz, RM550W PSU, 1.5TB, 1GbE, 16Gbps"), " rtx3060 12 gb 2x8 gb ddr4 3200 mhz rm550 w psu 1 5 tb 1gbe 16gbps ");
  assert.equal(plainWords("RTX 3060 12 GB, 2 x 8 GB DDR4 3200 MHz, 550 W PSU"), " rtx 3060 12 gb 2 x 8 gb ddr4 3200 mhz 550 w psu ");
  assert.ok(hasPhrase("Gigabyte RTX 3060 Gaming OC 12 GB", "12gb"));
  assert.ok(hasPhrase("Gigabyte RTX 3060 Gaming OC 12GB", "12 gb"));
  assert.ok(hasPhrase("Corsair RM550x 550 W Gold", "550w"));
  assert.ok(hasPhrase("Seagate 4 TB NAS", "4tb"));
  assert.ok(!hasPhrase("Seagate 14 TB NAS", "4tb"));
  assert.ok(!hasPhrase("Model 2012 GB", "12gb"));
  assert.ok(!hasPhrase("PC4 2400 Gbit", "2400gb"));
  assert.ok(hasPhrase("Kit 2 x 16 GB", "16gb"));
  assert.ok(!hasPhrase("16 GBP voucher", "16gb"));
  assert.ok(hasPhrase("Corsair 16GB (2x8 GB) DDR4", "2x8gb"));
  assert.ok(hasPhrase("Corsair 32GB (2x16GB) DDR4", "2x16 gb"));
  assert.ok(hasPhrase("Corsair 550 Watt Bronze", "550"));
  assert.ok(hasPhrase("Corsair 550W Bronze", "550"));
  assert.ok(hasPhrase("Corsair RM850W Gold", "rm850"));
  assert.ok(hasPhrase("Corsair RM850 W Gold", "rm850w"));
  assert.ok(hasPhrase("Crucial 16GB DDR4", "16"));
});

test("a unit word after a model number doesn't stop the number matching", () => {
  assert.ok(hasPhrase("Intel Core i7 8700 W/ Stock Cooler LGA1151", "8700"));
  assert.ok(hasPhrase("HP ProDesk 600 G4 W/ i5-8500 16GB 256GB SSD SFF", "g4"));
  assert.ok(hasPhrase("MSI GeForce RTX 3060 W/ Box Ventus 2X 12GB", "3060"));
  assert.ok(hasPhrase("Dell OptiPlex 7070 i5 W/ 16GB RAM", "i5"));
  assert.ok(hasPhrase("MSI B450 MB + Ryzen 5 3600 bundle", "b450"));
  assert.ok(hasPhrase("Dell Precision 3630 W/ Quadro", "3630"));
  assert.ok(hasPhrase("Corsair Vengeance LPX 16 GB DDR4 3200 MHz", "3200"));
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
  assert.equal(plainWords("i5+16GB = \u00a395 \u2605\u2605"), " i5 16 gb 95 ");
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

test("the catalogue's powerline search keeps gigabit kits and drops the slower classes, kits named as having 100Mbps ports, single adapters and faulty ones", async () => {
  const text = await readFile(new URL("../../../src/modules/deals/catalogue.example.json", import.meta.url), "utf8");
  const raw = (JSON.parse(text) as { searches: Record<string, unknown>[] }).searches.find((entry) => entry.id === "powerline-gigabit-kit");
  assert.ok(raw !== undefined && raw.switch === "off" && raw.group === "network");
  const powerline = search({ ...raw, switch: "on" });
  assert.equal(powerline.query, "powerline (kit, pair, twin, starter, 2x, x2)");
  const cheap = { price: 2000, postage: 0 };
  for (const title of ["TP-Link TL-PA7017 KIT AV1000 Gigabit Powerline Starter Kit", "TP-Link TL-PA7017P KIT AV1000 Gigabit Passthrough Powerline Pair", "devolo Magic 2 LAN Powerline Starter Kit", "2x TP-Link AV2000 Powerline adapters TL-PA9020P"]) {
    assert.equal(whyNot(powerline, listing({ title, ...cheap }), now), null, title);
  }
  for (const title of ["TP-Link AV1200 Gigabit Powerline Kit 1200Mbps", "TP-Link AV1000 Gigabit Powerline Kit, Single Port"]) {
    assert.equal(whyNot(powerline, listing({ title, ...cheap }), now), null, title);
  }
  const slower = ["av200", "av 200", "av500", "av 500", "av600", "av 600", "200mbps", "200 mbps", "500mbps", "500 mbps", "600mbps", "600 mbps", "pa4010*", "dlan 550", "single adapter", "single unit"];
  assert.deepEqual(powerline.exclude, slower);
  for (const word of slower) {
    assert.equal(whyNot(powerline, listing({ title: `Powerline Starter Kit ${word.replace("*", "kit")}`, ...cheap }), now), "words", word);
  }
  for (const title of ["TP-Link TL-PA4010KIT AV600 Nano Powerline Starter Kit", "TP-Link TL-PA4010P KIT Powerline pair", "devolo dLAN 550 duo+ Powerline Starter Kit", "Powerline kit 600 Mbps homeplug", "Netgear AV500 Powerline pair", "TP-Link AV1000 Powerline kit, single adapter from a pair"]) {
    assert.equal(whyNot(powerline, listing({ title, ...cheap }), now), "words", title);
  }
  assert.equal(whyNot(powerline, listing({ title: "TP-Link AV1000 Powerline Kit faulty", ...cheap }), now), "avoid");
  assert.equal(whyNot(powerline, listing({ title: "TP-Link TL-PA7017 KIT", price: 4000, postage: 0 }), now), null);
  assert.equal(whyNot(powerline, listing({ title: "TP-Link TL-PA7017 KIT", price: 3600, postage: 401 }), now), "price");
  assert.deepEqual([powerline.guidePrice, powerline.guideDate, powerline.everyMinutes], [1800, "2026-11-25", 240]);
});

function choice(text: string, price: number, inStock: boolean | null = true, ref: string | null = `v1|226543210987|${price}`): ListingOption {
  return { ref, price, text, inStock };
}

const driveOptions = [choice("Storage Capacity: 1 TB", 1500), choice("Storage Capacity: 2 TB", 2800), choice("Storage Capacity: 4 TB", 5200), choice("Storage Capacity: 4 TB, Interface: SAS", 3000), choice("Storage Capacity: 8 TB", 9900)];

test("the option chosen is the cheapest in stock with the size the search names, in its words or else its query", () => {
  assert.equal(chooseOption(search({ query: "4tb nas hard drive", mustInclude: ["4tb"], exclude: ["sas"] }), driveOptions), driveOptions[2]);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive" }), driveOptions), driveOptions[3]);
  assert.equal(chooseOption(search({ query: "nas hard drive", mustInclude: ["8tb"] }), driveOptions), driveOptions[4]);
  assert.equal(chooseOption(search({ query: "16tb hard drive" }), driveOptions), null);
  const fourOut = [choice("Storage Capacity: 4 TB", 5200, false), driveOptions[0]];
  assert.equal(chooseOption(search({ query: "4tb nas hard drive" }), fourOut), null);
  const unsure = choice("Storage Capacity: 4 TB", 5200, null);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive" }), [unsure, driveOptions[0]]), unsure);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive" }), [choice("Storage Capacity: 4 TB", 1000, true, null), driveOptions[2]]), driveOptions[2]);
});

test("an option fits only when its largest size is the search's and it has every size the search names", () => {
  const kits = [choice("Capacity: 8GB (2x4GB)", 900), choice("Capacity: 16GB (2x8GB)", 2400), choice("Capacity: 32GB (2x16GB)", 2000)];
  assert.equal(chooseOption(search({ query: "ddr4 16gb 2x8gb" }), kits), kits[1]);
  const sticks = [choice("Total Capacity: 32GB, Capacity per Module: 16GB", 4500), choice("Total Capacity: 16GB, Capacity per Module: 16GB", 3000)];
  assert.equal(chooseOption(search({ query: "16gb ddr4 3200" }), sticks), sticks[1]);
  assert.equal(chooseOption(search({ query: "16gb ddr4 3200" }), [sticks[0]]), null);
  const pcs = [choice("RAM Size: 8GB, SSD Capacity: 512GB", 9000), choice("RAM Size: 16GB, SSD Capacity: 512GB", 12500)];
  assert.equal(chooseOption(search({ query: "mini pc 16gb 512gb" }), pcs), pcs[1]);
  assert.equal(chooseOption(search({ query: "optiplex 7070 16gb" }), pcs), null);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive" }), [choice("Model: WD10EFRX", 1500), choice("Model: WD40EFRX", 4800)]), null);
});

test("a search that names no size in GB or TB never takes an option's price, since it can't tell which one it wants", () => {
  const wattages = [choice("Wattage: 450W", 2000), choice("Wattage: 750W", 7500)];
  assert.equal(chooseOption(search({ query: "750w gold" }), wattages), null);
  assert.equal(chooseOption(search({ query: "1.92tb sata ssd" }), [choice("Capacity: 480GB", 3000), choice("Capacity: 1.92TB", 9000)]), null);
  assert.equal(chooseOption(search({ query: "corsair 4000d" }), [choice("Colour: Black", 3000), choice("Colour: White", 2500)]), null);
});

test("the option chosen is at or over the search's lowest price when one that fits is, and without the search's excluded words", () => {
  const health = [choice("Storage Capacity: 4 TB, Health: Fair", 2000), choice("Storage Capacity: 4 TB, Health: Good", 4500), choice("Storage Capacity: 4 TB, Health: Very good", 5000)];
  assert.equal(chooseOption(search({ query: "4tb nas hard drive", minPrice: 25 }), health), health[1]);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive", minPrice: 20 }), health), health[0]);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive", minPrice: 60 }), health), health[0]);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive" }), health), health[0]);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive", exclude: ["fair"] }), health), health[1]);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive", exclude: ["health"] }), health), null);
  assert.equal(chooseOption(search({ query: "4tb nas hard drive" }), []), null);
});

test("an option read sets the listing's price, reference and option, and no fitting option leaves its price as eBay's", () => {
  const base = listing({ title: "Seagate IronWolf 1TB 2TB 4TB 8TB NAS", price: 1500, postage: 399, variations: true, ref: "v1|226543210987|0", groupId: "226543210987" });
  const chosen = withOption(base, driveOptions[2]);
  assert.deepEqual([chosen.price, chosen.ref, chosen.option, chosen.postage, chosen.id, chosen.optionsRead], [5200, "v1|226543210987|5200", "Storage Capacity: 4 TB", 399, base.id, true]);
  const none = withOption(base, null);
  assert.deepEqual([none.price, none.ref, none.option, none.optionsRead], [1500, "v1|226543210987|0", undefined, true]);
  assert.deepEqual(withOption(base, { ...driveOptions[2], ref: null }), none);
  assert.equal(base.optionsRead, undefined);
  const drive = search({ query: "4tb nas hard drive", hideVariations: true, maxWithPostage: 60 });
  assert.equal(whyNot(drive, base, now), "options");
  assert.equal(whyNot(drive, none, now), "options");
  assert.equal(whyNot(drive, chosen, now), null);
  assert.equal(whyNot(search(), none, now), null);
  assert.equal(whyNot(drive, withOption(base, driveOptions[4]), now), "price");
});

test("with its option known, a listing's price per unit comes from the option, and it can be a great deal", () => {
  const base = listing({ title: "Seagate IronWolf 1TB 2TB 4TB 8TB NAS", price: 1500, postage: 0, variations: true });
  const chosen = withOption(base, driveOptions[2]);
  const drive = search({ unit: "TB", guidePrice: 70 });
  assert.equal(unitPrice(drive, base), null);
  assert.deepEqual(unitPrice(drive, chosen), { unit: "TB", amount: 4, pence: 1300 });
  assert.equal(unitPrice(drive, withOption(base, null)), null);
  assert.deepEqual([isGreat(drive, base), priorityFor(drive, base)], [false, 3]);
  assert.deepEqual([isGreat(drive, withOption(base, null)), priorityFor(drive, withOption(base, null))], [false, 3]);
  assert.deepEqual([isGreat(drive, chosen), priorityFor(drive, chosen)], [true, 4]);
  assert.deepEqual(cautions(search(), chosen), ["the listing has more than one option, and this is the price of Storage Capacity: 4 TB"]);
  assert.deepEqual(cautions(search(), base), ["the listing has more than one option, so this may be its lowest price"]);
});

test("an exclude word always hides a mustInclude word when every title with the one has the other", () => {
  assert.ok(alwaysExcluded("ddr4", "ddr4"));
  assert.ok(alwaysExcluded("ddr4 ecc", "ECC"));
  assert.ok(alwaysExcluded("16GB", "16 gb"));
  assert.ok(alwaysExcluded("ddr4", "ddr*"));
  assert.ok(alwaysExcluded("512*", "51*"));
  assert.ok(!alwaysExcluded("512*", "512"));
  assert.ok(!alwaysExcluded("512*", "512gb"));
  assert.ok(!alwaysExcluded("16gb", "16gb x 2"));
  assert.ok(!alwaysExcluded("ecc", "non ecc"));
  assert.ok(!alwaysExcluded("ddr4", "ddr"));
  assert.ok(!alwaysExcluded("ddr4", "!!"));
  assert.ok(!alwaysExcluded("!!", "ddr4"));
  assert.ok(!alwaysExcluded("!!", "??"));
});

test("the catalogue's B660 bundle, Quadro P620 and M.2 adapter searches keep out look-alikes and keep the real thing", async () => {
  const folder = new URL("../../../src/modules/deals/", import.meta.url);
  const catalogue = await readFile(new URL("catalogue.example.json", folder), "utf8");
  const list = readSearches(JSON.stringify({ searches: [], more: ["catalogue.json"] }), ["ebay", "hotukdeals"], { "catalogue.json": catalogue });
  const named = (id: string) => {
    const found = list.searches.find((one) => one.id === id);
    assert.ok(found !== undefined, id);
    return found;
  };
  const reason = (id: string, title: string, price: number) => whyNot(named(id), listing({ title, price, postage: 0 }), now);
  const added: [string, string, number, string[]][] = [
    ["b660-bundle", "Intel i5 12400F B660 Motherboard Bundle Kit", 15000, ["timing belt", "cambelt", "water pump", "mazda", "cam belt", "timing kit"]],
    ["quadro-p620", "NVIDIA Quadro P620 2GB", 3000, ["tab", "tablet", "galaxy", "keyboard", "stylus", "screen protector", "cover for", "case for", "sm-p620", "s6 lite"]],
  ];
  const adapterWords = ["enclosure", "usb", "type c", "external", "macbook", "notebook", "interposer", "wifi", "wi-fi", "a+e key", "key e", "key a", "quad", "4 x m.2", "4 port", "5 port", "6 port", "hyper m.2", "requires bifurcation", "dual nvme", "riser cable", "extension cable", "extender", "oculink", "egpu", "sff-8643", "sff-8612", "u.2", "2230 to 2280", "2242 to 2280", "not for nvme", "not nvme", "non nvme", "no nvme", "optane", "ps5"];
  assert.deepEqual(named("m2-nvme-pcie-adapter").exclude, adapterWords);
  added.push(["m2-nvme-pcie-adapter", "M.2 NVMe to PCIe x4 Adapter Card", 900, adapterWords]);
  for (const [id, base, price, words] of added) {
    for (const word of words) {
      assert.ok(named(id).exclude.includes(word), `${id} excludes ${word}`);
      assert.equal(reason(id, `${base} ${word}`, price), "words", `${id}: ${word}`);
    }
  }
  const hidden: [string, string, number][] = [
    ["b660-bundle", "Mazda 2 Timing Belt Kit B660-12-205 with Water Pump", 9000],
    ["quadro-p620", "Keyboard Case for Samsung Galaxy Tab S6 Lite 2024 SM-P620", 2500],
    ["m2-nvme-pcie-adapter", "M.2 SATA SSD to 2.5 inch SATA III Adapter Card (Not for NVMe / PCIe)", 500],
    ["m2-nvme-pcie-adapter", "M.2 NVMe M-Key to OCuLink SFF-8612 PCIe 4.0 x4 Adapter Card for eGPU", 1200],
    ["m2-nvme-pcie-adapter", "M.2 NVMe SSD to Type-C Adapter Card 10Gbps PCIe Aluminium Case", 900],
    ["m2-nvme-pcie-adapter", "M.2 Key A+E to M.2 Key M NVMe SSD Adapter Card PCIe", 600],
    ["m2-nvme-pcie-adapter", "M.2 NVMe PCIe 2230 to 2280 Extension Adapter Bracket", 400],
  ];
  for (const [id, title, price] of hidden) assert.equal(reason(id, title, price), "words", `${id}: ${title}`);
  const kept: [string, string, number][] = [
    ["b660-bundle", "Intel Core i5 12400F + MSI PRO B660M-A DDR4 Motherboard Bundle Kit", 15000],
    ["quadro-p620", "NVIDIA Quadro P620 2GB GDDR5 Low Profile Graphics Card", 4000],
    ["quadro-p620", "PNY Quadro P620 V2 2GB 4x mDP Low Profile with Slot Cover, fits SFF case", 4500],
    ["m2-nvme-pcie-adapter", "M.2 NVMe SSD to PCIe 3.0 x4 Adapter Card Low Profile", 900],
    ["m2-nvme-pcie-adapter", "StarTech PEX4M2E1 M.2 NVMe PCI-E x4 Adapter Card", 1500],
    ["m2-nvme-pcie-adapter", "M.2 NVME to PCIe 3.0 X4 Adapter Card with Heatsink Riser Card for Computer PC", 800],
    ["m2-nvme-pcie-adapter", "M.2 NVME SSD NGFF to PCIE 3.0 X4 Adapter PCIE M2 Riser Card Adapter", 700],
    ["m2-nvme-pcie-adapter", "Dual M.2 Adapter NVMe PCIe x4 plus SATA M.2 Slot, No Bifurcation Required, Not for Laptop", 1400],
  ];
  for (const [id, title, price] of kept) assert.equal(reason(id, title, price), null, `${id}: ${title}`);
});

test("ruleChecks names every rule a listing fails, in the watcher's order, with the setting and plain words", () => {
  const strict = search({
    minPrice: 100,
    conditions: ["new"],
    buying: ["auction"],
    endingWithinHours: 4,
    sellerMinPercent: 99.5,
    sellerMinFeedback: 5000,
    sellerType: "business",
    postageShown: true,
    mustInclude: ["7080", "micro"],
    exclude: ["sff", "win 11"],
    avoid: ["faulty"],
    hideVariations: true,
  });
  const bad = listing({ price: 9500, postage: null, country: "DE", sellerType: "private", title: "Dell OptiPlex 7070 SFF i5 Win 11 spares or repair", variations: true, hiddenDetail: "Form Factor" });
  assert.deepEqual(ruleChecks(strict, bad, now), [
    { rule: "price", setting: "minPrice", text: "its price, £95.00, is under the search's £100.00 minimum" },
    { rule: "condition", setting: "conditions", text: "its condition, Used, isn't one the search takes (new)" },
    { rule: "place", setting: "ukOnly", text: "it's in DE, and the search only takes items in the UK" },
    { rule: "buying", setting: "buying", text: "it's buy it now, and the search takes auction" },
    { rule: "seller", setting: "sellerMinPercent", text: "its seller is 99.4% positive, under the search's 99.5%" },
    { rule: "seller", setting: "sellerMinFeedback", text: "its seller's feedback score is 1234, under the search's 5000" },
    { rule: "seller", setting: "sellerType", text: "its seller is private, and the search takes business sellers only" },
    { rule: "postage", setting: "postageShown", text: "it shows no postage price, and the search needs one" },
    { rule: "words", setting: "mustInclude", text: 'its title doesn\'t have "7080", which the search needs' },
    { rule: "words", setting: "mustInclude", text: 'its title doesn\'t have "micro", which the search needs' },
    { rule: "words", setting: "exclude", text: 'its title has "sff", which the search leaves out' },
    { rule: "words", setting: "exclude", text: 'its title has "win 11", which the search leaves out' },
    { rule: "avoid", setting: "avoid", text: 'its title has "spares", from the faulty avoid list' },
    { rule: "details", setting: "hideDetails", text: "eBay says its Form Factor is one the search hides" },
    { rule: "options", setting: "hideVariations", text: "it has several options, and the search hides those" },
  ]);
  assert.deepEqual(ruleChecks(search({ maxWithPostage: 100 }), listing({ price: 9500, postage: 699 }), now), [{ rule: "price", setting: "maxWithPostage", text: "with postage it's £101.99, over the search's £100.00 top with postage" }]);
  assert.deepEqual(ruleChecks(search({ maxPrice: 90, maxWithPostage: 90 }), listing({ price: 9500, postage: 699 }), now), [
    { rule: "price", setting: "maxPrice", text: "its price, £95.00, is over the search's £90.00 top price" },
    { rule: "price", setting: "maxWithPostage", text: "with postage it's £101.99, over the search's £90.00 top with postage" },
  ]);
  const auction = listing({ buying: ["AUCTION"], endsAt: "2026-11-19T12:00:00.000Z", sellerPercent: null, sellerFeedback: null });
  assert.deepEqual(ruleChecks(search({ buying: ["auction"], endingWithinHours: 4, sellerMinPercent: 98, sellerMinFeedback: 10 }), auction, now).map((check) => check.text), [
    "the auction doesn't end within the search's 4 hours",
    "its seller's feedback isn't shown, and the search needs 98% positive",
    "its seller's feedback score isn't shown, and the search needs 10",
  ]);
  assert.deepEqual(ruleChecks(search({ sellerMinPercent: 99.5 }), listing(), now).map((check) => check.text), ["its seller is 99.4% positive, under the search's 99.5%"]);
  assert.deepEqual(ruleChecks(search(), listing(), now), []);
});

test("whyNot is always the first rule ruleChecks names, or nothing when it names none", () => {
  const searches = [
    search(),
    search({ minPrice: 9600 }),
    search({ maxPrice: 9000, conditions: ["new"] }),
    search({ maxWithPostage: 10000, mustInclude: ["7070"], exclude: ["win 11"] }),
    search({ buying: ["auction"], sellerMinPercent: 99.9 }),
    search({ avoid: ["faulty", "parts only"], hideVariations: true }),
    search({ sellerType: "business", postageShown: true, ukOnly: false }),
  ];
  const listings = [
    listing(),
    listing({ price: 9700, postage: null }),
    listing({ conditionId: null, country: null, buying: [] }),
    listing({ title: "OptiPlex 7070 faulty for parts", sellerType: "business" }),
    listing({ variations: true, option: "Size: 16GB", country: "IE" }),
    listing({ variations: true, buying: ["AUCTION"], endsAt: "2026-11-18T13:00:00.000Z", sellerPercent: null }),
    listing({ hiddenDetail: "Features", sellerType: "private", conditionId: "1000" }),
  ];
  for (const wanted of searches) {
    for (const found of listings) {
      assert.equal(whyNot(wanted, found, now), ruleChecks(wanted, found, now)[0]?.rule ?? null);
    }
  }
});

test("a title, summary or description that mentions paying or talking outside eBay gets a caution naming the words, not the seller's text", () => {
  const caution = (sign: string) => `it mentions ${sign}, a sign of paying or talking outside eBay, which loses eBay's Money Back Guarantee`;
  assert.deepEqual(cautions(search(), listing({ title: "Fractal Meshify C case, CASH ON COLLECTION only" })), [caution('"cash on collection"')]);
  assert.deepEqual(cautions(search(), listing({ summary: "Pay by bank transfer for a discount" })), [caution('"bank transfer"')]);
  assert.deepEqual(cautions(search(), listing(), "Message me on WhatsApp before buying"), [caution('"whatsapp"')]);
  assert.deepEqual(cautions(search(), listing(), "Ring 07700 900 123 for a better price"), [caution("a phone number")]);
  assert.deepEqual(cautions(search(), listing(), "Ring +44 7700900123"), [caution("a phone number")]);
  assert.deepEqual(cautions(search(), listing({ title: "Cash only", summary: "bank transfer" }), "whatsapp"), [caution('"cash only"')]);
  assert.deepEqual(cautions(search(), listing(), "PayPal F&F saves the fees"), [caution('"paypal f f"')]);
  const fine = [
    "Dell OptiPlex 7070 SFF, collection or posted",
    "Paid through eBay only",
    "Model 07700 9001 23x",
    "Cashmere jumper",
    "Callme-branded case",
    "16GB DDR4 3200 1.35V 288-pin",
    "Serial 0770090012345",
    "Message me on eBay with any questions",
    "Contact me on eBay messages",
    "Email me via eBay",
    "Call me if the courier can't find you",
    "Bought off eBay last year",
    "Built for friends and family, barely used",
    "Text me through eBay for a combined postage price",
  ];
  for (const text of fine) assert.equal(offEbaySign(text), null, text);
  assert.deepEqual(cautions(search(), listing(), null), []);
});

test("the off-eBay caution never drops a phrase the seller seems to refuse, it only says so, and it catches plurals", () => {
  const refused: [string, string][] = [
    ["No bank transfers", "bank transfer"],
    ["No bank transfer, sorry", "bank transfer"],
    ["no paypal friends and family please", "paypal friends"],
    ["I don't accept bank transfer", "bank transfer"],
    ["We do not accept cash only buyers", "cash only"],
    ["Won't take payment outside eBay", "payment outside"],
    ["Bank transfer not accepted", "bank transfer"],
    ["Bank transfers aren't accepted, PayPal only", "bank transfer"],
    ["Bank transfers are not accepted", "bank transfer"],
    ["Cash on collection isn't possible, posted only", "cash on collection"],
    ["Cash on collection is not possible", "cash on collection"],
    ["No WhatsApp messages, use eBay", "whatsapp"],
    ["Never been used. No bank transfers", "bank transfer"],
    ["Bank transfer not accepted, PayPal only", "bank transfer"],
    ["Bank transfer not accepted at all", "bank transfer"],
    ["Bank transfer: not accepted", "bank transfer"],
  ];
  for (const [text, sign] of refused) assert.deepEqual(offEbaySign(text), { sign: `"${sign}"`, refused: true }, text);
  const meant: [string, string][] = [
    ["Never been used, no offers, no bank transfers", '"bank transfer"'],
    ["Price is firm no offer cash on collection only", '"cash on collection"'],
    ["Firm price, no offer bank transfer only", '"bank transfer"'],
    ["WhatsApp not available after 6pm", '"whatsapp"'],
    ["Cash on collection not available until Saturday", '"cash on collection"'],
    ["Bank transfer not accepted from new buyers", '"bank transfer"'],
    ["Won't take bank transfer unless you collect", '"bank transfer"'],
    ["I don't accept bank transfer for orders under £50", '"bank transfer"'],
    ["Won't take bank transfer payments unless you collect", '"bank transfer"'],
    ["Bank transfer not accepted, unless agreed beforehand", '"bank transfer"'],
    ["Bank transfer not accepted at checkout, message me", '"bank transfer"'],
    ["Cash on collection not possible, except at weekends", '"cash on collection"'],
    ["No bank transfer, unless agreed beforehand", '"bank transfer"'],
    ["No cash on collection (unless local)", '"cash on collection"'],
    ["No PayPal friends and family, unless you're a regular buyer", '"paypal friends"'],
    ["If you can't do bank transfer, PayPal is fine", '"bank transfer"'],
    ["Unless agreed, we do not accept bank transfer", '"bank transfer"'],
    ["Why not do bank transfer and save the fees", '"bank transfer"'],
    ["Cash on collection not possible at weekends", '"cash on collection"'],
    ["Cash on collection not available to buyers outside the town", '"cash on collection"'],
    ["WhatsApp not available to new buyers", '"whatsapp"'],
    ["Cash on collection is not possible while I'm at work", '"cash on collection"'],
    ["Not cash only, PayPal also accepted", '"cash only"'],
    ["Bank transfers accepted", '"bank transfer"'],
    ["Happy to take bank transfers", '"bank transfer"'],
    ["No returns. Bank transfer accepted.", '"bank transfer"'],
    ["No returns, bank transfer accepted", '"bank transfer"'],
    ["No returns; cash on collection", '"cash on collection"'],
    ["Never used cash on collection", '"cash on collection"'],
    ["Not bothered about cash on collection or posting", '"cash on collection"'],
    ["No bank transfer, but cash on collection is fine", '"cash on collection"'],
    ["No bank transfers. Bank transfer for collection only", '"bank transfer"'],
    ["Cash on collection only not posted", '"cash on collection"'],
    ["Cash on collection only, not posted", '"cash on collection"'],
    ["Payments outside eBay get a discount", '"payments outside"'],
    ["PayPal F.F. saves the fees", '"paypal f f"'],
    ["Pay by bank transfer (no PayPal)", '"bank transfer"'],
    ["No paypal friends - bank transfer instead", '"bank transfer"'],
    ["Ring 07700 900 123. No bank transfers", "a phone number"],
    ["No, bank transfer is fine", '"bank transfer"'],
    ["Bank transfer. Not accepted: cheques or cash", '"bank transfer"'],
    ["I don't accept bank transfer but bank transfer for collection is ok", '"bank transfer"'],
    ["Payment via PayPal (friends and family)", '"paypal friends"'],
    ["PayPal (F&F) only", '"paypal f f"'],
    ["PayPal: friends and family only", '"paypal friends"'],
    ["Payment: PayPal, friends & family", '"paypal friends"'],
    ["PayPal F. F. only", '"paypal f f"'],
    ["Postage: No Cash on collection only", '"cash on collection"'],
    ["Returns: No Bank transfer accepted", '"bank transfer"'],
    ["Offers? No WhatsApp me for details", '"whatsapp"'],
    ["Postage? No - cash on collection only", '"cash on collection"'],
    ["Returns: No Bank transfer", '"bank transfer"'],
    ["Offers? No WhatsApp", '"whatsapp"'],
    ["Strictly no bank transfers", '"bank transfer"'],
    ["No bank transfer accepted", '"bank transfer"'],
    ["No bank transfers, cash on collection only", '"cash on collection"'],
    ["eBay doesn't allow bank transfer so message me", '"bank transfer"'],
    ["Bank transfer isn't accepted by eBay, so message me", '"bank transfer"'],
    ["Bank transfer not allowed by eBay so drop me a message", '"bank transfer"'],
    ["WhatsApp not allowed by eBay so send me a message", '"whatsapp"'],
    ["We don't do bank transfer through eBay, message me", '"bank transfer"'],
    ["I can't take bank transfer via eBay, so message me", '"bank transfer"'],
    ["Cash on collection is not possible through eBay so message me", '"cash on collection"'],
    ["Money bank transferred same day", '"bank transfer"'],
  ];
  for (const [text, sign] of meant) assert.deepEqual(offEbaySign(text), { sign, refused: false }, text);
  const caution = (sign: string) => [`it mentions ${sign}, a sign of paying or talking outside eBay, which loses eBay's Money Back Guarantee`];
  const maybe = (sign: string) => [`it mentions ${sign}, maybe only to say no to it, but paying or talking outside eBay loses eBay's Money Back Guarantee`];
  const described: [string, string][] = [
    ["<ul><li>Postage: No</li><li>Cash on collection only</li></ul>", '"cash on collection"'],
    ["<p>Returns: No</p><p>Bank transfer accepted</p>", '"bank transfer"'],
    ["<p>Offers? No</p><p>WhatsApp me for details</p>", '"whatsapp"'],
    ["<p>Returns: No</p><p>Bank transfer</p>", '"bank transfer"'],
    ["<ul><li>Swaps - sorry, no</li><li>Bank transfer please</li></ul>", '"bank transfer"'],
    ["<ul><li>Offers, no</li><li>PayPal friends and family please</li></ul>", '"paypal friends"'],
    ["<p>Can you post it? Sorry, no</p><p>Cash on collection please</p>", '"cash on collection"'],
    ["<p>Collection in person.<br>No bank transfers.</p><p>Bank transfer for postage is fine</p>", '"bank transfer"'],
    ["<p>Payment through eBay checkout please.</p><p>Bank transfer not accepted (unless agreed in advance).</p>", '"bank transfer"'],
  ];
  const cleaned = (html: string) => plainText(html, 4000);
  for (const [html, sign] of described) assert.deepEqual(cautions(search(), listing(), cleaned(html)), caution(sign), html);
  assert.deepEqual(cautions(search(), listing(), cleaned("<p>Collected or posted.</p><p>No bank transfers, sorry.</p>")), maybe('"bank transfer"'));
  assert.deepEqual(cautions(search(), listing({ summary: "Postage: No Cash on collection only" })), caution('"cash on collection"'));
  assert.deepEqual(cautions(search(), listing({ title: "Dell OptiPlex 7070 SFF", summary: "No bank transfers" }), "Message me on WhatsApp"), caution('"whatsapp"'));
  assert.deepEqual(cautions(search(), listing({ summary: "No bank transfers" }), "Cash on collection is not possible"), maybe('"bank transfer"'));
});
