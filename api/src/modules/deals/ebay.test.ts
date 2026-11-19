import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createEbaySource, ebayMessages, pageSize, searchUrl, toListing } from "./ebay.js";
import { readSearches, type Search } from "./searches.js";
import { SourceError, cleanText, type FailReason } from "./source.js";

const clientId = "Test-App-PRD-0123456789";
const clientSecret = "PRD-not-a-real-secret";
const accessToken = "v^1.1#i^1#not-a-real-token";
const apiHost = "api.ebay.com";
const siteHost = "www.ebay.co.uk";
const tokenUrl = "https://api.ebay.com/identity/v1/oauth2/token";
const searchPath = "https://api.ebay.com/buy/browse/v1/item_summary/search";

afterEach(() => {
  mock.restoreAll();
});

function search(overrides: Record<string, unknown> = {}): Search {
  const text = JSON.stringify({ searches: [{ id: "optiplex", name: "OptiPlex", switch: "on", query: "optiplex 7070 sff", ...overrides }] });
  return readSearches(text, ["ebay"]).searches[0];
}

function item(n: number, overrides: Record<string, unknown> = {}) {
  const number = String(110_000_000_000 + n);
  return {
    itemId: `v1|${number}|0`,
    legacyItemId: number,
    title: `Dell OptiPlex 7070 SFF number ${n}`,
    price: { value: "95.00", currency: "GBP" },
    condition: "Used",
    conditionId: "3000",
    buyingOptions: ["FIXED_PRICE"],
    itemLocation: { country: "GB", postalCode: "AB1***" },
    itemCreationDate: "2026-11-18T20:00:00.000Z",
    itemOriginDate: "2026-11-01T09:00:00.000Z",
    itemWebUrl: `https://www.ebay.co.uk/itm/${number}?hash=item123`,
    itemHref: `https://api.ebay.com/buy/browse/v1/item/v1%7C${number}%7C0`,
    seller: { username: "seller-name-here", feedbackPercentage: "99.4", feedbackScore: 1234 },
    shippingOptions: [{ shippingCostType: "FIXED", shippingCost: { value: "6.99", currency: "GBP" } }],
    ...overrides,
  };
}

function items(count: number, from = 1) {
  return Array.from({ length: count }, (_, i) => item(from + i));
}

type Call = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
  redirect: string | undefined;
  signal: unknown;
};

function fakeEbay(reply: (call: Call, searchNumber: number) => Response | Promise<Response>, tokenReply: (mintNumber: number) => Response = () => goodToken()) {
  const calls: Call[] = [];
  let mints = 0;
  let searches = 0;
  mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : "",
      redirect: init?.redirect,
      signal: init?.signal,
    };
    calls.push(call);
    if (call.url === tokenUrl || call.url.endsWith("/identity/v1/oauth2/token")) return tokenReply(++mints);
    return reply(call, ++searches);
  });
  return calls;
}

function goodToken(overrides: Record<string, unknown> = {}) {
  return Response.json({ access_token: accessToken, expires_in: 7200, token_type: "Application Access Token", ...overrides });
}

function page(summaries: unknown[], total = summaries.length) {
  return Response.json({ href: "https://api.ebay.com/buy/browse/v1/item_summary/search?q=x", total, limit: pageSize, offset: 0, itemSummaries: summaries });
}

function source(now?: () => number) {
  return createEbaySource({ clientId, clientSecret, environment: "production", now });
}

function searchCalls(calls: Call[]) {
  return calls.filter((call) => call.url.startsWith(searchPath));
}

function mintCalls(calls: Call[]) {
  return calls.filter((call) => call.url === tokenUrl);
}

