import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { avoidLists, conditionIds, defaultLimits, fingerprint, loadSearches, readSearches, type Search } from "./searches.js";

const sources = ["ebay"];
const made: string[] = [];

after(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});

const smallest = { id: "optiplex", name: "OptiPlex 7070 SFF", switch: "on", query: "optiplex 7070 sff" };

function listOf(...searches: unknown[]) {
  return JSON.stringify({ searches });
}

function one(overrides: Record<string, unknown> = {}): Search {
  const list = readSearches(listOf({ ...smallest, ...overrides }), sources);
  assert.equal(list.searches.length, 1);
  return list.searches[0];
}

function problemWith(overrides: Record<string, unknown>): string {
  try {
    readSearches(listOf({ ...smallest, ...overrides }), sources);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

function problemIn(text: string): string {
  try {
    readSearches(text, sources);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

test("the smallest search gets every default written out", () => {
  assert.deepEqual(one(), {
    id: "optiplex",
    name: "OptiPlex 7070 SFF",
    group: null,
    on: true,
    source: "ebay",
    query: "optiplex 7070 sff",
    minPrice: null,
    maxPrice: null,
    maxWithPostage: null,
    conditions: [],
    buying: ["buy it now"],
    endingWithinHours: null,
    ukOnly: true,
    exclude: [],
    mustInclude: [],
    categoryId: null,
    sellerMinPercent: null,
    sellerMinFeedback: null,
    everyMinutes: 30,
    dropPercent: null,
    details: null,
    detailsMode: "prefer",
    hideDetails: null,
    collection: null,
    freePostage: false,
    hideVariations: false,
    autoCorrect: false,
    sellerType: null,
    postageShown: false,
    returnsOnly: false,
    avoid: [],
    guidePrice: null,
    guideDate: null,
    greatPercent: 20,
    unit: null,
    alertsPerDay: null,
    endingSoonMinutes: null,
  });
});

test("a search with every setting is read as given, with prices in pence", () => {
  const search = one({
    switch: "off",
    group: "whole pc",
    source: "ebay",
    minPrice: 40,
    maxPrice: 149.99,
    maxWithPostage: 160,
    conditions: ["used", "seller refurbished"],
    buying: ["buy it now", "auction"],
    endingWithinHours: 6,
    ukOnly: false,
    exclude: ["faulty", "no ram"],
    mustInclude: ["7070"],
    categoryId: 171957,
    sellerMinPercent: 98.5,
    sellerMinFeedback: 50,
    everyMinutes: 15,
    dropPercent: 10,
    details: { "Form Factor": ["SFF", "Small Form Factor", "SFF"], "RAM Size": ["16 GB"] },
    detailsMode: "only",
    hideDetails: { "Features": ["Registered"] },
    freePostage: true,
    hideVariations: true,
    autoCorrect: true,
    sellerType: "business",
    postageShown: true,
    returnsOnly: true,
    avoid: ["faulty", "lots", "faulty"],
    guidePrice: 110,
    guideDate: "2026-11-19",
    greatPercent: 25,
    unit: "GB",
    alertsPerDay: 10,
    endingSoonMinutes: 30,
  });
  assert.deepEqual(search, {
    id: "optiplex",
    name: "OptiPlex 7070 SFF",
    group: "whole pc",
    on: false,
    source: "ebay",
    query: "optiplex 7070 sff",
    minPrice: 4000,
    maxPrice: 14999,
    maxWithPostage: 16000,
    conditions: ["used", "seller refurbished"],
    buying: ["buy it now", "auction"],
    endingWithinHours: 6,
    ukOnly: false,
    exclude: ["faulty", "no ram"],
    mustInclude: ["7070"],
    categoryId: "171957",
    sellerMinPercent: 98.5,
    sellerMinFeedback: 50,
    everyMinutes: 15,
    dropPercent: 10,
    details: { "Form Factor": ["SFF", "Small Form Factor"], "RAM Size": ["16 GB"] },
    detailsMode: "only",
    hideDetails: { "Features": ["Registered"] },
    collection: null,
    freePostage: true,
    hideVariations: true,
    autoCorrect: true,
    sellerType: "business",
    postageShown: true,
    returnsOnly: true,
    avoid: ["faulty", "lots"],
    guidePrice: 11000,
    guideDate: "2026-11-19",
    greatPercent: 25,
    unit: "GB",
    alertsPerDay: 10,
    endingSoonMinutes: 30,
  });
});

test("the limits default to 1000 eBay calls and 60 alerts a day, 5 alerts a check", () => {
  assert.deepEqual(readSearches(listOf(smallest), sources).limits, { callsPerDay: 1000, alertsPerDay: 60, alertsPerCheck: 5 });
  assert.deepEqual(defaultLimits, { callsPerDay: 1000, alertsPerDay: 60, alertsPerCheck: 5 });
});

test("each limit can be set on its own", () => {
  const list = readSearches(JSON.stringify({ limits: { alertsPerDay: 20 }, searches: [smallest] }), sources);
  assert.deepEqual(list.limits, { callsPerDay: 1000, alertsPerDay: 20, alertsPerCheck: 5 });
});

test("reading limits never changes the defaults for the next read", () => {
  readSearches(JSON.stringify({ limits: { callsPerDay: 5, alertsPerDay: 5, alertsPerCheck: 1 }, searches: [] }), sources);
  assert.deepEqual(readSearches(listOf(), sources).limits, { callsPerDay: 1000, alertsPerDay: 60, alertsPerCheck: 5 });
});

test("limits outside their ranges are refused by name", () => {
  const bad: [Record<string, unknown>, string][] = [
    [{ callsPerDay: 5001 }, "limits: callsPerDay must be a whole number from 1 to 5000"],
    [{ callsPerDay: 0 }, "limits: callsPerDay must be a whole number from 1 to 5000"],
    [{ alertsPerDay: 251 }, "limits: alertsPerDay must be a whole number from 1 to 250"],
    [{ alertsPerDay: 2.5 }, "limits: alertsPerDay must be a whole number from 1 to 250"],
    [{ alertsPerCheck: 21 }, "limits: alertsPerCheck must be a whole number from 1 to 20"],
    [{ alertsPerCheck: "5" }, "limits: alertsPerCheck must be a whole number from 1 to 20"],
    [{ callsPerDay: -1 }, "limits: callsPerDay must be a whole number from 1 to 5000"],
    [{ perDay: 5 }, 'limits: "perDay" isn\'t a setting'],
  ];
  for (const [limits, message] of bad) {
    assert.equal(problemIn(JSON.stringify({ limits, searches: [] })), message);
  }
  assert.equal(problemIn(JSON.stringify({ limits: [], searches: [] })), "limits must be a group of settings in { }");
});

test("an empty list of searches is fine", () => {
  assert.deepEqual(readSearches(listOf(), sources), { searches: [], limits: defaultLimits, quiet: null, postcode: null, files: [] });
});

test("searches keep the order they were written in", () => {
  const list = readSearches(listOf({ ...smallest, id: "b" }, { ...smallest, id: "a" }, { ...smallest, id: "c" }), sources);
  assert.deepEqual(list.searches.map((search) => search.id), ["b", "a", "c"]);
});

test("a file saved with a byte order mark at the start still reads", () => {
  assert.equal(readSearches(`\uFEFF${listOf(smallest)}`, sources).searches.length, 1);
});

test("text that isn't JSON is refused, with the line and column when Node gives them", () => {
  const message = problemIn('{\n  "searches": [\n    { "id": "a", }\n  ]\n}');
  assert.match(message, /^it isn't valid JSON( \(line 3, column \d+\))?$/);
  assert.equal(problemIn(""), "it isn't valid JSON");
  assert.match(problemIn("{ searches: [] }"), /^it isn't valid JSON/);
  assert.match(problemIn('{ "searches": [] } // mine'), /^it isn't valid JSON/);
});

test("a JSON error never repeats what the file said", () => {
  const message = problemIn('{ "searches": [ { "id": "a", "secret-thing": zzzz } ] }');
  assert.match(message, /^it isn't valid JSON/);
  assert.ok(!message.includes("secret-thing"));
  assert.ok(!message.includes("zzzz"));
});

test("JSON that isn't a group of settings is refused", () => {
  for (const text of ["[]", "null", '"searches"', "42", "true"]) {
    assert.equal(problemIn(text), "it must start with { and hold a searches list");
  }
});

test("a missing or mis-shaped searches list is refused", () => {
  assert.equal(problemIn("{}"), "searches must be a list in [ ]");
  assert.equal(problemIn('{ "searches": {} }'), "searches must be a list in [ ]");
  assert.equal(problemIn('{ "searches": "optiplex" }'), "searches must be a list in [ ]");
});

test("anything else at the top of the file is refused by name", () => {
  assert.equal(problemIn('{ "searches": [], "search": [] }'), '"search" isn\'t a setting');
});

test("a file that's too big is refused before it's parsed", () => {
  const big = `{ "searches": [], "pad": "${"x".repeat(256 * 1024)}" }`;
  assert.equal(problemIn(big), "the file is too big");
});

test("more than 150 searches are refused", () => {
  const many = Array.from({ length: 151 }, (_, i) => ({ ...smallest, id: `s${i}` }));
  assert.equal(problemIn(listOf(...many)), "there can be 150 searches at most, counting every file");
  assert.equal(readSearches(listOf(...many.slice(0, 150)), sources).searches.length, 150);
});

test("a search that isn't a group of settings is refused by its place in the list", () => {
  assert.equal(problemIn(listOf("optiplex")), "search 1: it must be a group of settings in { }");
  assert.equal(problemIn(listOf(smallest, null)), "search 2: it must be a group of settings in { }");
  assert.equal(problemIn(listOf([smallest])), "search 1: it must be a group of settings in { }");
});

test("a problem names the search by its place and its id", () => {
  assert.equal(problemWith({ switch: "yes" }), "search 1 (optiplex): switch must be on or off");
  const message = problemIn(listOf(smallest, { ...smallest, id: "ram", everyMinutes: 1 }));
  assert.equal(message, "search 2 (ram): everyMinutes must be a whole number from 5 to 1440");
});

test("a mistyped setting is refused by name, so a typo can't quietly drop a price limit", () => {
  assert.equal(problemWith({ maxprice: 150 }), 'search 1 (optiplex): "maxprice" isn\'t a setting');
  assert.equal(problemWith({ MaxPrice: 150 }), 'search 1 (optiplex): "MaxPrice" isn\'t a setting');
  assert.equal(problemWith({ on: true }), 'search 1 (optiplex): "on" isn\'t a setting');
});

test("a setting with an odd name is refused without repeating it", () => {
  const message = problemWith({ "max price\r\nTitle: owned": 1 });
  assert.equal(message, "search 1 (optiplex): it has a setting with an odd name");
  assert.equal(problemWith({ ["x".repeat(31)]: 1 }), "search 1 (optiplex): it has a setting with an odd name");
});

test("__proto__, constructor and prototype are refused like any unknown setting and change nothing", () => {
  const text = '{ "searches": [ { "id": "a", "name": "A", "switch": "on", "query": "q", "__proto__": { "on": false, "polluted": true } } ] }';
  assert.equal(problemIn(text), 'search 1 (a): "__proto__" isn\'t a setting');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(problemWith({ constructor: { prototype: { polluted: true } } }), 'search 1 (optiplex): "constructor" isn\'t a setting');
  assert.equal(problemIn('{ "searches": [], "__proto__": { "polluted": true } }'), '"__proto__" isn\'t a setting');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("the switch must be written out as exactly on or off", () => {
  assert.equal(one({ switch: "on" }).on, true);
  assert.equal(one({ switch: "off" }).on, false);
  for (const value of [undefined, true, false, "On", "OFF", " on", "yes", 1, null]) {
    const { switch: _dropped, ...rest } = smallest;
    const search = value === undefined ? rest : { ...smallest, switch: value };
    assert.equal(problemIn(listOf(search)), "search 1 (optiplex): switch must be on or off", `accepted ${String(value)}`);
  }
});

test("ids are lower-case letters, digits and single hyphens, 40 at most", () => {
  for (const id of ["a", "optiplex-7070-sff", "2x16", "a".repeat(40)]) assert.equal(one({ id }).id, id);
  for (const id of ["", "Optiplex", "opti plex", "-a", "a-", "a--b", "a_b", "a/b", "../etc", "a".repeat(41), "__proto__", 7, null, "café"]) {
    assert.match(problemWith({ id }), /^search 1: id must be lower-case letters, digits and hyphens/, `accepted ${String(id)}`);
  }
});

test("two searches can't share an id", () => {
  const message = problemIn(listOf(smallest, { ...smallest, name: "Another" }));
  assert.equal(message, "search 2 (optiplex): its id is used by an earlier search");
});

test("names are short and plain, because they go in a notification's title", () => {
  for (const name of ["A", "OptiPlex 7070 SFF", "DDR4 RAM (2x16GB)", "Dell/HP SFF: i5+", "Sam's GPU, mk.2 & co_x-y", "a".repeat(40)]) {
    assert.equal(one({ name }).name, name);
  }
  const bad = ["", " leading", "(bracket first)", "a".repeat(41), "Deal\r\nX-Priority: 5", "Tab\there", "Pound £150", "Emoji 🔥", "semi;colon", 'quote"', "back\\slash", 7, null];
  for (const name of bad) {
    assert.match(problemWith({ name }), /^search 1 \(optiplex\): name must be 1 to 40 plain letters/, `accepted ${String(name)}`);
  }
});

test("the source must be one the watcher has", () => {
  assert.equal(one({ source: "ebay" }).source, "ebay");
  assert.equal(problemWith({ source: "gumtree" }), "search 1 (optiplex): source must be one of: ebay");
  assert.equal(problemWith({ source: 7 }), "search 1 (optiplex): source must be one of: ebay");
  assert.equal(problemWith({ source: null }), "search 1 (optiplex): source must be one of: ebay");
  assert.equal(readSearches(listOf({ ...smallest, source: "other" }), ["ebay", "other"]).searches[0].source, "other");
  assert.equal(problemIn(listOf({ ...smallest, source: "third" })), "search 1 (optiplex): source must be one of: ebay");
});

test("the query is trimmed and must be 1 to 100 characters with no control characters or *", () => {
  assert.equal(one({ query: "  optiplex 7070  " }).query, "optiplex 7070");
  assert.equal(one({ query: "(optiplex 7070, elitedesk 800 g4) sff" }).query, "(optiplex 7070, elitedesk 800 g4) sff");
  assert.equal(one({ query: "q".repeat(100) }).query.length, 100);
  for (const query of ["", "   ", "q".repeat(101), "opti\nplex", "opti\u0000plex", "opti\u2028plex", 7, null, ["optiplex"]]) {
    assert.equal(problemWith({ query }), "search 1 (optiplex): query must be 1 to 100 characters", `accepted ${String(query)}`);
  }
  assert.equal(problemWith({ query: "optiplex*" }), "search 1 (optiplex): query can't use *");
});

test("prices are pounds with at most two decimals, turned into whole pence", () => {
  assert.equal(one({ maxPrice: 150 }).maxPrice, 15000);
  assert.equal(one({ maxPrice: 149.99 }).maxPrice, 14999);
  assert.equal(one({ maxPrice: 0.01 }).maxPrice, 1);
  assert.equal(one({ maxPrice: 19.9 }).maxPrice, 1990);
  assert.equal(one({ maxPrice: 1.15 }).maxPrice, 115);
  assert.equal(one({ maxPrice: 100000 }).maxPrice, 10_000_000);
  assert.equal(one({ minPrice: 0.5 }).minPrice, 50);
  assert.equal(one({ maxWithPostage: 60 }).maxWithPostage, 6000);
});

test("a price that isn't a sensible amount is refused by name", () => {
  for (const value of [0, -5, 149.999, 100000.01, "150", "£150", null, true, [150], Number.NaN]) {
    assert.equal(
      problemWith({ maxPrice: value }),
      "search 1 (optiplex): maxPrice must be an amount in pounds above 0, like 150 or 149.99",
      `accepted ${String(value)}`,
    );
  }
  assert.match(problemWith({ minPrice: "cheap" }), /minPrice must be an amount in pounds/);
  assert.match(problemWith({ maxWithPostage: 0 }), /maxWithPostage must be an amount in pounds/);
});

test("the lowest price must be below the highest", () => {
  assert.equal(problemWith({ minPrice: 150, maxPrice: 150 }), "search 1 (optiplex): minPrice must be below maxPrice");
  assert.equal(problemWith({ minPrice: 200, maxPrice: 150 }), "search 1 (optiplex): minPrice must be below maxPrice");
  assert.equal(problemWith({ minPrice: 70, maxWithPostage: 60 }), "search 1 (optiplex): minPrice must be below maxWithPostage");
  assert.equal(one({ minPrice: 40, maxPrice: 150, maxWithPostage: 160 }).minPrice, 4000);
});

test("conditions must come from the known list, and repeats are dropped", () => {
  assert.deepEqual(one({ conditions: ["used", "used", "new"] }).conditions, ["used", "new"]);
  assert.deepEqual(one({ conditions: Object.keys(conditionIds) }).conditions, Object.keys(conditionIds));
  for (const conditions of [[], ["Used"], ["used", "broken"], "used", [3000], [null], ["toString"], ["__proto__"]]) {
    assert.match(problemWith({ conditions }), /^search 1 \(optiplex\): conditions must be a list of one or more of: new, opened,/, `accepted ${JSON.stringify(conditions)}`);
  }
});

test("every condition name has eBay's number for it", () => {
  assert.deepEqual(conditionIds, {
    "new": "1000",
    "opened": "1500",
    "certified refurbished": "2000",
    "excellent refurbished": "2010",
    "very good refurbished": "2020",
    "good refurbished": "2030",
    "seller refurbished": "2500",
    "used": "3000",
    "for parts": "7000",
  });
});

test("buying is buy it now unless auction is asked for", () => {
  assert.deepEqual(one().buying, ["buy it now"]);
  assert.deepEqual(one({ buying: ["auction"] }).buying, ["auction"]);
  assert.deepEqual(one({ buying: ["auction", "buy it now", "auction"] }).buying, ["auction", "buy it now"]);
  for (const buying of [[], ["bid"], "auction", ["AUCTION"], [true], ["buy it now", "best offer"]]) {
    assert.equal(problemWith({ buying }), "search 1 (optiplex): buying must be a list of one or more of: buy it now, auction");
  }
});

test("endingWithinHours needs auctions and a whole number of hours", () => {
  assert.equal(one({ buying: ["auction"], endingWithinHours: 1 }).endingWithinHours, 1);
  assert.equal(one({ buying: ["auction", "buy it now"], endingWithinHours: 240 }).endingWithinHours, 240);
  assert.equal(problemWith({ endingWithinHours: 6 }), "search 1 (optiplex): endingWithinHours only works when buying includes auction");
  for (const hours of [0, 241, 1.5, "6", null]) {
    assert.equal(problemWith({ buying: ["auction"], endingWithinHours: hours }), "search 1 (optiplex): endingWithinHours must be a whole number from 1 to 240");
  }
});

test("ukOnly is on unless it's written as false", () => {
  assert.equal(one().ukOnly, true);
  assert.equal(one({ ukOnly: false }).ukOnly, false);
  for (const ukOnly of ["true", "no", 0, 1, null]) {
    assert.equal(problemWith({ ukOnly }), "search 1 (optiplex): ukOnly must be true or false");
  }
});

test("exclude and mustInclude are lists of short words or phrases, trimmed", () => {
  assert.deepEqual(one({ exclude: [" faulty ", "no ram", "repair*"] }).exclude, ["faulty", "no ram", "repair*"]);
  assert.deepEqual(one({ mustInclude: ["7070", "i5"] }).mustInclude, ["7070", "i5"]);
  assert.deepEqual(one({ exclude: [] }).exclude, []);
  assert.equal(one({ exclude: Array.from({ length: 50 }, (_, i) => `word${i}`) }).exclude.length, 50);
  const bad = ["faulty", [""], ["   "], ["x".repeat(61)], [7], [null], ["bad\nword"], ["***"], ["-"], Array.from({ length: 51 }, () => "x"), [["nested"]]];
  for (const exclude of bad) {
    assert.match(problemWith({ exclude }), /^search 1 \(optiplex\): exclude must be a list of up to 50 words or phrases/, `accepted ${JSON.stringify(exclude).slice(0, 40)}`);
  }
  assert.match(problemWith({ mustInclude: "7070" }), /^search 1 \(optiplex\): mustInclude must be a list/);
});

test("categoryId is one of eBay's category numbers, as a number or text", () => {
  assert.equal(one({ categoryId: 179 }).categoryId, "179");
  assert.equal(one({ categoryId: "170083" }).categoryId, "170083");
  assert.equal(one().categoryId, null);
  for (const categoryId of [[], [179], "pc", "179,180", 1.5, -1, "17|9", "1".repeat(11), null, "179}&q=free", "179&limit=1", " 179", true]) {
    assert.equal(problemWith({ categoryId }), "search 1 (optiplex): categoryId must be one of eBay's category numbers", `accepted ${JSON.stringify(categoryId)}`);
  }
});

test("the old plural name isn't quietly accepted", () => {
  assert.equal(problemWith({ categoryIds: [179] }), 'search 1 (optiplex): "categoryIds" isn\'t a setting');
});

test("the seller checks take a percentage and a whole number of ratings", () => {
  assert.equal(one({ sellerMinPercent: 98.5 }).sellerMinPercent, 98.5);
  assert.equal(one({ sellerMinPercent: 0 }).sellerMinPercent, 0);
  assert.equal(one({ sellerMinPercent: 100 }).sellerMinPercent, 100);
  assert.equal(one({ sellerMinFeedback: 0 }).sellerMinFeedback, 0);
  assert.equal(one({ sellerMinFeedback: 500 }).sellerMinFeedback, 500);
  for (const value of [-1, 100.1, "98", null]) {
    assert.equal(problemWith({ sellerMinPercent: value }), "search 1 (optiplex): sellerMinPercent must be a number from 0 to 100");
  }
  for (const value of [-1, 1.5, "50", null]) {
    assert.equal(problemWith({ sellerMinFeedback: value }), "search 1 (optiplex): sellerMinFeedback must be a whole number, 0 or more");
  }
});

test("everyMinutes is a whole number from 5 minutes to a day, 30 unless set", () => {
  assert.equal(one().everyMinutes, 30);
  assert.equal(one({ everyMinutes: 5 }).everyMinutes, 5);
  assert.equal(one({ everyMinutes: 1440 }).everyMinutes, 1440);
  for (const value of [4, 0, -30, 1441, 7.5, "30", null]) {
    assert.equal(problemWith({ everyMinutes: value }), "search 1 (optiplex): everyMinutes must be a whole number from 5 to 1440");
  }
});

test("dropPercent is from 1 to 90", () => {
  assert.equal(one({ dropPercent: 1 }).dropPercent, 1);
  assert.equal(one({ dropPercent: 12.5 }).dropPercent, 12.5);
  assert.equal(one({ dropPercent: 90 }).dropPercent, 90);
  for (const value of [0, 0.5, 91, "10", null, true]) {
    assert.equal(problemWith({ dropPercent: value }), "search 1 (optiplex): dropPercent must be a number from 1 to 90");
  }
});

test("every problem in one search is reported together", () => {
  const message = problemWith({ switch: "maybe", maxPrice: "150", everyMinutes: 1 });
  assert.equal(
    message,
    "search 1 (optiplex): switch must be on or off; search 1 (optiplex): maxPrice must be an amount in pounds above 0, like 150 or 149.99; search 1 (optiplex): everyMinutes must be a whole number from 5 to 1440",
  );
});

test("only the first five problems are spelled out, with a count of the rest", () => {
  const broken = Array.from({ length: 8 }, (_, i) => ({ ...smallest, id: `s${i}`, switch: "maybe" }));
  const message = problemIn(listOf(...broken));
  assert.equal(message.split("; ").length, 6);
  assert.ok(message.endsWith("; and 3 more"));
  assert.ok(message.startsWith("search 1 (s0): switch must be on or off; search 2 (s1):"));
});

test("one bad search refuses the whole list, so a half-read list never runs", () => {
  assert.throws(() => readSearches(listOf(smallest, { ...smallest, id: "ram", query: "" }), sources));
});

test("a problem message never repeats a value from the file", () => {
  const secretish = "hunter2-do-not-print";
  const messages = [
    problemWith({ id: secretish.toUpperCase() }),
    problemWith({ name: `${secretish}\u0007` }),
    problemWith({ switch: secretish }),
    problemWith({ source: secretish }),
    problemWith({ query: `${secretish}*` }),
    problemWith({ maxPrice: secretish }),
    problemWith({ conditions: [secretish] }),
    problemWith({ exclude: [`${secretish}\n`] }),
    problemWith({ categoryId: secretish }),
  ];
  for (const message of messages) {
    assert.notEqual(message, "");
    assert.ok(!message.toLowerCase().includes("hunter2"), message);
  }
});

test("problem messages stay short however broken the file is", () => {
  const broken = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, bad1: 1, bad2: 2, bad3: 3 }));
  assert.ok(problemIn(listOf(...broken)).length < 600);
});

test("the example list in the repo is valid, and every search in it is switched off", async () => {
  const text = await readFile(new URL("../../../src/modules/deals/searches.example.json", import.meta.url), "utf8");
  const list = readSearches(text, sources);
  assert.ok(list.searches.length >= 3);
  assert.deepEqual(list.searches.map((search) => search.on), list.searches.map(() => false));
  assert.deepEqual(list.limits, defaultLimits);
  assert.equal(new Set(list.searches.map((search) => search.id)).size, list.searches.length);
  assert.ok(list.searches.every((search) => search.group !== null));
});

test("the catalogue in the repo loads beside the example list, every search off and in a group, within a day's calls if all were on", async () => {
  const folder = new URL("../../../src/modules/deals/", import.meta.url);
  const example = JSON.parse(await readFile(new URL("searches.example.json", folder), "utf8")) as Record<string, unknown>;
  const catalogue = await readFile(new URL("catalogue.example.json", folder), "utf8");
  const list = readSearches(JSON.stringify({ ...example, more: ["catalogue.json"] }), ["ebay", "hotukdeals"], { "catalogue.json": catalogue });
  const added = list.searches.slice(3);
  assert.ok(added.length >= 100);
  assert.ok(list.searches.length <= 120, `${list.searches.length} leaves less than 30 of the 150 for your own searches`);
  assert.ok(added.every((search) => !search.on && search.group !== null), "every catalogue search is off and grouped");
  const fromEbay = added.filter((search) => search.source === "ebay");
  assert.ok(fromEbay.every((search) => search.guidePrice !== null && search.guideDate === "2026-11-19"));
  assert.ok(added.filter((search) => search.source === "hotukdeals").length >= 5);
  assert.deepEqual([...new Set(added.filter((search) => search.categoryId !== null).map((search) => `${search.group} ${search.categoryId}`))], ["ram 170083", "ram 11210"]);
  const ram = fromEbay.filter((search) => search.group === "ram");
  assert.ok(ram.every((search) => search.unit === "GB" && (search.categoryId === "11210" || (search.categoryId === "170083" && search.hideDetails !== null))));
  assert.deepEqual(ram.filter((search) => search.categoryId === "11210").map((search) => search.id), ["ddr4-rdimm-32gb"]);
  const servers = fromEbay.filter((search) => search.group === "server");
  const spareParts = ["motherboard", "mainboard", "board only", "psu only", "power supply only"];
  assert.ok(servers.length > 0 && servers.every((search) => spareParts.every((word) => search.exclude.includes(word))), "server searches keep spare parts out");
  const cards = fromEbay.filter((search) => search.group === "graphics");
  assert.ok(cards.length >= 8 && cards.every((search) => search.exclude.includes("gaming pc") && search.exclude.includes("prebuilt")), "graphics card searches keep whole PCs out");
  const gaming = ["rtx-3060-12gb", "rx-6600", "rx-6700-xt", "arc-b580"];
  assert.deepEqual(cards.filter((search) => search.exclude.includes("computer") && search.exclude.includes("desktop pc")).map((search) => search.id), gaming, "only the gaming cards also leave out computer and desktop pc, since small cards are often sold for SFF desktop PCs");
  const storage = fromEbay.filter((search) => search.group === "storage");
  const drives = storage.filter((search) => search.id.startsWith("hdd-"));
  assert.ok(drives.length === 4 && drives.every((search) => !search.hideVariations), "hard-drive searches keep listings with several options");
  assert.ok(storage.length > drives.length && storage.filter((search) => !drives.includes(search)).every((search) => search.hideVariations), "SSD and NVMe searches hide listings with several options");
  const feedCalls = (24 * 60) / Math.min(...added.filter((search) => search.source === "hotukdeals").map((search) => search.everyMinutes));
  const callsADay = fromEbay.reduce((sum, search) => sum + (24 * 60) / search.everyMinutes * (1 + Object.keys(search.hideDetails ?? {}).length), feedCalls);
  assert.ok(callsADay < 1000, String(callsADay));
});

async function fileWith(text: string | null) {
  const dir = await mkdtemp(join(tmpdir(), "deals-list-"));
  made.push(dir);
  const path = join(dir, "searches.json");
  if (text !== null) await writeFile(path, text);
  return path;
}

test("loadSearches reads and checks the file", async () => {
  const list = await loadSearches(await fileWith(listOf(smallest)), sources);
  assert.equal(list.searches[0].id, "optiplex");
});

test("loadSearches says plainly when the file isn't there", async () => {
  await assert.rejects(loadSearches(await fileWith(null), sources), { message: "there's no searches.json in the deals folder" });
});

test("loadSearches says when the file can't be read, without the path or the system's own error", async () => {
  const path = await fileWith(null);
  await assert.rejects(loadSearches(join(path, ".."), sources), { message: "searches.json couldn't be read" });
});

test("loadSearches passes on what's wrong with the contents", async () => {
  await assert.rejects(loadSearches(await fileWith(listOf({ ...smallest, switch: "yes" })), sources), {
    message: "search 1 (optiplex): switch must be on or off",
  });
});

test("the fingerprint is the same for the same search, however often it's read", () => {
  assert.equal(fingerprint(one()), fingerprint(one()));
  assert.match(fingerprint(one()), /^[0-9a-f]{16}$/);
});

test("the fingerprint ignores what doesn't change which listings match", () => {
  const base = fingerprint(one({ exclude: ["faulty", "spares"], conditions: ["used", "new"] }));
  assert.equal(fingerprint(one({ exclude: ["faulty", "spares"], conditions: ["used", "new"], name: "Renamed" })), base);
  assert.equal(fingerprint(one({ exclude: ["faulty", "spares"], conditions: ["used", "new"], switch: "off" })), base);
  assert.equal(fingerprint(one({ exclude: ["faulty", "spares"], conditions: ["used", "new"], everyMinutes: 60 })), base);
  assert.equal(fingerprint(one({ exclude: ["faulty", "spares"], conditions: ["used", "new"], dropPercent: 10 })), base);
  assert.equal(fingerprint(one({ exclude: ["Spares", "FAULTY"], conditions: ["new", "used"] })), base);
  assert.equal(fingerprint(one({ exclude: ["faulty", "spares"], conditions: ["used", "new"], query: "OptiPlex 7070 SFF" })), base);
});

test("the fingerprint changes when anything that decides a match changes", () => {
  const base = fingerprint(one());
  const changes: Record<string, unknown>[] = [
    { query: "optiplex 7080 sff" },
    { minPrice: 40 },
    { maxPrice: 150 },
    { maxWithPostage: 150 },
    { conditions: ["used"] },
    { buying: ["auction"] },
    { buying: ["auction"], endingWithinHours: 6 },
    { ukOnly: false },
    { exclude: ["faulty"] },
    { mustInclude: ["7070"] },
    { categoryId: "179" },
    { sellerMinPercent: 98 },
    { sellerMinFeedback: 10 },
  ];
  const prints = changes.map((change) => fingerprint(one(change)));
  for (const print of prints) assert.notEqual(print, base);
  assert.equal(new Set(prints).size, prints.length);
  assert.notEqual(fingerprint({ ...one(), source: "other" }), base);
});

test("a price limit and a with-postage limit of the same amount aren't confused", () => {
  assert.notEqual(fingerprint(one({ maxPrice: 150 })), fingerprint(one({ maxWithPostage: 150 })));
  assert.notEqual(fingerprint(one({ exclude: ["x"] })), fingerprint(one({ mustInclude: ["x"] })));
});

test("item details need a category, and every name and value has to be safe to send to eBay", () => {
  assert.deepEqual(one({ categoryId: 179, details: { "Form Factor": ["SFF"] } }).details, { "Form Factor": ["SFF"] });
  assert.equal(one({ categoryId: 179, details: { "Form Factor": ["SFF"] } }).detailsMode, "prefer");
  assert.match(problemWith({ details: { "Form Factor": ["SFF"] } }), /details only works with a categoryId/);
  const refused: unknown[] = [
    {},
    [],
    "Form Factor",
    { "Form Factor": [] },
    { "Form Factor": "SFF" },
    { "Form Factor": [7] },
    { "Form Factor": [" SFF"] },
    { " Form Factor": ["SFF"] },
    { "Form,Factor": ["SFF"] },
    { "Form:Factor": ["SFF"] },
    { "categoryId": ["1"] },
    { "CategoryID": ["1"] },
    { "Form Factor": ["SFF|Tower"] },
    { "Form Factor": ["SFF}"] },
    { "Form Factor": ["{SFF"] },
    { "Form Factor": ["SFF\\"] },
    { "Form Factor": ["SF\nF"] },
    { "Form Factor": [""] },
    { "Form Factor": ["x".repeat(61)] },
    { ["x".repeat(61)]: ["SFF"] },
    { "Form Factor": Array.from({ length: 21 }, (_, i) => `v${i}`) },
    Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`Name ${i}`, ["x"]])),
  ];
  for (const details of refused) assert.match(problemWith({ categoryId: 179, details }), /details must be 1 to 10/, JSON.stringify(details));
  assert.match(problemIn('{"searches":[{"id":"optiplex","name":"OptiPlex","switch":"on","query":"x","categoryId":179,"details":{"__proto__":["SFF"]}}]}'), /details must be 1 to 10/);
  assert.equal(Object.getPrototypeOf(one({ categoryId: 179, details: { "Form Factor": ["SFF"] } }).details), Object.prototype);
  assert.deepEqual(one({ categoryId: 179, details: { "Processor": ["Intel Core i5-9500, 9th Gen: 3.0 GHz"] } }).details, { "Processor": ["Intel Core i5-9500, 9th Gen: 3.0 GHz"] });
});

test("detailsMode is prefer or only, and only alongside details", () => {
  assert.equal(one({ categoryId: 179, details: { "Type": ["Desktop"] }, detailsMode: "only" }).detailsMode, "only");
  assert.match(problemWith({ categoryId: 179, details: { "Type": ["Desktop"] }, detailsMode: "strict" }), /detailsMode must be prefer or only/);
  assert.match(problemWith({ detailsMode: "only" }), /detailsMode only works with details/);
});

test("the yes-or-no settings take true or false and nothing else", () => {
  for (const key of ["autoCorrect", "postageShown", "returnsOnly"] as const) {
    assert.equal(one({ [key]: true })[key], true);
    assert.equal(one({ [key]: false })[key], false);
    for (const odd of ["true", 1, null, "yes"]) assert.match(problemWith({ [key]: odd }), new RegExp(`${key} must be true or false`));
  }
});

test("sellerType, unit and avoid only take the names the watcher knows", () => {
  assert.equal(one({ sellerType: "private" }).sellerType, "private");
  for (const odd of ["Business", "trader", "", true, null]) assert.match(problemWith({ sellerType: odd }), /sellerType must be business or private/);
  assert.equal(one({ unit: "TB" }).unit, "TB");
  for (const odd of ["gb", "MB", "", 1, null]) assert.match(problemWith({ unit: odd }), /unit must be one of: GB, TB/);
  assert.deepEqual(one({ avoid: ["laptop ram", "server ram"] }).avoid, ["laptop ram", "server ram"]);
  for (const odd of [[], ["scams"], "faulty", ["faulty", 7], null]) assert.match(problemWith({ avoid: odd }), /avoid must be a list of one or more of: faulty, incomplete, parts only, lots, laptop ram, server ram/);
});

test("every built-in avoid phrase is one the matcher can use", () => {
  for (const [name, phrases] of Object.entries(avoidLists)) {
    assert.ok(phrases.length > 0, name);
    for (let at = 0; at < phrases.length; at += 50) assert.deepEqual(one({ exclude: phrases.slice(at, at + 50) }).exclude, phrases.slice(at, at + 50), name);
    assert.equal(new Set(phrases).size, phrases.length, name);
  }
});

test("a guide price is in pounds, and its date and great-deal percentage only work with it", () => {
  assert.equal(one({ guidePrice: 109.99 }).guidePrice, 10999);
  for (const odd of [0, -5, "110", 1.999, null]) assert.match(problemWith({ guidePrice: odd }), /guidePrice must be an amount in pounds above 0/);
  assert.equal(one({ guidePrice: 110, guideDate: "2026-02-28" }).guideDate, "2026-02-28");
  for (const odd of ["2026-02-30", "2026-13-01", "19/11/2026", "2026-11-19T00:00:00Z", 20261119, null]) assert.match(problemWith({ guidePrice: 110, guideDate: odd }), /guideDate must be a real date/);
  assert.match(problemWith({ guideDate: "2026-11-19" }), /guideDate only works with a guidePrice/);
  assert.equal(one({ guidePrice: 110, greatPercent: 35 }).greatPercent, 35);
  for (const odd of [0, 91, 12.5, "20", null]) assert.match(problemWith({ guidePrice: 110, greatPercent: odd }), /greatPercent must be a whole number from 1 to 90/);
  assert.match(problemWith({ greatPercent: 30 }), /greatPercent only works with a guidePrice/);
});

test("a search's own daily alert limit and its ending-soon reminder have sensible ranges", () => {
  assert.equal(one({ alertsPerDay: 1 }).alertsPerDay, 1);
  for (const odd of [0, 251, 2.5, "10", null]) assert.match(problemWith({ alertsPerDay: odd }), /alertsPerDay must be a whole number from 1 to 250/);
  assert.equal(one({ buying: ["auction"], endingSoonMinutes: 5, everyMinutes: 5 }).endingSoonMinutes, 5);
  assert.equal(one({ buying: ["auction"], endingSoonMinutes: 30 }).endingSoonMinutes, 30);
  assert.match(problemWith({ buying: ["auction"], endingSoonMinutes: 29 }), /endingSoonMinutes must be at least everyMinutes/);
  assert.match(problemWith({ buying: ["auction"], endingSoonMinutes: 60, everyMinutes: 61 }), /endingSoonMinutes must be at least everyMinutes/);
  for (const odd of [4, 721, 7.5, "30", null]) assert.match(problemWith({ buying: ["auction"], endingSoonMinutes: odd }), /endingSoonMinutes must be a whole number from 5 to 720/);
  assert.match(problemWith({ endingSoonMinutes: 30 }), /endingSoonMinutes only works when buying includes auction/);
});

test("quiet hours are two clock times, may cross midnight, and let nothing through unless asked", () => {
  const quiet = (value: unknown) => readSearches(JSON.stringify({ searches: [], quiet: value }), sources).quiet;
  assert.deepEqual(quiet({ from: "23:00", to: "07:00" }), { from: 1380, to: 420, allow: "none" });
  assert.deepEqual(quiet({ from: "00:00", to: "23:59", allow: "great" }), { from: 0, to: 1439, allow: "great" });
  assert.equal(readSearches(listOf(), sources).quiet, null);
  const problem = (value: unknown) => problemIn(JSON.stringify({ searches: [], quiet: value }));
  for (const odd of [{ from: "23:00" }, { from: "24:00", to: "07:00" }, { from: "7:00", to: "23:00" }, { from: "23:60", to: "07:00" }, { from: 23, to: 7 }, { from: "23:00:00", to: "07:00" }]) {
    assert.match(problem(odd), /quiet: from and to must be times like 23:00 and 07:00/, JSON.stringify(odd));
  }
  assert.match(problem({ from: "07:00", to: "07:00" }), /quiet: from and to can't be the same time/);
  assert.match(problem({ from: "23:00", to: "07:00", allow: "all" }), /quiet: allow must be none or great/);
  assert.match(problem({ from: "23:00", to: "07:00", days: ["sat"] }), /quiet: "days" isn't a setting/);
  assert.match(problem("23:00-07:00"), /quiet must be a group of settings/);
  assert.match(problem(null), /quiet must be a group of settings/);
});

test("a search that uses none of the newer settings keeps the fingerprint it always had", () => {
  const old = (search: Search) =>
    createHash("sha256")
      .update(
        JSON.stringify([
          search.source,
          search.query.toLowerCase(),
          search.minPrice,
          search.maxPrice,
          search.maxWithPostage,
          [...search.conditions].sort(),
          [...search.buying].sort(),
          search.endingWithinHours,
          search.ukOnly,
          search.exclude.map((word) => word.toLowerCase()).sort(),
          search.mustInclude.map((word) => word.toLowerCase()).sort(),
          search.categoryId,
          search.sellerMinPercent,
          search.sellerMinFeedback,
        ]),
      )
      .digest("hex")
      .slice(0, 16);
  for (const search of [one(), one({ maxPrice: 150, exclude: ["faulty"], categoryId: 179, buying: ["auction", "buy it now"], sellerMinPercent: 98 })]) {
    assert.equal(fingerprint(search), old(search));
  }
  const tuned = { guidePrice: 110, guideDate: "2026-11-19", greatPercent: 30, unit: "GB", alertsPerDay: 5, buying: ["auction"], endingSoonMinutes: 30 };
  assert.equal(fingerprint(one(tuned)), old(one(tuned)));
});

test("the fingerprint changes when a newer setting changes which listings match", () => {
  const base = { categoryId: 179 };
  const prints = [
    fingerprint(one(base)),
    fingerprint(one({ ...base, details: { "Form Factor": ["SFF"] } })),
    fingerprint(one({ ...base, details: { "Form Factor": ["SFF"] }, detailsMode: "only" })),
    fingerprint(one({ ...base, details: { "Form Factor": ["Tower"] } })),
    fingerprint(one({ ...base, autoCorrect: true })),
    fingerprint(one({ ...base, sellerType: "business" })),
    fingerprint(one({ ...base, sellerType: "private" })),
    fingerprint(one({ ...base, postageShown: true })),
    fingerprint(one({ ...base, returnsOnly: true })),
    fingerprint(one({ ...base, avoid: ["faulty"] })),
    fingerprint(one({ ...base, avoid: ["faulty", "lots"] })),
  ];
  assert.equal(new Set(prints).size, prints.length);
  assert.equal(fingerprint(one({ ...base, avoid: ["lots", "faulty"] })), fingerprint(one({ ...base, avoid: ["faulty", "lots"] })));
  assert.equal(
    fingerprint(one({ ...base, details: { "RAM Size": ["16 GB"], "Form Factor": ["SFF"] } })),
    fingerprint(one({ ...base, details: { "Form Factor": ["SFF"], "RAM Size": ["16 GB"] } })),
  );
});
test("hideDetails takes up to three of eBay's item detail names and needs a category", () => {
  assert.deepEqual(one({ categoryId: 170083, hideDetails: { "Form Factor": ["SO-DIMM"] } }).hideDetails, { "Form Factor": ["SO-DIMM"] });
  assert.equal(one().hideDetails, null);
  assert.match(problemWith({ hideDetails: { "Form Factor": ["SO-DIMM"] } }), /hideDetails only works with a categoryId/);
  assert.match(problemWith({ categoryId: 170083, details: { "Form Factor": ["DIMM"] }, detailsMode: "only", hideDetails: { "Form Factor": ["SO-DIMM"] } }), /a detail name can't be in both details and hideDetails/);
  assert.deepEqual(one({ categoryId: 170083, details: { "Type": ["DDR4 SDRAM"] }, hideDetails: { "Form Factor": ["SO-DIMM"] } }).hideDetails, { "Form Factor": ["SO-DIMM"] });
  const four = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`Name ${i}`, ["x"]]));
  for (const odd of [{}, [], "SO-DIMM", { "Form Factor": [] }, { "Form Factor": ["SO|DIMM"] }, { "Form:Factor": ["x"] }, four]) {
    assert.match(problemWith({ categoryId: 170083, hideDetails: odd }), /hideDetails must be 1 to 3 of eBay's item detail names/, JSON.stringify(odd));
  }
});

test("a search without hideDetails keeps the fingerprint it had before, and hideDetails changes it", () => {
  const ram = { id: "ram", name: "RAM", query: "ddr4 2x16gb", categoryId: 170083, maxWithPostage: 120, avoid: ["laptop ram"], details: { "Type": ["DDR4 SDRAM"] } };
  assert.equal(fingerprint(one(ram)), "2593a00cbd2617a1");
  const hidden = fingerprint(one({ ...ram, hideDetails: { "Form Factor": ["SO-DIMM"] } }));
  assert.notEqual(hidden, "2593a00cbd2617a1");
  assert.notEqual(fingerprint(one({ ...ram, hideDetails: { "Form Factor": ["SO-DIMM", "MicroDIMM"] } })), hidden);
  assert.equal(fingerprint(one({ ...ram, hideDetails: { "Form Factor": ["SO-DIMM"] }, name: "Other" })), hidden);
});

test("a postcode at the top lets a search ask for local collection within so many miles", () => {
  const text = (postcode: unknown, extra: Record<string, unknown> = { collectionMiles: 20 }) =>
    JSON.stringify({ postcode, searches: [{ id: "ups", name: "UPS", switch: "on", query: "apc back-ups", ...extra }] });
  for (const [given, kept] of [["ls1 4ap", "LS1 4AP"], [" LS14AP ", "LS1 4AP"], ["LS1", "LS1"], ["ec1a 1bb", "EC1A 1BB"], ["M1", "M1"]]) {
    const list = readSearches(text(given), sources);
    assert.equal(list.postcode, kept, given);
    assert.deepEqual(list.searches[0].collection, { postcode: kept, miles: 20 });
  }
  for (const odd of ["", "LS", "12345", "LS1 4AP X", "LS1-4AP", 7, null, "LS1 4A"]) assert.match(problemIn(text(odd)), /postcode must be a UK postcode/, String(odd));
  assert.match(problemWith({ collectionMiles: 20 }), /collectionMiles needs your postcode at the top of searches.json/);
  for (const odd of [0, 101, 2.5, "20", null]) assert.match(problemIn(text("LS1", { collectionMiles: odd })), /collectionMiles must be a whole number of miles from 1 to 100/, String(odd));
  assert.match(problemIn(text("LS1", { collectionMiles: 20, freePostage: true })), /collectionMiles and freePostage can't both be used/);
  assert.match(problemIn(text("LS1", { collectionMiles: 20, postageShown: true })), /collectionMiles and postageShown can't both be used/);
  assert.equal(readSearches(text("LS1", {}), sources).searches[0].collection, null);
});

test("freePostage is true or false, and collection and free postage change the fingerprint", () => {
  assert.equal(one({ freePostage: true }).freePostage, true);
  assert.match(problemWith({ freePostage: "yes" }), /freePostage must be true or false/);
  const base = fingerprint(one());
  const local = (postcode: string, miles: number) => fingerprint(readSearches(JSON.stringify({ postcode, searches: [{ ...smallest, collectionMiles: miles }] }), sources).searches[0]);
  const prints = [fingerprint(one({ freePostage: true })), local("LS1", 20), local("LS1", 30), local("LS2", 20)];
  assert.equal(new Set([base, ...prints]).size, 5);
  assert.equal(fingerprint(one({ freePostage: false })), base);
});

test("a search can say which part it's for, from a fixed list of groups", () => {
  assert.equal(one({ group: "ram" }).group, "ram");
  assert.equal(one().group, null);
  assert.equal(fingerprint(one({ group: "ram" })), fingerprint(one()));
  for (const odd of ["RAM", "memory", "", 1, null, ["ram"]]) assert.match(problemWith({ group: odd }), /group must be one of: whole pc, server, cpu, motherboard, ram, storage, graphics, power supply, case, cooling, network, expansion, ups, other/, String(odd));
});

test("more names other files in the deals folder whose searches are read after the main list", () => {
  const main = JSON.stringify({ more: ["catalogue.json", "extra-2.json"], searches: [smallest] });
  const extra = JSON.stringify({ searches: [{ ...smallest, id: "ram", query: "ddr4", group: "ram" }] });
  const list = readSearches(main, sources, { "catalogue.json": extra, "extra-2.json": JSON.stringify({ searches: [] }) });
  assert.deepEqual(list.searches.map((search) => search.id), ["optiplex", "ram"]);
  assert.deepEqual(list.files, ["catalogue.json", "extra-2.json"]);
  for (const odd of [[], "catalogue.json", ["../state.json"], ["state.json"], ["searches.json"], ["Catalogue.json"], ["a.txt"], ["a/b.json"], ["x.json", "x.json"], Array.from({ length: 6 }, (_, i) => `f${i}.json`), [7]]) {
    assert.match(problemIn(JSON.stringify({ more: odd, searches: [] })), /more must be a list of 1 to 5 other files in the deals folder/, JSON.stringify(odd));
  }
});

test("an extra file can be switched all on or all off from searches.json, whatever its own searches say", () => {
  const main = JSON.stringify({ more: [{ file: "catalogue.json", switch: "on" }, { file: "extra-2.json", switch: "off" }, "extra-3.json", { file: "extra-4.json" }], searches: [smallest] });
  const file = (...searches: unknown[]) => JSON.stringify({ searches });
  const list = readSearches(main, sources, {
    "catalogue.json": file({ ...smallest, id: "a", switch: "off" }, { ...smallest, id: "b" }),
    "extra-2.json": file({ ...smallest, id: "c" }),
    "extra-3.json": file({ ...smallest, id: "d", switch: "off" }, { ...smallest, id: "e" }),
    "extra-4.json": file({ ...smallest, id: "f", switch: "off" }),
  });
  assert.deepEqual(list.searches.map((search) => [search.id, search.on]), [["optiplex", true], ["a", true], ["b", true], ["c", false], ["d", false], ["e", true], ["f", false]]);
  assert.deepEqual(list.files, ["catalogue.json", "extra-2.json", "extra-3.json", "extra-4.json"]);
  assert.equal(fingerprint(list.searches[1]), fingerprint(one({ ...smallest, id: "a", switch: "off" })));
  assert.match(problemIn(JSON.stringify({ more: [{ file: "catalogue.json", switch: "on" }], searches: [] })), /catalogue.json couldn't be read/);
  const badOwn = () => readSearches(JSON.stringify({ more: [{ file: "catalogue.json", switch: "on" }], searches: [] }), sources, { "catalogue.json": file({ ...smallest, switch: "maybe" }) });
  assert.throws(badOwn, /catalogue.json search 1 \(optiplex\): switch must be on or off/);
  for (const odd of [[{ file: "x.json", switch: "yes" }], [{ file: "x.json", switch: true }], [{ file: "x.json", other: 1 }], [{ switch: "on" }], [{ file: "../a.json" }], [{ file: "state.json" }], [{ file: "searches.json", switch: "on" }], ["x.json", { file: "x.json", switch: "on" }], [{}], [null], [["x.json"]]]) {
    assert.match(problemIn(JSON.stringify({ more: odd, searches: [] })), /more must be a list of 1 to 5 other files in the deals folder, like \["catalogue.json"\] or \[\{ "file": "catalogue.json", "switch": "on" \}\]/, JSON.stringify(odd));
  }
});

test("a problem in another file is reported with that file's name, and an id can't be used twice across files", () => {
  const main = JSON.stringify({ more: ["catalogue.json"], searches: [smallest] });
  const problem = (extra: string | null) => {
    try {
      readSearches(main, sources, extra === null ? {} : { "catalogue.json": extra });
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  };
  assert.equal(problem(null), "catalogue.json couldn't be read from the deals folder");
  assert.equal(problem("{"), "catalogue.json: it isn't valid JSON (line 1, column 2)");
  assert.equal(problem("[]"), "catalogue.json: it must start with { and hold a searches list in [ ]");
  assert.equal(problem(JSON.stringify({ searches: [], limits: {} })), "catalogue.json: \"limits\" isn't a setting");
  assert.equal(problem(JSON.stringify({ searches: [{ ...smallest }] })), "catalogue.json search 1 (optiplex): its id is used by an earlier search");
  assert.equal(problem(JSON.stringify({ searches: [{ ...smallest, id: "x", switch: "maybe" }] })), "catalogue.json search 1 (x): switch must be on or off");
  assert.equal(problem("x".repeat(256 * 1024 + 1)), "catalogue.json: the file is too big");
  const many = JSON.stringify({ searches: Array.from({ length: 150 }, (_, i) => ({ ...smallest, id: `s${i}` })) });
  assert.equal(problem(many), "there can be 150 searches at most, counting every file");
});

test("the extra files are read from the same folder as searches.json, and a missing one is a problem", async () => {
  const dir = await mkdtemp(join(tmpdir(), "deals-"));
  try {
    await writeFile(join(dir, "searches.json"), JSON.stringify({ more: ["catalogue.json"], searches: [smallest] }));
    await writeFile(join(dir, "catalogue.json"), JSON.stringify({ searches: [{ ...smallest, id: "ram" }] }));
    assert.deepEqual((await loadSearches(join(dir, "searches.json"), sources)).searches.map((search) => search.id), ["optiplex", "ram"]);
    await writeFile(join(dir, "searches.json"), JSON.stringify({ more: [{ file: "catalogue.json", switch: "on" }], searches: [smallest] }));
    await writeFile(join(dir, "catalogue.json"), JSON.stringify({ searches: [{ ...smallest, id: "ram", switch: "off" }] }));
    assert.deepEqual((await loadSearches(join(dir, "searches.json"), sources)).searches.map((search) => [search.id, search.on]), [["optiplex", true], ["ram", true]]);
    await rm(join(dir, "catalogue.json"));
    await assert.rejects(loadSearches(join(dir, "searches.json"), sources), /catalogue.json couldn't be read from the deals folder/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a search from a source other than eBay can't use eBay's own settings", () => {
  const feed = (extra: Record<string, unknown>) => JSON.stringify({ searches: [{ id: "nvme", name: "NVMe", switch: "on", source: "hotukdeals", query: "nvme", ...extra }] });
  const list = readSearches(feed({ maxPrice: 100, exclude: ["2230"], avoid: ["lots"], guidePrice: 70, unit: "TB", group: "storage" }), ["ebay", "hotukdeals"]);
  assert.equal(list.searches[0].source, "hotukdeals");
  for (const [key, value] of Object.entries({ conditions: ["used"], buying: ["auction"], ukOnly: false, categoryId: 1, sellerMinPercent: 90, sellerMinFeedback: 1, sellerType: "business", returnsOnly: true, freePostage: true, postageShown: true, autoCorrect: true })) {
    let message = "";
    try {
      readSearches(feed({ [key]: value }), ["ebay", "hotukdeals"]);
    } catch (error) {
      message = (error as Error).message;
    }
    assert.ok(message.includes(`${key} only works with eBay searches`), `${key}: ${message}`);
  }
});

test("hideVariations is true or false, and only for eBay", () => {
  assert.equal(one({ hideVariations: true }).hideVariations, true);
  assert.equal(one().hideVariations, false);
  assert.match(problemWith({ hideVariations: "yes" }), /hideVariations must be true or false/);
  assert.throws(() => readSearches(JSON.stringify({ searches: [{ ...smallest, source: "other", hideVariations: true }] }), ["ebay", "other"]), /hideVariations only works with eBay searches/);
});

test("with hideVariations off, searches keep the fingerprints they had before it, including ones using the round-three settings", () => {
  const optiplex = { id: "optiplex", name: "OptiPlex 7070 SFF", switch: "on", query: "optiplex 7070 sff" };
  const print = (extra: Record<string, unknown>, top: Record<string, unknown>) =>
    fingerprint(readSearches(JSON.stringify({ ...top, searches: [{ ...optiplex, ...extra }] }), ["ebay"]).searches[0]);
  const before: [Record<string, unknown>, string, Record<string, unknown>][] = [
    [{}, "755b0f3ca7146201", {}],
    [{ freePostage: true }, "87fb95f178e59b3e", {}],
    [{ collectionMiles: 10 }, "49541e1b3d9dbc55", { postcode: "LS15 8AA" }],
    [{ categoryId: 170083, hideDetails: { "Form Factor": ["SO-DIMM"] } }, "6045b6245cf078c7", {}],
  ];
  for (const [extra, was, top] of before) {
    assert.equal(print(extra, top), was, JSON.stringify(extra));
    assert.equal(print({ ...extra, hideVariations: false }, top), was, JSON.stringify(extra));
    assert.notEqual(print({ ...extra, hideVariations: true }, top), was, JSON.stringify(extra));
  }
});