async function failure(run: Promise<unknown>): Promise<SourceError> {
  try {
    await run;
  } catch (error) {
    assert.ok(error instanceof SourceError, `expected a SourceError, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the search to fail");
}

function filterOf(url: string) {
  return new URL(url).searchParams.get("filter");
}

test("the smallest search asks eBay UK for buy-it-now items in the UK, newest first, 200 at a time", () => {
  assert.equal(
    searchUrl(apiHost, search(), 0),
    "https://api.ebay.com/buy/browse/v1/item_summary/search?q=optiplex%207070%20sff&filter=buyingOptions%3A%7BFIXED_PRICE%7D%2CitemLocationCountry%3AGB&sort=newlyListed&limit=200&offset=0",
  );
});

test("a top price becomes eBay's price filter with the currency", () => {
  assert.equal(filterOf(searchUrl(apiHost, search({ maxPrice: 150 }), 0)), "price:[..150.00],priceCurrency:GBP,buyingOptions:{FIXED_PRICE},itemLocationCountry:GB");
  assert.equal(filterOf(searchUrl(apiHost, search({ maxPrice: 149.99 }), 0)), "price:[..149.99],priceCurrency:GBP,buyingOptions:{FIXED_PRICE},itemLocationCountry:GB");
});

test("a bottom price is sent as a closed range, with a huge top when there's no other", () => {
  assert.equal(filterOf(searchUrl(apiHost, search({ minPrice: 40 }), 0)), "price:[40.00..100000.00],priceCurrency:GBP,buyingOptions:{FIXED_PRICE},itemLocationCountry:GB");
  assert.equal(filterOf(searchUrl(apiHost, search({ minPrice: 40, maxPrice: 150 }), 0)), "price:[40.00..150.00],priceCurrency:GBP,buyingOptions:{FIXED_PRICE},itemLocationCountry:GB");
});

test("a with-postage limit also caps the item price sent to eBay, and the lower limit wins", () => {
  assert.match(filterOf(searchUrl(apiHost, search({ maxWithPostage: 60 }), 0)) ?? "", /^price:\[\.\.60\.00\],priceCurrency:GBP,/);
  assert.match(filterOf(searchUrl(apiHost, search({ maxPrice: 150, maxWithPostage: 160 }), 0)) ?? "", /^price:\[\.\.150\.00\],/);
  assert.match(filterOf(searchUrl(apiHost, search({ maxPrice: 150, maxWithPostage: 120 }), 0)) ?? "", /^price:\[\.\.120\.00\],/);
  assert.match(filterOf(searchUrl(apiHost, search({ minPrice: 15, maxWithPostage: 60 }), 0)) ?? "", /^price:\[15\.00\.\.60\.00\],/);
});

test("with no price limit, no price or currency filter is sent", () => {
  const filter = filterOf(searchUrl(apiHost, search(), 0)) ?? "";
  assert.ok(!filter.includes("price"));
});

test("conditions are sent as eBay's numbers", () => {
  const filter = filterOf(searchUrl(apiHost, search({ conditions: ["used", "seller refurbished", "for parts"] }), 0)) ?? "";
  assert.ok(filter.includes("conditionIds:{3000|2500|7000}"), filter);
});

test("buying options are always sent, never left to eBay's default", () => {
  assert.ok((filterOf(searchUrl(apiHost, search({ buying: ["auction"] }), 0)) ?? "").includes("buyingOptions:{AUCTION}"));
  assert.ok((filterOf(searchUrl(apiHost, search({ buying: ["buy it now", "auction"] }), 0)) ?? "").includes("buyingOptions:{FIXED_PRICE|AUCTION}"));
});

test("UK only means items located in the UK, and otherwise anything that delivers to the UK", () => {
  const uk = filterOf(searchUrl(apiHost, search(), 0)) ?? "";
  const anywhere = filterOf(searchUrl(apiHost, search({ ukOnly: false }), 0)) ?? "";
  assert.ok(uk.includes("itemLocationCountry:GB") && !uk.includes("deliveryCountry"));
  assert.ok(anywhere.includes("deliveryCountry:GB") && !anywhere.includes("itemLocationCountry"));
});

test("a category number goes in its own parameter, one at most", () => {
  assert.equal(new URL(searchUrl(apiHost, search({ categoryId: 179 }), 0)).searchParams.get("category_ids"), "179");
  assert.equal(new URL(searchUrl(apiHost, search({ categoryId: "171957" }), 0)).searchParams.get("category_ids"), "171957");
  assert.equal(new URL(searchUrl(apiHost, search(), 0)).searchParams.has("category_ids"), false);
});

test("the offset moves by page and the rest stays the same", () => {
  const first = new URL(searchUrl(apiHost, search({ maxPrice: 150 }), 0));
  const third = new URL(searchUrl(apiHost, search({ maxPrice: 150 }), 400));
  assert.equal(first.searchParams.get("offset"), "0");
  assert.equal(third.searchParams.get("offset"), "400");
  const rest = (url: URL) => [...url.searchParams].filter(([key]) => key !== "offset");
  assert.deepEqual(rest(third), rest(first));
  assert.equal(rest(first).length, 4);
});

test("a query can't add or change any other part of the request", () => {
  const sneaky = "optiplex&filter=price:[..1]&limit=1&sort=price#top?x=1";
  const url = new URL(searchUrl(apiHost, search({ query: sneaky }), 0));
  assert.equal(url.searchParams.get("q"), sneaky);
  assert.equal(url.searchParams.getAll("filter").length, 1);
  assert.equal(url.searchParams.get("filter"), "buyingOptions:{FIXED_PRICE},itemLocationCountry:GB");
  assert.equal(url.searchParams.get("limit"), "200");
  assert.equal(url.searchParams.get("sort"), "newlyListed");
  assert.equal(url.hash, "");
  assert.equal(url.host, "api.ebay.com");
  assert.equal(url.pathname, "/buy/browse/v1/item_summary/search");
});

test("a query's brackets, commas, plus signs and accents arrive as typed", () => {
  for (const query of ["(optiplex 7070, elitedesk 800 g4) sff", "i5+16gb", "café 100% \"new\"", "a/b\\c", "2x16gb ddr4 @ 3200"]) {
    assert.equal(new URL(searchUrl(apiHost, search({ query }), 0)).searchParams.get("q"), query);
  }
  assert.ok(searchUrl(apiHost, search({ query: "a b" }), 0).includes("q=a%20b&"));
});

test("the address is always eBay's own, whatever the search says", () => {
  for (const query of ["@evil.example/", "x/../../identity/v1/oauth2/token", "https://evil.example/?"]) {
    const url = new URL(searchUrl(apiHost, search({ query }), 0));
    assert.equal(url.origin, "https://api.ebay.com");
    assert.equal(url.pathname, "/buy/browse/v1/item_summary/search");
    assert.equal(url.username, "");
  }
});

test("a full eBay item becomes a tidy listing, with money in pence", () => {
  assert.deepEqual(toListing(item(7), siteHost), {
    id: "110000000007",
    title: "Dell OptiPlex 7070 SFF number 7",
    price: 9500,
    postage: 699,
    condition: "Used",
    conditionId: "3000",
    buying: ["FIXED_PRICE"],
    country: "GB",
    listedAt: "2026-11-18T20:00:00.000Z",
    endsAt: null,
    bids: null,
    sellerPercent: 99.4,
    sellerFeedback: 1234,
    url: "https://www.ebay.co.uk/itm/110000000007",
  });
});

test("the seller's name is never kept, only their feedback numbers", () => {
  const listing = toListing(item(1, { seller: { username: "a-real-person-123", feedbackPercentage: "100.0", feedbackScore: 5, userId: "abc123" } }), siteHost);
  assert.ok(!JSON.stringify(listing).includes("a-real-person-123"));
  assert.ok(!JSON.stringify(listing).includes("abc123"));
  assert.ok(!Object.keys(listing ?? {}).some((key) => /user|name|seller$/i.test(key)));
});

test("a listing keeps only the fields the watcher uses", () => {
  const listing = toListing(item(1, { image: { imageUrl: "https://i.ebayimg.com/x.jpg" }, shortDescription: "A long description", itemLocation: { country: "GB", postalCode: "ZZ9***", city: "Sometown" } }), siteHost);
  assert.deepEqual(Object.keys(listing ?? {}).sort(), [
    "bids",
    "buying",
    "condition",
    "conditionId",
    "country",
    "endsAt",
    "id",
    "listedAt",
    "postage",
    "price",
    "sellerFeedback",
    "sellerPercent",
    "title",
    "url",
  ]);
  assert.ok(!JSON.stringify(listing).includes("ZZ9"));
  assert.ok(!JSON.stringify(listing).includes("Sometown"));
  assert.ok(!JSON.stringify(listing).includes("ebayimg"));
});

test("the link is always built from the item number on ebay.co.uk, never taken from the reply", () => {
  const hostile = [
    "https://evil.example/itm/1",
    "https://www.ebay.co.uk.evil.example/itm/1",
    "javascript:alert(1)",
    "https://www.ebay.co.uk/itm/1\r\nX-Priority: 5",
    "https://user:pass@www.ebay.co.uk/",
  ];
  for (const itemWebUrl of hostile) {
    const listing = toListing(item(3, { itemWebUrl, itemAffiliateWebUrl: itemWebUrl, itemHref: itemWebUrl }), siteHost);
    assert.equal(listing?.url, "https://www.ebay.co.uk/itm/110000000003");
  }
  assert.equal(toListing(item(3, { itemWebUrl: undefined }), siteHost)?.url, "https://www.ebay.co.uk/itm/110000000003");
});

test("the item number comes from the id when eBay sends no legacy number", () => {
  assert.equal(toListing(item(4, { legacyItemId: undefined }), siteHost)?.url, "https://www.ebay.co.uk/itm/110000000004");
  assert.equal(toListing(item(4, { legacyItemId: "../../signin" }), siteHost)?.url, "https://www.ebay.co.uk/itm/110000000004");
  assert.equal(toListing(item(4, { legacyItemId: 110000000004 }), siteHost)?.url, "https://www.ebay.co.uk/itm/110000000004");
});

test("a listing is known by eBay's item number alone, so its variations and odd ids can't make it look new", () => {
  assert.equal(toListing(item(4), siteHost)?.id, "110000000004");
  assert.equal(toListing(item(4, { itemId: "v1|110000000004|987654321" }), siteHost)?.id, "110000000004");
  assert.equal(toListing(item(4, { itemId: "v1|110000000004|555" }), siteHost)?.id, "110000000004");
  assert.equal(toListing(item(4, { itemId: undefined }), siteHost)?.id, "110000000004");
  assert.equal(toListing(item(4, { itemId: "__proto__" }), siteHost)?.id, "110000000004");
  assert.equal(toListing(item(4, { legacyItemId: undefined }), siteHost)?.id, "110000000004");
});

test("an item with no usable item number is dropped", () => {
  const bad = [undefined, null, 7, "", "v1|abc|0", "no-number-here", "v1|1x|0", "v1| 1|0", "v1|<script>|0", "__proto__", ["v1|1|0"], `v1|${"1".repeat(21)}|0`];
  for (const itemId of bad) {
    assert.equal(toListing(item(1, { itemId, legacyItemId: undefined }), siteHost), null, `kept ${String(itemId)}`);
  }
  for (const legacyItemId of ["12 34", "12\n34", "-1", "1e5", "1".repeat(21)]) {
    assert.equal(toListing(item(1, { itemId: undefined, legacyItemId }), siteHost), null, `kept ${legacyItemId}`);
  }
});

test("things that aren't an item are dropped", () => {
  for (const raw of [null, undefined, "item", 7, [], [item(1)], true]) assert.equal(toListing(raw, siteHost), null);
  assert.equal(toListing({}, siteHost), null);
});

test("a title is cleaned of control, hidden and direction-flipping characters, and its spaces tidied", () => {
  const title = "  Dell\tOptiPlex\r\n7070 \u202EFFS\u202C  fa\u200Bulty\u0000\u0007 \uFEFFi5\u2028end  ";
  assert.equal(toListing(item(1, { title }), siteHost)?.title, "Dell OptiPlex 7070 FFS faulty i5 end");
});

test("a title is cut at 100 characters without splitting an emoji", () => {
  const long = toListing(item(1, { title: "x".repeat(300) }), siteHost)?.title ?? "";
  assert.equal(long.length, 100);
  const emoji = toListing(item(1, { title: "\u{1F525}".repeat(150) }), siteHost)?.title ?? "";
  assert.equal([...emoji].length, 100);
  assert.equal(emoji, "\u{1F525}".repeat(100));
});

test("an item with no real title is dropped", () => {
  for (const title of [undefined, null, 7, "", "   ", "\u200B\u200B", "\r\n\t", ["Dell"], { text: "Dell" }]) {
    assert.equal(toListing(item(1, { title }), siteHost), null, `kept ${JSON.stringify(title)}`);
  }
});

test("prices are read exactly, with no rounding surprises", () => {
  const cases: [string, number][] = [
    ["95.00", 9500],
    ["95", 9500],
    ["95.5", 9550],
    ["0.99", 99],
    ["0.07", 7],
    ["1.15", 115],
    ["4.35", 435],
    ["19.99", 1999],
    ["1005.01", 100501],
    ["0.00", 0],
    ["9999999.99", 999999999],
  ];
  for (const [value, expected] of cases) {
    assert.equal(toListing(item(1, { price: { value, currency: "GBP" } }), siteHost)?.price, expected, value);
  }
});

test("an item whose price can't be trusted is dropped", () => {
  const bad = [
    undefined,
    null,
    "95.00",
    95,
    { value: 95, currency: "GBP" },
    { value: "95,00", currency: "GBP" },
    { value: "-1.00", currency: "GBP" },
    { value: "1e3", currency: "GBP" },
    { value: "95.123", currency: "GBP" },
    { value: " 95.00", currency: "GBP" },
    { value: "", currency: "GBP" },
    { value: "£95.00", currency: "GBP" },
    { value: "12345678.00", currency: "GBP" },
    { value: "Infinity", currency: "GBP" },
    { value: "95.00" },
    { value: "95.00", currency: "USD" },
    { value: "95.00", currency: "gbp" },
    { value: "95.00", currency: "EUR", convertedFromValue: "110.00" },
    { currency: "GBP" },
  ];
  for (const price of bad) assert.equal(toListing(item(1, { price }), siteHost), null, `kept ${JSON.stringify(price)}`);
});

test("an auction's price is its current bid, and a buy-it-now's is its price", () => {
  const bid = { value: "40.00", currency: "GBP" };
  assert.equal(toListing(item(1, { buyingOptions: ["AUCTION"], currentBidPrice: bid, bidCount: 3 }), siteHost)?.price, 4000);
  assert.equal(toListing(item(1, { buyingOptions: ["AUCTION"], currentBidPrice: bid, bidCount: 3 }), siteHost)?.bids, 3);
  assert.equal(toListing(item(1, { buyingOptions: ["AUCTION"] }), siteHost)?.price, 9500);
  assert.equal(toListing(item(1, { buyingOptions: ["AUCTION", "FIXED_PRICE"], currentBidPrice: bid }), siteHost)?.price, 9500);
  assert.equal(toListing(item(1, { buyingOptions: ["FIXED_PRICE"], currentBidPrice: bid }), siteHost)?.price, 9500);
  assert.equal(toListing(item(1, { buyingOptions: ["AUCTION"], currentBidPrice: { value: "40.00", currency: "USD" } }), siteHost)?.price, 9500);
});

test("postage is the cheapest option in pounds, free counts as 0, and unknown stays unknown", () => {
  const option = (value: string, currency = "GBP") => ({ shippingCostType: "FIXED", shippingCost: { value, currency } });
  assert.equal(toListing(item(1, { shippingOptions: [option("6.99"), option("3.50"), option("12.00")] }), siteHost)?.postage, 350);
  assert.equal(toListing(item(1, { shippingOptions: [option("0.00")] }), siteHost)?.postage, 0);
  assert.equal(toListing(item(1, { shippingOptions: [option("4.00", "USD"), option("9.00")] }), siteHost)?.postage, 900);
  assert.equal(toListing(item(1, { shippingOptions: [option("4.00", "USD")] }), siteHost)?.postage, null);
  assert.equal(toListing(item(1, { shippingOptions: [{ shippingCostType: "CALCULATED" }] }), siteHost)?.postage, null);
  for (const shippingOptions of [undefined, null, [], "free", {}, [null, 7, "x"]]) {
    assert.equal(toListing(item(1, { shippingOptions }), siteHost)?.postage, null);
  }
});

test("condition text is cleaned and capped, and its number must be digits", () => {
  assert.equal(toListing(item(1, { condition: " Seller\u200B refurbished\n" }), siteHost)?.condition, "Seller refurbished");
  assert.equal(toListing(item(1, { condition: "x".repeat(90) }), siteHost)?.condition?.length, 40);
  assert.equal(toListing(item(1, { condition: undefined }), siteHost)?.condition, null);
  assert.equal(toListing(item(1, { condition: 3000 }), siteHost)?.condition, null);
  assert.equal(toListing(item(1, { conditionId: "2500" }), siteHost)?.conditionId, "2500");
  for (const conditionId of [undefined, 3000, "used", "30 00", "3000|1000", ""]) {
    assert.equal(toListing(item(1, { conditionId }), siteHost)?.conditionId, null);
  }
});

test("buying options keep only the ones eBay documents, in a fixed order", () => {
  assert.deepEqual(toListing(item(1, { buyingOptions: ["BEST_OFFER", "FIXED_PRICE"] }), siteHost)?.buying, ["FIXED_PRICE", "BEST_OFFER"]);
  assert.deepEqual(toListing(item(1, { buyingOptions: ["FIXED_PRICE", "TELEPATHY", 7, null] }), siteHost)?.buying, ["FIXED_PRICE"]);
  for (const buyingOptions of [undefined, "FIXED_PRICE", {}, []]) {
    assert.deepEqual(toListing(item(1, { buyingOptions }), siteHost)?.buying, []);
  }
});

test("the country is two capital letters or unknown", () => {
  assert.equal(toListing(item(1, { itemLocation: { country: "DE" } }), siteHost)?.country, "DE");
  for (const itemLocation of [undefined, null, "GB", { country: "gb" }, { country: "GBR" }, { country: 44 }, {}]) {
    assert.equal(toListing(item(1, { itemLocation }), siteHost)?.country, null);
  }
});

test("dates are kept as full UTC times, the listing's own start first", () => {
  assert.equal(toListing(item(1), siteHost)?.listedAt, "2026-11-18T20:00:00.000Z");
  assert.equal(toListing(item(1, { itemCreationDate: undefined }), siteHost)?.listedAt, "2026-11-01T09:00:00.000Z");
  assert.equal(toListing(item(1, { itemCreationDate: "2026-11-18T21:00:00+01:00" }), siteHost)?.listedAt, "2026-11-18T20:00:00.000Z");
  assert.equal(toListing(item(1, { itemCreationDate: "not a date", itemOriginDate: undefined }), siteHost)?.listedAt, null);
  assert.equal(toListing(item(1, { itemCreationDate: 1763496000000, itemOriginDate: null }), siteHost)?.listedAt, null);
  assert.equal(toListing(item(1, { itemCreationDate: "2".repeat(41), itemOriginDate: undefined }), siteHost)?.listedAt, null);
  assert.equal(toListing(item(1, { itemEndDate: "2026-11-20T18:30:00.000Z" }), siteHost)?.endsAt, "2026-11-20T18:30:00.000Z");
});

test("seller numbers are only kept when they make sense", () => {
  const withSeller = (seller: unknown) => toListing(item(1, { seller }), siteHost);
  assert.equal(withSeller({ feedbackPercentage: "100", feedbackScore: 0 })?.sellerPercent, 100);
  assert.equal(withSeller({ feedbackPercentage: "100", feedbackScore: 0 })?.sellerFeedback, 0);
  assert.equal(withSeller({ feedbackPercentage: "0.0", feedbackScore: 12 })?.sellerPercent, 0);
  for (const feedbackPercentage of [undefined, 99.4, "101", "100.1", "-1", "99.444", "high", ""]) {
    assert.equal(withSeller({ feedbackPercentage, feedbackScore: 5 })?.sellerPercent, null, String(feedbackPercentage));
  }
  for (const feedbackScore of [undefined, "1234", -1, 12.5, Number.NaN, 2_000_000_000]) {
    assert.equal(withSeller({ feedbackPercentage: "99", feedbackScore })?.sellerFeedback, null, String(feedbackScore));
  }
  for (const seller of [undefined, null, "seller", []]) {
    assert.equal(withSeller(seller)?.sellerPercent, null);
    assert.equal(withSeller(seller)?.sellerFeedback, null);
  }
});

test("odd keys in an item change nothing", () => {
  const raw = JSON.parse(`{ "__proto__": { "polluted": true }, "constructor": { "prototype": { "polluted": true } }, "itemId": "v1|123456|0", "title": "A", "price": { "value": "1.00", "currency": "GBP" } }`);
  assert.equal(toListing(raw, siteHost)?.id, "123456");
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("a sandbox listing links to the sandbox site", () => {
  assert.equal(toListing(item(2), "www.sandbox.ebay.co.uk")?.url, "https://www.sandbox.ebay.co.uk/itm/110000000002");
});

test("cleanText handles anything it's handed", () => {
  for (const value of [undefined, null, 7, {}, [], true]) assert.equal(cleanText(value, 10), "");
  assert.equal(cleanText("  a  b  ", 10), "a b");
  assert.equal(cleanText("abc def", 4), "abc");
  assert.equal(cleanText(`${" ".repeat(5000)}late`, 10), "");
});

test("a search mints a token with the keys, the plain scope and nothing else", async () => {
  const calls = fakeEbay(() => page(items(2)));
  await source().search(search(), 3);
  const [mint] = mintCalls(calls);
  assert.equal(mintCalls(calls).length, 1);
  assert.equal(mint.method, "POST");
  assert.equal(mint.headers.get("Authorization"), `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`);
  assert.equal(mint.headers.get("Content-Type"), "application/x-www-form-urlencoded");
  assert.equal(mint.body, "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope");
  assert.deepEqual([...new URLSearchParams(mint.body).keys()], ["grant_type", "scope"]);
  assert.equal(new URLSearchParams(mint.body).get("scope"), "https://api.ebay.com/oauth/api_scope");
});

test("the token asks for no buying, bidding or account scope, so it can't be used to buy or bid", async () => {
  const calls = fakeEbay(() => page(items(1)));
  await source().search(search(), 3);
  const scope = new URLSearchParams(mintCalls(calls)[0].body).get("scope") ?? "";
  assert.equal(scope.split(" ").length, 1);
  for (const word of ["buy.", "order", "offer", "bid", "sell", "commerce", "user"]) assert.ok(!scope.includes(word), word);
  assert.equal(new URLSearchParams(mintCalls(calls)[0].body).get("grant_type"), "client_credentials");
});

test("the search itself is a GET with the token, for eBay UK", async () => {
  const calls = fakeEbay(() => page(items(2)));
  const result = await source().search(search({ maxPrice: 150 }), 3);
  const [request] = searchCalls(calls);
  assert.equal(searchCalls(calls).length, 1);
  assert.equal(request.method, "GET");
  assert.equal(request.url, searchUrl(apiHost, search({ maxPrice: 150 }), 0));
  assert.equal(request.headers.get("Authorization"), `Bearer ${accessToken}`);
  assert.equal(request.headers.get("X-EBAY-C-MARKETPLACE-ID"), "EBAY_GB");
  assert.equal(request.body, "");
  assert.deepEqual(result, { listings: [toListing(item(1), siteHost), toListing(item(2), siteHost)], total: 2, complete: true, calls: 1, skipped: 0 });
});

test("the keys only ever go to the token address, and the token only to the search", async () => {
  const calls = fakeEbay(() => page(items(1)));
  await source().search(search(), 3);
  for (const call of searchCalls(calls)) assert.ok(!(call.headers.get("Authorization") ?? "").startsWith("Basic"));
  for (const call of mintCalls(calls)) assert.ok(!(call.headers.get("Authorization") ?? "").startsWith("Bearer"));
  for (const call of calls) {
    assert.ok(!call.url.includes(clientSecret) && !call.url.includes(clientId) && !call.url.includes(accessToken));
    assert.ok(!call.body.includes(clientSecret));
  }
});

test("every request refuses redirects, so the keys and token can't be sent anywhere else", async () => {
  const calls = fakeEbay(() => page(items(1)));
  await source().search(search(), 3);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.redirect, "error");
});

test("every request gives up after 15 seconds", async () => {
  const timeoutMock = mock.method(AbortSignal, "timeout");
  const calls = fakeEbay(() => page(items(1)));
  await source().search(search(), 3);
  assert.equal(timeoutMock.mock.callCount(), 2);
  for (const call of timeoutMock.mock.calls) assert.equal(call.arguments[0], 15_000);
  for (const call of calls) assert.ok(call.signal instanceof AbortSignal);
});

test("the token is reused for later searches", async () => {
  const calls = fakeEbay(() => page(items(1)));
  const ebay = source();
  await ebay.search(search(), 3);
  await ebay.search(search({ query: "elitedesk" }), 3);
  await ebay.search(search(), 3);
  assert.equal(mintCalls(calls).length, 1);
  assert.equal(searchCalls(calls).length, 3);
});

test("a new token is minted a minute before the old one runs out", async () => {
  let time = 1_000_000;
  const calls = fakeEbay(() => page(items(1)));
  const ebay = source(() => time);
  await ebay.search(search(), 3);
  time += 7_139_000;
  await ebay.search(search(), 3);
  assert.equal(mintCalls(calls).length, 1);
  time += 2_000;
  await ebay.search(search(), 3);
  assert.equal(mintCalls(calls).length, 2);
});

test("a token's life is never trusted for more than a day", async () => {
  let time = 0;
  const calls = fakeEbay(
    () => page(items(1)),
    () => goodToken({ expires_in: 31_536_000 }),
  );
  const ebay = source(() => time);
  await ebay.search(search(), 3);
  time = 86_400_000;
  await ebay.search(search(), 3);
  assert.equal(mintCalls(calls).length, 2);
});

test("searches started together share one token request", async () => {
  const calls = fakeEbay(() => page(items(1)));
  const ebay = source();
  await Promise.all([ebay.search(search(), 3), ebay.search(search(), 3), ebay.search(search(), 3)]);
  assert.equal(mintCalls(calls).length, 1);
  assert.equal(searchCalls(calls).length, 3);
});

test("each source keeps its own token", async () => {
  const calls = fakeEbay(() => page(items(1)));
  await source().search(search(), 3);
  await source().search(search(), 3);
  assert.equal(mintCalls(calls).length, 2);
});

test("refused keys fail plainly, without searching, and are tried again next time", async () => {
  let status = 401;
  const calls = fakeEbay(
    () => page(items(1)),
    () => (status === 200 ? goodToken() : Response.json({ error: "invalid_client", error_description: "client authentication failed" }, { status })),
  );
  const ebay = source();
  const error = await failure(ebay.search(search(), 3));
  assert.equal(error.reason, "keys");
  assert.equal(error.message, "eBay refused the keys");
  assert.equal(error.calls, 0);
  assert.equal(searchCalls(calls).length, 0);
  status = 400;
  assert.equal((await failure(ebay.search(search(), 3))).reason, "keys");
  status = 200;
  assert.equal((await ebay.search(search(), 3)).listings.length, 1);
  assert.equal(mintCalls(calls).length, 3);
});

test("a token request that's rate limited, failing or unanswered says so", async () => {
  const cases: [() => Response, FailReason][] = [
    [() => new Response(null, { status: 429 }), "busy"],
    [() => new Response(null, { status: 500 }), "down"],
    [() => new Response(null, { status: 503 }), "down"],
    [() => new Response("<html>oops</html>", { status: 200 }), "reply"],
    [() => Response.json([accessToken]), "reply"],
    [() => Response.json({ expires_in: 7200 }), "reply"],
    [() => goodToken({ access_token: "" }), "reply"],
    [() => goodToken({ access_token: 12345 }), "reply"],
    [() => goodToken({ access_token: "two words" }), "reply"],
    [() => goodToken({ access_token: "line\r\nX-Injected: 1" }), "reply"],
    [() => goodToken({ access_token: "café" }), "reply"],
    [() => goodToken({ access_token: "x".repeat(8001) }), "reply"],
    [() => goodToken({ expires_in: undefined }), "reply"],
    [() => goodToken({ expires_in: "7200" }), "reply"],
    [() => goodToken({ expires_in: 0 }), "reply"],
    [() => goodToken({ expires_in: -5 }), "reply"],
  ];
  for (const [tokenReply, reason] of cases) {
    const calls = fakeEbay(() => page(items(1)), tokenReply);
    const error = await failure(source().search(search(), 3));
    assert.equal(error.reason, reason);
    assert.equal(error.message, ebayMessages[reason]);
    assert.equal(searchCalls(calls).length, 0);
    mock.restoreAll();
  }
});

test("a network failure or timeout on the token request is reported as unreachable, with nothing leaked", async () => {
  for (const thrown of [new TypeError("fetch failed", { cause: new Error(`connect ECONNREFUSED with ${clientSecret}`) }), new DOMException("The operation was aborted due to timeout", "TimeoutError")]) {
    mock.method(globalThis, "fetch", async () => {
      throw thrown;
    });
    const error = await failure(source().search(search(), 3));
    assert.equal(error.reason, "down");
    assert.equal(error.message, "couldn't reach eBay");
    assert.equal(error.cause, undefined);
    assert.ok(!JSON.stringify({ ...error, message: error.message, stack: error.stack }).includes(clientSecret));
    mock.restoreAll();
  }
});

test("a token eBay stops accepting is replaced once and the search tried again", async () => {
  const calls = fakeEbay((_call, n) => (n === 1 ? new Response(null, { status: 401 }) : page(items(2))));
  const result = await source().search(search(), 3);
  assert.equal(result.listings.length, 2);
  assert.equal(result.calls, 2);
  assert.equal(mintCalls(calls).length, 2);
  assert.equal(searchCalls(calls).length, 2);
});

test("if the fresh token is refused too, it stops and says the keys were refused", async () => {
  const calls = fakeEbay(() => new Response(null, { status: 401 }));
  const ebay = source();
  const error = await failure(ebay.search(search(), 3));
  assert.equal(error.reason, "keys");
  assert.equal(error.calls, 2);
  assert.equal(searchCalls(calls).length, 2);
  assert.equal(mintCalls(calls).length, 2);
  await failure(ebay.search(search(), 3));
  assert.equal(mintCalls(calls).length, 4);
  assert.equal(searchCalls(calls).length, 4);
});

test("each kind of refusal from the search has its own plain reason", async () => {
  const cases: [number, FailReason, string][] = [
    [403, "access", "eBay says these keys can't search listings"],
    [429, "busy", "eBay says too many requests"],
    [500, "down", "couldn't reach eBay"],
    [502, "down", "couldn't reach eBay"],
    [503, "down", "couldn't reach eBay"],
    [400, "request", "eBay refused the search (status 400)"],
    [404, "request", "eBay refused the search (status 404)"],
    [409, "request", "eBay refused the search (status 409)"],
  ];
  for (const [status, reason, message] of cases) {
    const calls = fakeEbay(() => new Response(null, { status }));
    const error = await failure(source().search(search(), 3));
    assert.equal(error.reason, reason, String(status));
    assert.equal(error.message, message);
    assert.equal(error.calls, 1);
    assert.equal(searchCalls(calls).length, 1, `${status} was retried`);
    mock.restoreAll();
  }
});

test("a refused search gives eBay's error number but none of its words", async () => {
  const body = { errors: [{ errorId: 12023, domain: "API_BROWSE", category: "REQUEST", message: "Invalid filter value", longMessage: `The filter is wrong, ${accessToken}` }] };
  fakeEbay(() => Response.json(body, { status: 400 }));
  const error = await failure(source().search(search(), 3));
  assert.equal(error.message, "eBay refused the search (eBay error 12023)");
});

test("an error number that isn't a plain number is left out", async () => {
  for (const errorId of ["12023", -1, 1.5, null, "<b>", { id: 1 }]) {
    fakeEbay(() => Response.json({ errors: [{ errorId, message: "x" }] }, { status: 400 }));
    assert.equal((await failure(source().search(search(), 3))).message, "eBay refused the search (status 400)");
    mock.restoreAll();
  }
  fakeEbay(() => new Response("not json", { status: 400 }));
  assert.equal((await failure(source().search(search(), 3))).message, "eBay refused the search (status 400)");
});

test("no failure message ever holds the keys, the token or anything eBay wrote", async () => {
  const remoteWords = "REMOTE-WORDS-SHOULD-NOT-APPEAR";
  const replies: (() => Response)[] = [
    () => Response.json({ errors: [{ errorId: 1, message: remoteWords, longMessage: remoteWords }] }, { status: 400 }),
    () => Response.json({ error: remoteWords }, { status: 403 }),
    () => new Response(remoteWords, { status: 500 }),
    () => new Response(remoteWords, { status: 200 }),
    () => Response.json({ total: remoteWords }),
    () => new Response(null, { status: 401 }),
  ];
  for (const reply of replies) {
    fakeEbay(reply);
    const error = await failure(source().search(search(), 3));
    const everything = `${error.message} ${error.stack} ${JSON.stringify(error)} ${String(error.cause)}`;
    for (const secret of [clientId, clientSecret, accessToken, remoteWords, Buffer.from(`${clientId}:${clientSecret}`).toString("base64")]) {
      assert.ok(!everything.includes(secret), `${secret} in ${everything}`);
    }
    mock.restoreAll();
  }
});

test("a search that can't reach eBay, or times out, counts the call it made", async () => {
  for (const thrown of [new TypeError("fetch failed"), new DOMException("The operation was aborted due to timeout", "TimeoutError")]) {
    fakeEbay(() => {
      throw thrown;
    });
    const error = await failure(source().search(search(), 3));
    assert.equal(error.reason, "down");
    assert.equal(error.calls, 1);
    mock.restoreAll();
  }
});

test("a reply that isn't what eBay documents is refused, not guessed at", async () => {
  const replies: (() => Response)[] = [
    () => new Response("<html>maintenance</html>", { status: 200 }),
    () => new Response("", { status: 200 }),
    () => Response.json([]),
    () => Response.json("ok"),
    () => Response.json(null),
    () => Response.json({ itemSummaries: [item(1)] }),
    () => Response.json({ total: "1", itemSummaries: [item(1)] }),
    () => Response.json({ total: -1, itemSummaries: [] }),
    () => Response.json({ total: 1.5, itemSummaries: [] }),
    () => Response.json({ total: 1, itemSummaries: { 0: item(1) } }),
    () => Response.json({ total: 1, itemSummaries: "none" }),
    () => Response.json({ total: 300, itemSummaries: items(201) }),
  ];
  for (const reply of replies) {
    fakeEbay(reply);
    const error = await failure(source().search(search(), 3));
    assert.equal(error.reason, "reply");
    assert.equal(error.message, "eBay's reply didn't make sense");
    assert.equal(error.calls, 1);
    mock.restoreAll();
  }
});

test("a reply that says it's enormous is refused without being read", async () => {
  let reply: Response | null = null;
  fakeEbay(() => {
    reply = new Response("{}", { status: 200, headers: { "content-length": String(6 * 1024 * 1024) } });
    return reply;
  });
  assert.equal((await failure(source().search(search(), 3))).reason, "reply");
  assert.equal((reply as Response | null)?.bodyUsed, false);
});

function streamOf(chunks: number, chunkBytes: number, counter: { pulled: number }, breakAfter?: number) {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (breakAfter !== undefined && counter.pulled === breakAfter) {
        controller.error(new TypeError("terminated"));
        return;
      }
      if (counter.pulled === chunks) {
        controller.close();
        return;
      }
      counter.pulled += 1;
      controller.enqueue(new Uint8Array(chunkBytes).fill(32));
    },
  });
}

test("a reply that turns out enormous is cut off once it passes the limit, not read to the end", async () => {
  const counter = { pulled: 0 };
  fakeEbay(() => new Response(streamOf(1000, 1024 * 1024, counter), { status: 200 }));
  assert.equal((await failure(source().search(search(), 3))).reason, "reply");
  assert.ok(counter.pulled >= 6 && counter.pulled <= 8, `read ${counter.pulled} MiB`);
});

test("a reply just under the size limit is still read", async () => {
  const padding = " ".repeat(5 * 1024 * 1024 - 100);
  fakeEbay(() => new Response(`{"total":0,${padding}"itemSummaries":[]}`, { status: 200 }));
  assert.equal((await source().search(search(), 3)).total, 0);
});

test("a reply that breaks off part-way is reported as unreachable", async () => {
  fakeEbay(() => new Response(streamOf(10, 1024, { pulled: 0 }, 3), { status: 200 }));
  const error = await failure(source().search(search(), 3));
  assert.equal(error.reason, "down");
  assert.equal(error.message, "couldn't reach eBay");
});

test("a reply with no body at all is refused as unreadable", async () => {
  fakeEbay(() => new Response(null, { status: 200 }));
  assert.equal((await failure(source().search(search(), 3))).reason, "reply");
});

test("no matches is a good answer, not a failure", async () => {
  fakeEbay(() => Response.json({ href: "x", total: 0, limit: 200, offset: 0 }));
  assert.deepEqual(await source().search(search(), 3), { listings: [], total: 0, complete: true, calls: 1, skipped: 0 });
});

test("items that can't be read are skipped and counted, and the rest kept", async () => {
  fakeEbay(() => page([item(1), { junk: true }, item(2, { price: { value: "95.00", currency: "USD" } }), null, item(3)], 5));
  const result = await source().search(search(), 3);
  assert.deepEqual(result.listings.map((listing) => listing.id), ["110000000001", "110000000003"]);
  assert.equal(result.skipped, 3);
  assert.equal(result.total, 5);
  assert.equal(result.complete, true);
});

test("one page is enough when everything fits", async () => {
  const calls = fakeEbay(() => page(items(200), 200));
  const result = await source().search(search(), 3);
  assert.equal(searchCalls(calls).length, 1);
  assert.equal(result.listings.length, 200);
  assert.equal(result.complete, true);
});

test("more results are fetched page by page until all are in", async () => {
  const calls = fakeEbay((_call, n) => (n === 1 ? page(items(200, 1), 450) : n === 2 ? page(items(200, 201), 450) : page(items(50, 401), 450)));
  const result = await source().search(search(), 3);
  assert.deepEqual(searchCalls(calls).map((call) => new URL(call.url).searchParams.get("offset")), ["0", "200", "400"]);
  assert.equal(result.listings.length, 450);
  assert.equal(result.total, 450);
  assert.equal(result.complete, true);
  assert.equal(result.calls, 3);
  assert.equal(mintCalls(calls).length, 1);
});

test("a search with more results than the page limit says it isn't complete", async () => {
  const calls = fakeEbay((_call, n) => page(items(200, (n - 1) * 200 + 1), 900));
  const result = await source().search(search(), 3);
  assert.equal(searchCalls(calls).length, 3);
  assert.equal(result.listings.length, 600);
  assert.equal(result.total, 900);
  assert.equal(result.complete, false);
});

test("the page limit is obeyed even when it's one", async () => {
  const calls = fakeEbay(() => page(items(200), 300));
  const result = await source().search(search(), 1);
  assert.equal(searchCalls(calls).length, 1);
  assert.equal(result.complete, false);
  assert.equal(result.calls, 1);
});

test("a short page ends the search even if the total says there's more", async () => {
  const calls = fakeEbay(() => page(items(30), 5000));
  const result = await source().search(search(), 3);
  assert.equal(searchCalls(calls).length, 1);
  assert.equal(result.complete, true);
});

test("an item that shows up on two pages is only listed once", async () => {
  fakeEbay((_call, n) => (n === 1 ? page(items(200, 1), 250) : page(items(50, 191), 250)));
  const result = await source().search(search(), 3);
  assert.equal(result.listings.length, 240);
  assert.equal(new Set(result.listings.map((listing) => listing.id)).size, 240);
});

test("a failure part-way through the pages counts every call made", async () => {
  fakeEbay((_call, n) => (n === 1 ? page(items(200), 600) : new Response(null, { status: 500 })));
  const error = await failure(source().search(search(), 3));
  assert.equal(error.reason, "down");
  assert.equal(error.calls, 2);
});

test("addresses inside eBay's reply are never fetched", async () => {
  const calls = fakeEbay((_call, n) =>
    Response.json({
      href: "https://evil.example/href",
      next: "https://evil.example/next",
      prev: "https://evil.example/prev",
      total: 450,
      itemSummaries: items(n === 3 ? 50 : 200, (n - 1) * 200 + 1).map((raw) => ({ ...raw, itemHref: "https://evil.example/item", itemWebUrl: "https://evil.example/web" })),
    }),
  );
  const result = await source().search(search(), 3);
  assert.equal(result.listings.length, 450);
  for (const call of calls) assert.equal(new URL(call.url).host, "api.ebay.com");
  for (const listing of result.listings) assert.ok(listing.url.startsWith("https://www.ebay.co.uk/itm/"));
});

test("whatever happens, the only requests ever made are the token POST and the search GET", async () => {
  const seen = new Set<string>();
  const replies: ((n: number) => Response)[] = [
    () => page(items(3)),
    (n) => (n === 1 ? new Response(null, { status: 401 }) : page(items(1))),
    () => new Response(null, { status: 403 }),
    () => new Response(null, { status: 429 }),
    () => Response.json({ errors: [{ errorId: 12001 }] }, { status: 400 }),
    (n) => page(items(200, n * 200), 5000),
    () => new Response("junk"),
  ];
  for (const reply of replies) {
    const calls = fakeEbay((_call, n) => reply(n));
    const ebay = source();
    for (const variant of [search(), search({ buying: ["auction"], endingWithinHours: 4 }), search({ maxPrice: 50, categoryId: 179, ukOnly: false })]) {
      await ebay.search(variant, 3).catch(() => undefined);
    }
    for (const call of calls) seen.add(`${call.method} ${new URL(call.url).origin}${new URL(call.url).pathname}`);
    mock.restoreAll();
  }
  assert.deepEqual([...seen].sort(), ["GET https://api.ebay.com/buy/browse/v1/item_summary/search", "POST https://api.ebay.com/identity/v1/oauth2/token"]);
});

test("the sandbox setting talks only to eBay's sandbox", async () => {
  const calls = fakeEbay(() => page(items(1)));
  const result = await createEbaySource({ clientId, clientSecret, environment: "sandbox" }).search(search(), 3);
  assert.deepEqual(calls.map((call) => new URL(call.url).host), ["api.sandbox.ebay.com", "api.sandbox.ebay.com"]);
  assert.equal(calls[0].url, "https://api.sandbox.ebay.com/identity/v1/oauth2/token");
  assert.equal(result.listings[0].url, "https://www.sandbox.ebay.co.uk/itm/110000000001");
});

test("production never talks to the sandbox", async () => {
  const calls = fakeEbay(() => page(items(1)));
  await source().search(search(), 3);
  for (const call of calls) assert.equal(new URL(call.url).host, "api.ebay.com");
});

test("keys with odd characters are still sent whole", async () => {
  const calls = fakeEbay(() => page(items(1)));
  await createEbaySource({ clientId: "id:with:colons", clientSecret: "sécret \"quoted\"", environment: "production" }).search(search(), 3);
  const sent = Buffer.from((calls[0].headers.get("Authorization") ?? "").slice("Basic ".length), "base64").toString();
  assert.equal(sent, "id:with:colons:sécret \"quoted\"");
});

test("the same listing sent twice in one page, even under two variation ids, is listed once", async () => {
  fakeEbay(() => page([item(1), item(1, { itemId: "v1|110000000001|42" }), item(2)], 3));
  const result = await source().search(search(), 3);
  assert.deepEqual(result.listings.map((listing) => listing.id), ["110000000001", "110000000002"]);
});

test("replacing a stale token is the one extra call a search may make beyond its page limit", async () => {
  const calls = fakeEbay((_call, n) => (n === 1 ? new Response(null, { status: 401 }) : page(items(200), 900)));
  const result = await source().search(search(), 1);
  assert.equal(searchCalls(calls).length, 2);
  assert.equal(result.calls, 2);
  assert.equal(result.complete, false);
});

test("direction marks and invisible tag characters are taken out of a title too", () => {
  const title = "Dell\u061C OptiPlex\u{E0041}\u{E0042}\u{E007F} 7070";
  assert.equal(toListing(item(1, { title }), siteHost)?.title, "Dell OptiPlex 7070");
});