import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { categoriesUrl, categoryDetailsUrl, categoryIdsOf, countUrl, createEbaySource, cutSteps, detailNamesUrl, ebayMessages, fullUrl, isApiAddress, legacyUrl, optionsUrl, pageSize, plainText, retryAfterMs, searchUrl, toCategories, toCategoryDetails, toCut, toDetailNames, toFull, toListing, toOptions, treeIdUrl, wordsUrl } from "./ebay.js";
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
    itemLocation: { country: "GB", postalCode: "ZZ9***" },
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
    "https://api.ebay.com/buy/browse/v1/item_summary/search?q=optiplex%207070%20sff&filter=buyingOptions%3A%7BFIXED_PRICE%7D%2CitemLocationCountry%3AGB&fieldgroups=MATCHING_ITEMS,EXTENDED&sort=newlyListed&limit=200&offset=0",
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
  assert.equal(rest(first).length, 5);
  assert.equal(first.searchParams.get("fieldgroups"), "MATCHING_ITEMS,EXTENDED");
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
    ref: "v1|110000000007|0",
    sellerType: null,
    topRated: null,
    postageType: "fixed",
    city: null,
    postcode: "ZZ9",
    summary: null,
    variations: false,
    detailsMatch: null,
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
    "city",
    "condition",
    "conditionId",
    "country",
    "detailsMatch",
    "endsAt",
    "id",
    "listedAt",
    "postage",
    "postageType",
    "postcode",
    "price",
    "ref",
    "sellerFeedback",
    "sellerPercent",
    "sellerType",
    "summary",
    "title",
    "topRated",
    "url",
    "variations",
  ]);
  assert.ok(!JSON.stringify(listing).includes("ebayimg"));
  assert.ok(!JSON.stringify(listing).includes("api.ebay.com"));
});

test("the seller's kind is kept as business or private, and anything else as unknown", () => {
  const kind = (sellerAccountType: unknown) => toListing(item(1, { seller: { username: "x", feedbackPercentage: "99.0", feedbackScore: 5, sellerAccountType } }), siteHost)?.sellerType;
  assert.equal(kind("BUSINESS"), "business");
  assert.equal(kind("INDIVIDUAL"), "private");
  for (const odd of [undefined, null, "", "business", "TRADER", 1, ["BUSINESS"]]) assert.equal(kind(odd), null);
});

test("eBay's own item reference is kept only when it has the expected shape", () => {
  assert.equal(toListing(item(3), siteHost)?.ref, "v1|110000000003|0");
  assert.equal(toListing(item(3, { itemId: "v1|110000000003|410000000001" }), siteHost)?.ref, "v1|110000000003|410000000001");
  for (const odd of ["v2|110000000003|0", "v1|110000000003", "v1|110000000003|0/../x", "v1|11000 0000003|0", "v1|110000000004|0", "https://evil.example", 5, null]) {
    assert.equal(toListing(item(3, { itemId: odd }), siteHost)?.ref, null);
  }
});

test("the short description and the place are tidied, capped and never trusted", () => {
  const listing = toListing(item(1, { shortDescription: `  Core i5\u202E 16GB\n${"x".repeat(900)}`, itemLocation: { country: "GB", postalCode: "ZZ9***", city: "  Some\u200Btown  " } }), siteHost);
  assert.equal(listing?.summary?.startsWith("Core i5 16GB x"), true);
  assert.equal([...(listing?.summary ?? "")].length, 400);
  assert.equal(listing?.city, "Sometown");
  assert.equal(listing?.postcode, "ZZ9");
  const district = (postalCode: unknown) => toListing(item(1, { itemLocation: { country: "GB", postalCode } }), siteHost)?.postcode;
  assert.deepEqual([district("ZZ9 4AB"), district("zz99 4ab"), district(" ZZ9A***"), district("ZZ"), district("12345"), district("ZZ9<b>"), district(99)], ["ZZ9", "ZZ99", "ZZ9A", null, null, null, null]);
  const odd = toListing(item(1, { shortDescription: 7, itemLocation: { country: "GB", postalCode: "<b>ZZ9</b>", city: ["x"] } }), siteHost);
  assert.deepEqual([odd?.summary, odd?.city, odd?.postcode], [null, null, null]);
});

test("postage is called fixed or calculated, top-rated is kept only as true or false, and a listing with options says so", () => {
  const read = (overrides: Record<string, unknown>) => toListing(item(1, overrides), siteHost);
  assert.equal(read({ shippingOptions: [{ shippingCostType: "CALCULATED" }] })?.postageType, "calculated");
  assert.equal(read({ shippingOptions: [{ shippingCostType: "CALCULATED" }, { shippingCostType: "FIXED", shippingCost: { value: "3.00", currency: "GBP" } }] })?.postageType, "fixed");
  assert.equal(read({ shippingOptions: undefined })?.postageType, null);
  assert.equal(read({ shippingOptions: [{ shippingCostType: "SOMETHING_NEW" }] })?.postageType, null);
  assert.equal(read({ topRatedBuyingExperience: true })?.topRated, true);
  assert.equal(read({ topRatedBuyingExperience: "true" })?.topRated, null);
  assert.equal(read({})?.variations, false);
  assert.equal(read({ itemGroupType: "SELLER_DEFINED_VARIATIONS" })?.variations, true);
  assert.equal(read({ primaryItemGroup: { itemGroupId: "1" } })?.variations, true);
  assert.equal(read({ itemGroupType: "" })?.variations, false);
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

test("only an https address on eBay's own API host counts as eBay's API", () => {
  assert.equal(isApiAddress("https://api.ebay.com/buy/browse/v1/item_summary/search?q=x", "api.ebay.com"), true);
  for (const other of [
    "http://api.ebay.com/buy",
    "https://api.ebay.com.evil.example/buy",
    "https://evil.example/api.ebay.com",
    "https://user:pass@api.ebay.com/buy",
    "https://api.ebay.com@evil.example/buy",
    "https://api.sandbox.ebay.com/buy",
    "https://api.ebay.com:8443/buy",
    "//api.ebay.com/buy",
    "",
  ]) {
    assert.equal(isApiAddress(other, "api.ebay.com"), false, other);
  }
});

test("a wait from eBay is read as seconds or a date, capped at a day, and anything odd is ignored", () => {
  const now = Date.parse("2026-11-18T12:00:00.000Z");
  assert.equal(retryAfterMs("120", now), 120_000);
  assert.equal(retryAfterMs(" 5 ", now), 5000);
  assert.equal(retryAfterMs("Wed, 18 Nov 2026 12:30:00 GMT", now), 30 * 60_000);
  assert.equal(retryAfterMs("999999", now), 24 * 60 * 60_000);
  for (const odd of [null, "", "0", "-5", "soon", "1e9", "Wed, 18 Nov 2026 11:00:00 GMT", "9".repeat(41)]) assert.equal(retryAfterMs(odd, now), null);
});

test("too many requests carries eBay's wait, from a search and from a token request", async () => {
  fakeEbay(() => new Response("{}", { status: 429, headers: { "Retry-After": "600" } }));
  const error = await createEbaySource({ clientId, clientSecret, environment: "production" }).search(search(), 1).catch((caught: unknown) => caught);
  assert.ok(error instanceof SourceError);
  assert.equal(error.reason, "busy");
  assert.equal(error.retryAfterMs, 600_000);

  mock.restoreAll();
  fakeEbay(() => new Response("{}"), () => new Response("{}", { status: 429 }));
  const noWait = await createEbaySource({ clientId, clientSecret, environment: "production" }).search(search(), 1).catch((caught: unknown) => caught);
  assert.ok(noWait instanceof SourceError);
  assert.equal(noWait.reason, "busy");
  assert.equal(noWait.retryAfterMs, null);
});

test("look-alike characters in a title are turned into plain ones", () => {
  assert.equal(cleanText("\uFF24\uFF45\uFF4C\uFF4C OptiPlex\u2122 \uFB01ne \u2460", 100), "Dell OptiPlexTM fine 1");
  assert.equal(cleanText("x".repeat(50) + "\uFDFA", 52), "x".repeat(50) + "\u0635\u0644");
});

const withDetails = { categoryId: 179, details: { "Form Factor": ["SFF", "Small Form Factor"], "RAM Size": ["16 GB"] } };

test("a wanted seller type and returns-only become eBay filters, and auto-correct its own setting", () => {
  assert.equal(filterOf(searchUrl(apiHost, search({ sellerType: "business" }), 0)), "buyingOptions:{FIXED_PRICE},itemLocationCountry:GB,sellerAccountTypes:{BUSINESS}");
  assert.equal(filterOf(searchUrl(apiHost, search({ sellerType: "private", returnsOnly: true }), 0)), "buyingOptions:{FIXED_PRICE},itemLocationCountry:GB,sellerAccountTypes:{INDIVIDUAL},returnsAccepted:true");
  assert.equal(new URL(searchUrl(apiHost, search({ autoCorrect: true }), 0)).searchParams.get("auto_correct"), "KEYWORD");
  assert.equal(new URL(searchUrl(apiHost, search(), 0)).searchParams.has("auto_correct"), false);
});

test("item details are sent as eBay's aspect filter only when asked, with the category in both places", () => {
  const plain = new URL(searchUrl(apiHost, search(withDetails), 0));
  assert.equal(plain.searchParams.has("aspect_filter"), false);
  const filtered = new URL(searchUrl(apiHost, search(withDetails), 200, true));
  assert.equal(filtered.searchParams.get("aspect_filter"), "categoryId:179,Form Factor:{SFF|Small Form Factor},RAM Size:{16 GB}");
  assert.equal(filtered.searchParams.get("category_ids"), "179");
  assert.equal(filtered.searchParams.get("offset"), "200");
  assert.equal(filtered.searchParams.getAll("aspect_filter").length, 1);
  assert.equal(new URL(searchUrl(apiHost, search(), 0, true)).searchParams.has("aspect_filter"), false);
  const tricky = new URL(searchUrl(apiHost, search({ categoryId: 179, details: { "Processor": ["Core i5&limit=1#x", "a+b=c"] } }), 0, true));
  assert.equal(tricky.searchParams.get("aspect_filter"), "categoryId:179,Processor:{Core i5&limit=1#x|a+b=c}");
  assert.equal(tricky.searchParams.get("limit"), "200");
  assert.equal(tricky.hash, "");
});

test("in only mode every page is filtered by the item details and every listing counts as a match", async () => {
  const calls = fakeEbay((_call, n) => (n === 1 ? page(items(pageSize), 250) : page(items(50, 201), 250)));
  const found = await source().search(search({ ...withDetails, detailsMode: "only" }), 3);
  assert.equal(found.calls, 2);
  assert.equal(searchCalls(calls).every((call) => new URL(call.url).searchParams.has("aspect_filter")), true);
  assert.equal(found.listings.length, 250);
  assert.equal(found.listings.every((listing) => listing.detailsMatch === true), true);
});

test("in prefer mode the last call asks again with the item details and marks which listings match", async () => {
  const calls = fakeEbay((call) => (new URL(call.url).searchParams.has("aspect_filter") ? page([item(2), item(9)]) : page(items(3))));
  const found = await source().search(search(withDetails), 4);
  assert.equal(found.calls, 2);
  assert.deepEqual(searchCalls(calls).map((call) => new URL(call.url).searchParams.has("aspect_filter")), [false, true]);
  assert.deepEqual(found.listings.map((listing) => [listing.id, listing.detailsMatch]), [
    ["110000000001", false],
    ["110000000002", true],
    ["110000000003", false],
    ["110000000009", true],
  ]);
  assert.equal(found.total, 3);
  assert.equal(found.complete, true);
});

test("prefer mode never makes more calls than it was given, and with one call it skips the second question", async () => {
  const wide = fakeEbay((call) => (new URL(call.url).searchParams.has("aspect_filter") ? page(items(pageSize), 5000) : page(items(pageSize, Number(new URL(call.url).searchParams.get("offset")) + 1), 5000)));
  const found = await source().search(search(withDetails), 3);
  assert.equal(found.calls, 3);
  assert.deepEqual(searchCalls(wide).map((call) => [new URL(call.url).searchParams.get("offset"), new URL(call.url).searchParams.has("aspect_filter")]), [["0", false], ["200", false], ["0", true]]);
  assert.equal(found.complete, false);

  mock.restoreAll();
  const single = fakeEbay(() => page(items(3)));
  const one = await source().search(search(withDetails), 1);
  assert.equal(one.calls, 1);
  assert.equal(searchCalls(single).length, 1);
  assert.equal(one.listings.every((listing) => listing.detailsMatch === null), true);
});

test("if eBay refuses the item details, the search fails and both calls are counted", async () => {
  fakeEbay((call) => (new URL(call.url).searchParams.has("aspect_filter") ? Response.json({ errors: [{ errorId: 12013 }] }, { status: 400 }) : page(items(3))));
  const error = await failure(source().search(search(withDetails), 3));
  assert.equal(error.reason, "request");
  assert.equal(error.message, "eBay refused the search (eBay error 12013)");
  assert.equal(error.calls, 2);
});

test("a search without item details leaves every listing unmarked", async () => {
  fakeEbay(() => page(items(2)));
  const found = await source().search(search(), 3);
  assert.deepEqual(found.listings.map((listing) => listing.detailsMatch), [null, null]);
});

function fullItem(overrides: Record<string, unknown> = {}) {
  return {
    ...item(1),
    subtitle: "Fully tested",
    description: "<div><h1>OptiPlex 7070</h1><p>Intel Core i5-9500 &amp; 16GB RAM.</p><script>alert(1)</script><ul><li>256GB SSD</li><li>Windows 11 Pro</li></ul></div>",
    conditionDescription: "A few light marks on the lid.",
    categoryPath: "Computers/Tablets & Networking|Desktops & All-In-Ones|PC Desktops & All-In-Ones",
    brand: "Dell",
    mpn: "7070",
    localizedAspects: [
      { type: "STRING", name: "Processor", value: "Intel Core i5 9th Gen." },
      { type: "STRING", name: "RAM Size", value: "16 GB" },
      { type: "STRING", name: "Form Factor", value: "Small Form Factor (SFF)" },
    ],
    returnTerms: { returnsAccepted: true, returnPeriod: { value: 30, unit: "CALENDAR_DAY" }, returnShippingCostPayer: "BUYER" },
    shippingOptions: [
      { shippingServiceCode: "Royal Mail Tracked 48", shippingCost: { value: "6.99", currency: "GBP" }, shippingCostType: "FIXED", minEstimatedDeliveryDate: "2026-11-20T00:00:00.000Z", maxEstimatedDeliveryDate: "2026-11-23T00:00:00.000Z" },
    ],
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK", estimatedAvailableQuantity: 3, estimatedSoldQuantity: 12, deliveryOptions: ["SHIP_TO_HOME", "SELLER_ARRANGED_LOCAL_PICKUP"] }],
    lotSize: 0,
    ...overrides,
  };
}

test("a full listing keeps the description as plain text, the item specifics, returns, postage and stock", () => {
  const full = toFull(fullItem(), siteHost);
  assert.deepEqual(
    { ...full, listing: full?.listing.id },
    {
      listing: "110000000001",
      subtitle: "Fully tested",
      description: "OptiPlex 7070 Intel Core i5-9500 & 16GB RAM. 256GB SSD Windows 11 Pro",
      conditionNote: "A few light marks on the lid.",
      categoryPath: "Computers/Tablets & Networking|Desktops & All-In-Ones|PC Desktops & All-In-Ones",
      brand: "Dell",
      model: "7070",
      specifics: [
        { name: "Processor", value: "Intel Core i5 9th Gen." },
        { name: "RAM Size", value: "16 GB" },
        { name: "Form Factor", value: "Small Form Factor (SFF)" },
      ],
      returns: { accepted: true, days: 30, paidBy: "buyer" },
      postageOptions: [{ cost: 699, service: "Royal Mail Tracked 48", earliest: "2026-11-20T00:00:00.000Z", latest: "2026-11-23T00:00:00.000Z" }],
      collection: "offered",
      inStock: true,
      available: 3,
      sold: 12,
      minimumBid: null,
      reserveMet: null,
      bidders: null,
      lotSize: 0,
    },
  );
  assert.equal(full?.listing.price, 9500);
});

test("a full listing reads collection, stock, returns and auction facts carefully", () => {
  const read = (overrides: Record<string, unknown>) => toFull(fullItem(overrides), siteHost);
  const ways = (deliveryOptions: unknown) => read({ estimatedAvailabilities: [{ deliveryOptions }] })?.collection;
  assert.equal(ways(["SELLER_ARRANGED_LOCAL_PICKUP"]), "only");
  assert.equal(ways(["SHIP_TO_HOME"]), "none");
  assert.equal(ways([]), null);
  assert.equal(ways("SELLER_ARRANGED_LOCAL_PICKUP"), null);
  assert.equal(read({ estimatedAvailabilities: undefined })?.collection, null);
  const stock = (estimatedAvailabilityStatus: unknown) => read({ estimatedAvailabilities: [{ estimatedAvailabilityStatus }] })?.inStock;
  assert.deepEqual([stock("IN_STOCK"), stock("LIMITED_STOCK"), stock("OUT_OF_STOCK"), stock("MAYBE"), stock(undefined)], [true, true, false, null, null]);
  assert.equal(read({ returnTerms: undefined })?.returns, null);
  assert.deepEqual(read({ returnTerms: { returnsAccepted: false } })?.returns, { accepted: false, days: null, paidBy: null });
  assert.deepEqual(read({ returnTerms: { returnsAccepted: true, returnPeriod: { value: 1, unit: "MONTH" }, returnShippingCostPayer: "SELLER" } })?.returns, { accepted: true, days: 30, paidBy: "seller" });
  assert.deepEqual(read({ returnTerms: { returnsAccepted: "true", returnPeriod: { value: 2, unit: "YEAR" }, returnShippingCostPayer: "EBAY" } })?.returns, { accepted: false, days: null, paidBy: null });
  const auction = read({ buyingOptions: ["AUCTION"], currentBidPrice: { value: "41.00", currency: "GBP" }, minimumPriceToBid: { value: "42.00", currency: "GBP" }, reservePriceMet: false, uniqueBidderCount: 4, bidCount: 7 });
  assert.deepEqual([auction?.listing.price, auction?.minimumBid, auction?.reserveMet, auction?.bidders, auction?.listing.bids], [4100, 4200, false, 4, 7]);
  assert.equal(read({ minimumPriceToBid: { value: "42.00", currency: "USD" } })?.minimumBid, null);
});

test("a full listing caps and cleans everything a seller can write", () => {
  const full = toFull(
    fullItem({
      subtitle: "s".repeat(500),
      description: `<p>${"d".repeat(9000)}</p>`,
      conditionDescription: "c".repeat(900),
      brand: ["Dell"],
      mpn: 7070,
      localizedAspects: [...Array.from({ length: 80 }, (_, i) => ({ name: `Name ${i}`, value: "v".repeat(500) })), { name: "", value: "x" }, { name: "x" }, "x", null],
      shippingOptions: Array.from({ length: 9 }, () => ({ shippingServiceCode: "x".repeat(200), shippingCost: { value: "1.00", currency: "EUR" }, minEstimatedDeliveryDate: "soon" })),
      estimatedAvailabilities: [{ estimatedAvailableQuantity: -1, estimatedSoldQuantity: "12" }],
    }),
    siteHost,
  );
  assert.equal(full?.subtitle?.length, 100);
  assert.equal(full?.description?.length, 3000);
  assert.equal(full?.conditionNote?.length, 500);
  assert.deepEqual([full?.brand, full?.model], [null, null]);
  assert.equal(full?.specifics.length, 60);
  assert.equal(full?.specifics[0].value.length, 200);
  assert.equal(full?.postageOptions.length, 5);
  assert.deepEqual(full?.postageOptions[0], { cost: null, service: "x".repeat(60), earliest: null, latest: null });
  assert.deepEqual([full?.available, full?.sold], [null, null]);
  assert.equal(toFull({ ...fullItem(), title: "" }, siteHost), null);
  assert.equal(toFull(null, siteHost), null);
});

test("a seller's description is turned into plain text without running forever", () => {
  const cases: [unknown, string | null][] = [
    ["<p>Hello <b>there</b></p>", "Hello there"],
    ["a<br>b<br/>c", "a b c"],
    ["before<script>var x = '<p>hidden</p>';</script>after", "before after"],
    ["before<STYLE type=\"text/css\">p { color: red }</STYLE>after", "before after"],
    ["before<script>never closed", "before"],
    ["before<!-- a <b>comment</b> -->after", "before after"],
    ["before<!-- never closed", "before"],
    ["16GB &amp; 256GB &lt;fast&gt; &quot;SSD&quot; &pound;95 &#163;95 &#xA3;95 &nbsp;end", "16GB & 256GB <fast> \"SSD\" \u00A395 \u00A395 \u00A395 end"],
    ["bad &#0; &#xD800; &#9999999; &bogus; done", "bad &bogus; done"],
    ["RAM < 16GB is slow", "RAM < 16GB is slow"],
    ["RAM <16GB and SSD >256GB <br> works", "RAM <16GB and SSD >256GB works"],
    ["<<<>>>", "<<<>>>"],
    ["\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130<script>hidden()</script><style>p{}</style><!-- note -->after", "\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130 after"],
    ["<a title=\"a>b\" href='x>y'>link</a>", "link"],
    ["<titled>kept</titled> <scripted>kept too</scripted>", "kept kept too"],
    ["a<SCRIPT type=\"x>y\">hidden</SCRIPT >b", "a b"],
    ["", null],
    ["<p></p>", null],
    [7, null],
    [null, null],
  ];
  for (const [html, text] of cases) assert.equal(plainText(html, 3000), text, String(html));
  const started = Date.now();
  assert.equal(plainText("<script".repeat(60_000), 3000), null);
  assert.equal(plainText("<".repeat(400_000), 3000), "<".repeat(3000));
  assert.equal(plainText(`${"<a>".repeat(130_000)}tail`, 3000), "tail");
  assert.equal(plainText(`${"<a b='".repeat(60_000)}tail`, 3000), null);
  assert.equal(plainText(`${"<a b='".repeat(60_001)}>tail`, 3000), "tail");
  assert.equal(plainText(`${"<title".repeat(60_000)}tail`, 3000), null);
  for (const hostile of ["<a b=\"c>", "<a '", "<!--", "</script", "<script></scrip", "&#", "<a \"'>"]) plainText(hostile.repeat(50_000), 3000);
  assert.ok(Date.now() - started < 2000);
});

test("asking for a full listing calls eBay's item address for that reference and nothing else", async () => {
  const calls = fakeEbay(() => Response.json(fullItem()));
  const { full, calls: used } = await source().full!("v1|110000000001|0");
  assert.equal(used, 1);
  assert.equal(full.listing.id, "110000000001");
  const [call] = calls.filter((made) => made.url !== tokenUrl);
  assert.equal(call.url, "https://api.ebay.com/buy/browse/v1/item/v1%7C110000000001%7C0");
  assert.equal(call.url, fullUrl(apiHost, "v1|110000000001|0"));
  assert.equal(call.method, "GET");
  assert.equal(call.headers.get("authorization"), `Bearer ${accessToken}`);
  assert.equal(call.headers.get("x-ebay-c-marketplace-id"), "EBAY_GB");
  assert.equal(call.redirect, "error");
});

test("a reference that isn't eBay's shape is refused before anything is sent", async () => {
  const calls = fakeEbay(() => Response.json(fullItem()));
  for (const ref of ["110000000001", "v1|110000000001|0/../../sell", "v1|1|0?x=1", "https://evil.example", "", "v1|1|0\n"]) {
    const error = await failure(source().full!(ref));
    assert.equal(error.reason, "request");
    assert.equal(error.calls, 0);
  }
  assert.equal(calls.length, 0);
});

test("a listing that has gone, a refusal and a reply that can't be read each say so", async () => {
  fakeEbay(() => Response.json({ errors: [{ errorId: 11001 }] }, { status: 404 }));
  const gone = await failure(source().full!("v1|110000000001|0"));
  assert.deepEqual([gone.reason, gone.message, gone.calls], ["gone", ebayMessages.gone, 1]);
  mock.restoreAll();
  fakeEbay(() => Response.json({ title: "No id or price" }));
  assert.equal((await failure(source().full!("v1|110000000001|0"))).reason, "reply");
  mock.restoreAll();
  fakeEbay(() => new Response("{}", { status: 429, headers: { "Retry-After": "60" } }));
  const busy = await failure(source().full!("v1|110000000001|0"));
  assert.deepEqual([busy.reason, busy.retryAfterMs], ["busy", 60_000]);
  mock.restoreAll();
  fakeEbay(() => Response.json({ errors: [{ errorId: 12001 }] }, { status: 404 }));
  assert.equal((await failure(source().search(search(), 1))).reason, "request");
});

test("asking what item details a query has reads eBay's own names, values and categories", async () => {
  const calls = fakeEbay(() =>
    Response.json({
      total: 812,
      refinement: {
        dominantCategoryId: "179",
        categoryDistributions: [
          { categoryId: "179", categoryName: "PC Desktops & All-In-Ones", matchCount: 700, refinementHref: "https://api.ebay.com/x" },
          { categoryId: "abc", categoryName: "Broken", matchCount: 1 },
        ],
        aspectDistributions: [
          { localizedAspectName: "Form Factor", aspectValueDistributions: [{ localizedAspectValue: "Tower", matchCount: 40 }, { localizedAspectValue: "SFF", matchCount: 310, refinementHref: "https://api.ebay.com/y" }, { localizedAspectValue: "", matchCount: 5 }] },
          { localizedAspectName: "Empty", aspectValueDistributions: [] },
          { localizedAspectName: "Brand", aspectValueDistributions: Array.from({ length: 60 }, (_, i) => ({ localizedAspectValue: `Brand ${i}`, matchCount: i })) },
        ],
      },
    }),
  );
  const { names, calls: used } = await source().detailNames!("optiplex 7070 & more", "179");
  assert.equal(used, 1);
  assert.equal(names.categoryId, "179");
  assert.deepEqual(names.categories, [{ id: "179", name: "PC Desktops & All-In-Ones", count: 700 }]);
  assert.deepEqual(names.details[0], { name: "Form Factor", values: [{ value: "SFF", count: 310 }, { value: "Tower", count: 40 }] });
  assert.equal(names.details.length, 2);
  assert.equal(names.details[1].values.length, 25);
  assert.equal(names.details[1].values[0].value, "Brand 59");
  assert.ok(!JSON.stringify(names).includes("api.ebay.com"));
  const url = new URL(calls.filter((made) => made.url !== tokenUrl)[0].url);
  assert.equal(`${url.origin}${url.pathname}`, searchPath);
  assert.deepEqual([...url.searchParams], [["q", "optiplex 7070 & more"], ["category_ids", "179"], ["fieldgroups", "ASPECT_REFINEMENTS,CATEGORY_REFINEMENTS"], ["limit", "1"]]);
  assert.equal(new URL(detailNamesUrl(apiHost, "ddr4", null)).searchParams.has("category_ids"), false);
});

test("a reply with no refinements gives empty lists, and one that isn't an object is a failure", async () => {
  assert.deepEqual(toDetailNames({ total: 0 }), { categoryId: null, categories: [], details: [] });
  assert.deepEqual(toDetailNames({ refinement: { dominantCategoryId: 179, categoryDistributions: "x", aspectDistributions: [null, "x", { localizedAspectName: 5 }] } }), { categoryId: null, categories: [], details: [] });
  assert.equal(toDetailNames([]), null);
  fakeEbay(() => Response.json([]));
  assert.equal((await failure(source().detailNames!("ddr4", null))).reason, "reply");
});

test("a warning from eBay about the item details fails the search, so a wrong name is never reported as a match", async () => {
  const warned = (errorId: unknown) => Response.json({ total: 2, itemSummaries: items(2), warnings: [{ errorId, message: "The aspect_filter value is invalid" }] });
  fakeEbay(() => warned(12018));
  const only = await failure(source().search(search({ ...withDetails, detailsMode: "only" }), 3));
  assert.deepEqual([only.reason, only.message, only.calls], ["request", "eBay refused the search (eBay warning 12018 about the item details)", 1]);
  mock.restoreAll();
  fakeEbay((call) => (new URL(call.url).searchParams.has("aspect_filter") ? warned("odd") : page(items(2))));
  const prefer = await failure(source().search(search(withDetails), 3));
  assert.deepEqual([prefer.message, prefer.calls], ["eBay refused the search (eBay warned about the item details)", 2]);
  mock.restoreAll();
  fakeEbay(() => warned(12018));
  assert.equal((await source().search(search(), 3)).listings.length, 2);
});

test("in prefer mode, a details page too full to be the whole answer leaves the others unknown, not marked as failing", async () => {
  fakeEbay((call) => (new URL(call.url).searchParams.has("aspect_filter") ? page(items(pageSize), 300) : page(items(250).slice(0, pageSize), 250)));
  const found = await source().search(search(withDetails), 2);
  assert.deepEqual([...new Set(found.listings.map((listing) => listing.detailsMatch))], [true]);
  mock.restoreAll();
  fakeEbay((call) => (new URL(call.url).searchParams.has("aspect_filter") ? page(items(pageSize, 1000), 300) : page(items(3))));
  const mixed = await source().search(search(withDetails), 2);
  assert.deepEqual(mixed.listings.slice(0, 3).map((listing) => listing.detailsMatch), [null, null, null]);
  assert.equal(mixed.listings.slice(3).every((listing) => listing.detailsMatch === true), true);
});

test("characters that take no space, like variation marks and filler letters, are dropped from titles", () => {
  assert.equal(cleanText("a️bㅤcᅟᅠﾠd︀\u{E0100}e", 100), "abcde");
  assert.equal(cleanText("ㅤ️ᅟ", 100), "");
});
const taxonomy = "https://api.ebay.com/commerce/taxonomy/v1";

function taxonomyReply(call: Call): Response {
  const url = new URL(call.url);
  if (url.pathname.endsWith("/get_default_category_tree_id")) return Response.json({ categoryTreeId: "3", categoryTreeVersion: "130" });
  if (url.pathname.endsWith("/get_category_suggestions")) {
    return Response.json({
      categorySuggestions: [
        {
          category: { categoryId: "170083", categoryName: "Memory (RAM)" },
          categoryTreeNodeLevel: 3,
          categoryTreeNodeAncestors: [
            { categoryId: "175673", categoryName: "Computer Components & Parts", categoryTreeNodeLevel: 2, categorySubtreeNodeHref: "https://api.ebay.com/x" },
            { categoryId: "58058", categoryName: "Computers, Tablets & Network Hardware", categoryTreeNodeLevel: 1 },
          ],
          relevancy: "HIGH",
        },
        { category: { categoryId: "170083", categoryName: "Memory (RAM)" } },
        { category: { categoryId: "abc", categoryName: "Broken" } },
        { category: { categoryId: "177", categoryName: "" } },
        "x",
        { category: { categoryId: "16145", categoryName: "Laptop Memory\u202E" }, categoryTreeNodeAncestors: "nope" },
      ],
      categoryTreeId: "3",
    });
  }
  return Response.json({
    categoryId: "170083",
    aspects: [
      { localizedAspectName: "Form Factor", aspectConstraint: { aspectRequired: true, aspectMode: "SELECTION_ONLY" }, aspectValues: [{ localizedValue: "DIMM" }, { localizedValue: "SO-DIMM" }, { localizedValue: "DIMM" }, { localizedValue: "" }, "x"] },
      { localizedAspectName: "Brand", aspectConstraint: { aspectMode: "FREE_TEXT" }, aspectValues: Array.from({ length: 130 }, (_, i) => ({ localizedValue: `Brand ${i}` })) },
      { localizedAspectName: "Form Factor", aspectValues: [] },
      { localizedAspectName: "", aspectValues: [{ localizedValue: "x" }] },
      { localizedAspectName: "Type" },
    ],
  });
}

test("categories are suggested from eBay's UK tree, with each one's path from the top, and the tree is asked for once", async () => {
  const calls = fakeEbay((call) => taxonomyReply(call));
  const made = source();
  const { categories, calls: used } = await made.categories!("ddr4 2x16gb & more");
  assert.equal(used, 2);
  assert.deepEqual(categories, {
    categories: [
      { id: "170083", name: "Memory (RAM)", path: "Computers, Tablets & Network Hardware > Computer Components & Parts > Memory (RAM)" },
      { id: "16145", name: "Laptop Memory", path: "Laptop Memory" },
    ],
  });
  assert.equal((await made.categories!("ssd")).calls, 1);
  const asked = calls.filter((call) => call.url !== tokenUrl).map((call) => call.url);
  assert.deepEqual(asked, [
    `${taxonomy}/get_default_category_tree_id?marketplace_id=EBAY_GB`,
    `${taxonomy}/category_tree/3/get_category_suggestions?q=ddr4%202x16gb%20%26%20more`,
    `${taxonomy}/category_tree/3/get_category_suggestions?q=ssd`,
  ]);
  assert.ok(calls.filter((call) => call.url !== tokenUrl).every((call) => call.headers.get("X-EBAY-C-MARKETPLACE-ID") === "EBAY_GB" && call.redirect === "error"));
  assert.ok(!JSON.stringify(categories).includes("api.ebay.com"));
});

test("a category's item details come back with whether each is required, whether sellers type them freely, and at most 100 values", async () => {
  fakeEbay((call) => taxonomyReply(call));
  const { details, calls: used } = await source().categoryDetails!("170083");
  assert.equal(used, 2);
  assert.equal(details.categoryId, "170083");
  assert.deepEqual(details.details.map((detail) => detail.name), ["Form Factor", "Brand", "Type"]);
  assert.deepEqual(details.details[0], { name: "Form Factor", required: true, freeText: false, values: ["DIMM", "SO-DIMM"], moreValues: 0 });
  assert.deepEqual([details.details[1].required, details.details[1].freeText, details.details[1].values.length, details.details[1].moreValues], [false, true, 100, 30]);
  assert.deepEqual(details.details[2], { name: "Type", required: false, freeText: true, values: [], moreValues: 0 });
});

test("a category with categories under it, a bad number or an odd reply is a failure that says so", async () => {
  fakeEbay((call) => (call.url.includes("get_item_aspects") ? Response.json({ errors: [{ errorId: 62009, message: "The specified category ID must be a leaf category." }] }, { status: 400 }) : taxonomyReply(call)));
  const parent = await failure(source().categoryDetails!("58058"));
  assert.deepEqual([parent.reason, parent.message, parent.calls], ["request", "eBay refused the search (that category has categories under it, and only the last level has item details)", 2]);
  mock.restoreAll();
  const calls = fakeEbay((call) => taxonomyReply(call));
  const odd = await failure(source().categoryDetails!("12a"));
  assert.deepEqual([odd.reason, odd.calls, calls.length], ["request", 0, 0]);
  mock.restoreAll();
  for (const odd of ["../3", "1234567", 3, ""]) {
    fakeEbay((call) => (call.url.includes("get_default") ? Response.json({ categoryTreeId: odd }) : taxonomyReply(call)));
    assert.equal((await failure(source().categories!("ram"))).reason, "reply", String(odd));
    mock.restoreAll();
  }
  mock.restoreAll();
  fakeEbay((call) => (call.url.includes("get_default") ? taxonomyReply(call) : Response.json([])));
  assert.equal((await failure(source().categories!("ram"))).reason, "reply");
  assert.equal((await failure(source().categoryDetails!("170083"))).reason, "reply");
  assert.deepEqual(toCategories({}), { categories: [] });
  assert.deepEqual(toCategoryDetails({ aspects: "x" }, "1"), { categoryId: "1", details: [] });
  assert.equal(toCategoryDetails(null, "1"), null);
});

test("the category addresses are all on eBay's API host", () => {
  for (const url of [treeIdUrl(apiHost), categoriesUrl(apiHost, "3", "a b"), categoryDetailsUrl(apiHost, "3", "170083")]) assert.equal(isApiAddress(url, apiHost), true, url);
  assert.equal(categoryDetailsUrl(apiHost, "3", "170083"), `${taxonomy}/category_tree/3/get_item_aspects_for_category?category_id=170083`);
});

const hiding = { categoryId: 170083, hideDetails: { "Form Factor": ["SO-DIMM", "MicroDIMM"], "Features": ["Registered"] } };

function aspectOf(call: Call): string | null {
  return new URL(call.url).searchParams.get("aspect_filter");
}

test("each hidden item detail is one more question to eBay, and the listings it names are marked with that detail", async () => {
  const calls = fakeEbay((call) => {
    const aspect = aspectOf(call);
    if (aspect === "categoryId:170083,Form Factor:{SO-DIMM|MicroDIMM}") return page([item(2), item(9)], 2);
    if (aspect === "categoryId:170083,Features:{Registered}") return page([item(3), item(2)], 2);
    return page(items(5), 5);
  });
  const found = await source().search(search(hiding), 4);
  assert.equal(found.calls, 3);
  assert.deepEqual(found.listings.map((listing) => listing.hiddenDetail), [undefined, "Form Factor", "Features", undefined, undefined]);
  assert.deepEqual(found.listings.map((listing) => listing.detailsMatch), [null, null, null, null, null]);
  const made = searchCalls(calls);
  assert.deepEqual(made.map(aspectOf), [null, "categoryId:170083,Form Factor:{SO-DIMM|MicroDIMM}", "categoryId:170083,Features:{Registered}"]);
  assert.ok(made.every((call) => new URL(call.url).searchParams.get("category_ids") === "170083" && filterOf(call.url) === filterOf(made[0].url)));
});

test("a hidden item detail that would hide every listing fails the search instead of hiding everything", async () => {
  fakeEbay((call) => (aspectOf(call) === null ? page(items(5), 5) : page(items(5), 5)));
  const all = await failure(source().search(search({ categoryId: 170083, hideDetails: { "Form Factr": ["SO-DIMM"] } }), 3));
  assert.deepEqual([all.reason, all.message, all.calls], ["request", "eBay refused the search (hiding by Form Factr would hide every listing, so check the name and values)", 2]);
  mock.restoreAll();
  fakeEbay((call) => (aspectOf(call) === null ? page([], 0) : page([], 0)));
  assert.deepEqual((await source().search(search({ categoryId: 170083, hideDetails: { "Form Factor": ["SO-DIMM"] } }), 3)).listings, []);
  mock.restoreAll();
  fakeEbay((call) => (aspectOf(call) === null ? page(items(2)) : Response.json({ total: 0, itemSummaries: [], warnings: [{ errorId: 12018 }] })));
  const warned = await failure(source().search(search({ categoryId: 170083, hideDetails: { "Form Factor": ["SO-DIMM"] } }), 3));
  assert.equal(warned.message, "eBay refused the search (eBay warning 12018 about the item details)");
});

test("each hidden item detail can read as many pages as the search did, and the budget is shared so the search keeps at least one", async () => {
  const kinds = (made: Call[]) => searchCalls(made).map(aspectOf).map((aspect) => aspect?.split(",")[1] ?? "main");
  const calls = fakeEbay((call) => (aspectOf(call) === null ? page(items(pageSize), 600) : page([], 0)));
  await source().search(search({ ...hiding, details: { "Type": ["DDR4 SDRAM"] } }), 10);
  assert.deepEqual(kinds(calls), ["main", "main", "main", "Type:{DDR4 SDRAM}", "Form Factor:{SO-DIMM|MicroDIMM}", "Features:{Registered}"]);
  mock.restoreAll();
  const full = fakeEbay((call) => (aspectOf(call) === null ? page(items(pageSize), 600) : page(items(pageSize, 1000), 450)));
  await source().search(search(hiding), 9);
  assert.deepEqual(kinds(full), ["main", "main", "main", "Form Factor:{SO-DIMM|MicroDIMM}", "Form Factor:{SO-DIMM|MicroDIMM}", "Form Factor:{SO-DIMM|MicroDIMM}", "Features:{Registered}", "Features:{Registered}", "Features:{Registered}"]);
  mock.restoreAll();
  const few = fakeEbay((call) => (aspectOf(call) === null ? page(items(pageSize), 600) : page([], 0)));
  await source().search(search({ ...hiding, details: { "Type": ["DDR4 SDRAM"] } }), 2);
  assert.deepEqual(kinds(few), ["main", "Form Factor:{SO-DIMM|MicroDIMM}", "Features:{Registered}"]);
});

test("older listings on later pages are hidden too, when the hiding question reads that far", async () => {
  fakeEbay((call) => {
    const offset = Number(new URL(call.url).searchParams.get("offset"));
    if (aspectOf(call) === null) return page(items(pageSize, offset + 1), 600);
    return offset === 0 ? page(items(pageSize, 301), 250) : page(items(50, 501), 250);
  });
  const found = await source().search(search({ categoryId: 170083, hideDetails: { "Form Factor": ["SO-DIMM"] } }), 6);
  assert.equal(found.calls, 5);
  assert.equal(found.listings.filter((listing) => listing.hiddenDetail === "Form Factor").length, 250);
  assert.equal(found.listings.find((listing) => listing.title.endsWith("number 550"))?.hiddenDetail, "Form Factor");
  assert.equal(found.listings.find((listing) => listing.title.endsWith("number 551"))?.hiddenDetail, undefined);
});

test("in only mode, the hiding question keeps the search's own item details, so the counts compare like with like", async () => {
  const calls = fakeEbay((call) => (aspectOf(call)?.includes("Form Factor") ? page([item(2)], 40) : page(items(5), 300)));
  const found = await source().search(search({ categoryId: 170083, details: { "Type": ["DDR4 SDRAM"] }, detailsMode: "only", hideDetails: { "Form Factor": ["SO-DIMM"] } }), 6);
  assert.deepEqual(searchCalls(calls).map(aspectOf), ["categoryId:170083,Type:{DDR4 SDRAM}", "categoryId:170083,Type:{DDR4 SDRAM},Form Factor:{SO-DIMM}"]);
  assert.deepEqual(found.listings.map((listing) => listing.hiddenDetail), [undefined, "Form Factor", undefined, undefined, undefined]);
});

test("a collection search sends eBay's local pickup filters with the postcode, and free postage sends the zero postage filter", () => {
  const local = readSearches(JSON.stringify({ postcode: "LS1 4AP", searches: [{ id: "ups", name: "UPS", switch: "on", query: "apc back-ups", collectionMiles: 25 }] }), ["ebay"]).searches[0];
  const filter = filterOf(searchUrl(apiHost, local, 0)) ?? "";
  assert.ok(filter.endsWith(",deliveryOptions:{SELLER_ARRANGED_LOCAL_PICKUP},pickupCountry:GB,pickupPostalCode:LS1 4AP,pickupRadius:25,pickupRadiusUnit:mi"), filter);
  assert.ok((filterOf(searchUrl(apiHost, search({ freePostage: true }), 0)) ?? "").endsWith(",maxDeliveryCost:0"));
  const plain = filterOf(searchUrl(apiHost, search(), 0)) ?? "";
  assert.ok(!plain.includes("pickup") && !plain.includes("maxDeliveryCost"));
});

test("a listing with options keeps its item group number, from the group's details or its address, and nothing else does", () => {
  const read = (overrides: Record<string, unknown>) => toListing(item(1, overrides), siteHost);
  const href = "https://api.ebay.com/buy/browse/v1/item/get_items_by_item_group?item_group_id=226543210987";
  assert.equal(read({ primaryItemGroup: { itemGroupId: "226543210987" } })?.groupId, "226543210987");
  assert.equal(read({ itemGroupType: "SELLER_DEFINED_VARIATIONS", itemGroupHref: href })?.groupId, "226543210987");
  assert.equal(read({ itemGroupType: "SELLER_DEFINED_VARIATIONS", itemGroupHref: `${href}&fieldgroups=X` })?.groupId, "226543210987");
  assert.equal(read({ primaryItemGroup: { itemGroupId: "111" }, itemGroupHref: href })?.groupId, "111");
  assert.equal(read({ itemGroupHref: href })?.groupId, undefined);
  assert.equal("groupId" in (read({}) ?? {}), false);
  for (const bad of ["https://api.ebay.com/x?item_group_id=12a", "item_group_id=../1", "https://api.ebay.com/x?other_item_group_id=1", `https://api.ebay.com/x?item_group_id=${"1".repeat(21)}`, 226543210987]) {
    assert.equal(read({ itemGroupType: "SELLER_DEFINED_VARIATIONS", itemGroupHref: bad })?.groupId, undefined, String(bad));
  }
  assert.equal(read({ primaryItemGroup: { itemGroupId: "12/../3" } })?.groupId, undefined);
});

function option(n: number, aspects: [string, string][], price = "40.00", status = "IN_STOCK") {
  return {
    itemId: `v1|226543210987|${n}`,
    title: "Seagate IronWolf NAS hard drive 1TB 2TB 4TB",
    price: { value: price, currency: "GBP" },
    localizedAspects: aspects.map(([name, value]) => ({ type: "STRING", name, value })),
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: status }],
  };
}

test("an item group's options are read with the details that differ between them, their own prices and whether they're in stock", () => {
  const shared: [string, string] = ["Brand", "Seagate"];
  const options = toOptions({
    items: [
      option(1, [shared, ["Storage Capacity", "1 TB"], ["Colour", "Black"]], "15.00"),
      option(2, [shared, ["Storage Capacity", "4 TB"], ["Colour", "Black"]], "52.50", "LIMITED_STOCK"),
      option(3, [shared, ["Storage Capacity", "8 TB"]], "99.99", "OUT_OF_STOCK"),
    ],
    commonDescriptions: [],
  });
  assert.deepEqual(options, [
    { ref: "v1|226543210987|1", price: 1500, text: "Storage Capacity: 1 TB, Colour: Black", inStock: true },
    { ref: "v1|226543210987|2", price: 5250, text: "Storage Capacity: 4 TB, Colour: Black", inStock: true },
    { ref: "v1|226543210987|3", price: 9999, text: "Storage Capacity: 8 TB", inStock: false },
  ]);
});

test("an option without a price in pounds is left out, odd references and stock become unknown, and a bad reply is refused", () => {
  const read = toOptions({
    items: [
      option(1, [["Size", "1 TB"]], "15.00", "SOMETHING_NEW"),
      { ...option(2, [["Size", "2 TB"]]), price: { value: "20.00", currency: "USD" } },
      { ...option(3, [["Size", "4 TB"]]), itemId: "v1|1|0/../x" },
      { ...option(4, [["Size", "8 TB"]]), price: undefined },
      "not an item",
    ],
  });
  assert.deepEqual(read, [
    { ref: "v1|226543210987|1", price: 1500, text: "Size: 1 TB", inStock: null },
    { ref: null, price: 4000, text: "Size: 4 TB", inStock: true },
  ]);
  for (const bad of [null, [], {}, { items: "x" }, { items: {} }]) assert.equal(toOptions(bad), null, JSON.stringify(bad));
  assert.deepEqual(toOptions({ items: [] }), []);
  assert.deepEqual(toOptions({ items: [option(1, [["Size", "1 TB"]])] }), [{ ref: "v1|226543210987|1", price: 4000, text: "", inStock: true }]);
});

test("an item group of more than 100 options isn't read, sizes come first in an option's text, and what a seller writes is cleaned and kept short", () => {
  assert.equal(toOptions({ items: Array.from({ length: 101 }, (_, i) => option(i + 1, [["Size", `${i + 1} TB`]])) }), null);
  assert.equal(toOptions({ items: Array.from({ length: 100 }, (_, i) => option(i + 1, [["Size", `${i + 1} TB`]])) })?.length, 100);
  const sized = toOptions({ items: [option(1, [["Model", "WD10EFRX"], ["MPN", "WD10EFRX-68FYTN0"], ["Storage Capacity", "1 TB"]]), option(2, [["Model", "WD40EFRX"], ["MPN", "WD40EFRX-68N32N0"], ["Storage Capacity", "4 TB"]])] });
  assert.deepEqual(sized?.map((entry) => entry.text), ["Storage Capacity: 1 TB, Model: WD10EFRX, MPN: WD10EFRX-68FYTN0", "Storage Capacity: 4 TB, Model: WD40EFRX, MPN: WD40EFRX-68N32N0"]);
  const long = "x".repeat(500);
  const tidy = toOptions({ items: [option(1, [["Colour", `Red\u0000\u202Ered ${long}`], ["Size", "1 TB"]]), option(2, [["Colour", "Blue"], ["Size", "1 TB"]])] });
  assert.ok(tidy !== null && tidy[0].text.length <= 200 && !/[\u0000\u202E]/.test(tidy[0].text) && tidy[0].text.startsWith("Colour: Red red"));
  assert.equal(tidy?.[1].text, "Colour: Blue");
  const names = Array.from({ length: 10 }, (_, i) => `Detail number ${i}`);
  const wide = toOptions({ items: [1, 2].map((n) => option(n, names.map((name): [string, string] => [name, `${"v".repeat(55)}${n}`]))) });
  assert.ok(wide !== null && wide[0].text.length === 200 && wide[0].text.startsWith("Detail number 0: vvv"), String(wide?.[0].text));
});

test("reading an item group's options calls eBay's group address for that number, and refuses anything that isn't one", async () => {
  const calls = fakeEbay(() => Response.json({ items: [option(1, [["Size", "1 TB"]]), option(2, [["Size", "4 TB"]], "55.00")] }));
  const { options, calls: used } = await source().options!("226543210987");
  assert.equal(used, 1);
  assert.deepEqual(options.map((entry) => [entry.text, entry.price]), [["Size: 1 TB", 4000], ["Size: 4 TB", 5500]]);
  const [call] = calls.filter((made) => made.url !== tokenUrl);
  assert.equal(call.url, "https://api.ebay.com/buy/browse/v1/item/get_items_by_item_group?item_group_id=226543210987");
  assert.equal(call.url, optionsUrl(apiHost, "226543210987"));
  assert.equal(call.method, "GET");
  assert.equal(call.headers.get("authorization"), `Bearer ${accessToken}`);
  assert.equal(call.headers.get("x-ebay-c-marketplace-id"), "EBAY_GB");
  assert.equal(call.redirect, "error");
  mock.restoreAll();
  const none = fakeEbay(() => Response.json({ items: [] }));
  for (const groupId of ["", "12a", "1&item_group_id=2", "../1", "1".repeat(21), "1\n"]) {
    const error = await failure(source().options!(groupId));
    assert.deepEqual([error.reason, error.calls], ["request", 0], groupId);
  }
  assert.equal(none.length, 0);
});

test("an item group that has gone, a refusal and a reply that can't be read each say so", async () => {
  fakeEbay(() => Response.json({ errors: [{ errorId: 11002 }] }, { status: 404 }));
  assert.deepEqual(await failure(source().options!("226543210987")).then((error) => [error.reason, error.calls]), ["gone", 1]);
  mock.restoreAll();
  fakeEbay(() => Response.json({ items: "nope" }));
  assert.equal((await failure(source().options!("226543210987"))).reason, "reply");
  mock.restoreAll();
  fakeEbay(() => new Response("{}", { status: 429, headers: { "Retry-After": "60" } }));
  assert.equal((await failure(source().options!("226543210987"))).reason, "busy");
  mock.restoreAll();
  fakeEbay(() => Response.json({ errors: [{ errorId: 11013 }] }, { status: 400 }));
  const refused = await failure(source().options!("226543210987"));
  assert.deepEqual([refused.reason, refused.message], ["request", `${ebayMessages.request} (eBay error 11013)`]);
});

test("a plain search's cuts drop buy it now only, then the UK, one at a time", () => {
  assert.deepEqual(cutSteps(search()), [
    { filter: "buy it now only", change: { buying: ["buy it now", "auction"] }, refine: "BUYING_OPTION_REFINEMENTS" },
    { filter: "items in the UK", change: { ukOnly: false }, refine: null },
  ]);
  assert.deepEqual(cutSteps(search({ buying: ["auction"], ukOnly: false }))[0], { filter: "auction only", change: { buying: ["buy it now", "auction"] }, refine: "BUYING_OPTION_REFINEMENTS" });
  assert.deepEqual(cutSteps(search({ buying: ["buy it now", "auction"], ukOnly: false })), []);
});

test("every filter a search sets has its own cut, named in plain words, with the price as eBay is asked for it", () => {
  const full = search({
    minPrice: 140,
    maxPrice: 400,
    maxWithPostage: 330,
    conditions: ["new", "opened", "used"],
    sellerType: "business",
    returnsOnly: true,
    freePostage: true,
    ...withDetails,
    detailsMode: "only",
  });
  assert.deepEqual(
    cutSteps(full).map((step) => [step.filter, step.refine]),
    [
      ["buy it now only", "BUYING_OPTION_REFINEMENTS"],
      ["items in the UK", null],
      ["price £140.00 to £330.00", null],
      ["condition new, opened, used", "CONDITION_REFINEMENTS"],
      ["category 179 and item details", null],
      ["item details", null],
      ["business sellers, returns accepted, free postage", null],
    ],
  );
  assert.equal(cutSteps(search({ maxWithPostage: 60 })).find((step) => step.filter.startsWith("price"))?.filter, "price up to £60.00");
  assert.equal(cutSteps(search({ minPrice: 5 })).find((step) => step.filter.startsWith("price"))?.filter, "price from £5.00");
  const collecting = readSearches(JSON.stringify({ postcode: "ZZ9 9ZZ", searches: [{ id: "optiplex", name: "OptiPlex", switch: "on", query: "optiplex 7070 sff", collectionMiles: 10 }] }), ["ebay"]).searches[0];
  assert.deepEqual(cutSteps(collecting).at(-1), { filter: "collection within 10 miles", change: { sellerType: null, returnsOnly: false, freePostage: false, collection: null }, refine: null });
});

test("a cut's count asks eBay for one listing with the search's filters, and a refinement when it wants a breakdown", () => {
  const plain = new URL(countUrl(apiHost, search({ categoryId: 27386 }), null));
  assert.equal(plain.origin + plain.pathname, searchPath);
  assert.deepEqual([plain.searchParams.get("q"), plain.searchParams.get("category_ids"), plain.searchParams.get("limit"), plain.searchParams.get("fieldgroups")], ["optiplex 7070 sff", "27386", "1", "MATCHING_ITEMS"]);
  assert.equal(plain.searchParams.get("filter"), filterOf(searchUrl(apiHost, search({ categoryId: 27386 }), 0)));
  assert.equal(plain.searchParams.has("sort") || plain.searchParams.has("offset"), false);
  assert.equal(new URL(countUrl(apiHost, search(), "CONDITION_REFINEMENTS")).searchParams.get("fieldgroups"), "MATCHING_ITEMS,CONDITION_REFINEMENTS");
  const only = new URL(countUrl(apiHost, search({ ...withDetails, detailsMode: "only" }), null));
  assert.equal(only.searchParams.get("aspect_filter"), "categoryId:179,Form Factor:{SFF|Small Form Factor},RAM Size:{16 GB}");
  assert.equal(new URL(countUrl(apiHost, search({ ...withDetails, detailsMode: "prefer" }), null)).searchParams.has("aspect_filter"), false);
  const words = new URL(wordsUrl(apiHost, "quadro p620 & more"));
  assert.deepEqual([...words.searchParams.keys()].sort(), ["fieldgroups", "limit", "q"]);
  assert.deepEqual([words.searchParams.get("q"), words.searchParams.get("fieldgroups"), words.searchParams.get("limit")], ["quadro p620 & more", "CATEGORY_REFINEMENTS", "1"]);
});

test("a cut reads eBay's total and, when asked, its breakdown by buying option or condition, biggest first", () => {
  const reply = {
    total: 52,
    refinement: {
      buyingOptionDistributions: [{ buyingOption: "FIXED_PRICE", matchCount: 12 }, { buyingOption: "AUCTION", matchCount: 40 }, { buyingOption: "SOMETHING_NEW", matchCount: 3 }, { buyingOption: "BEST_OFFER", matchCount: "7" }, "odd"],
      conditionDistributions: [{ condition: "Used", conditionId: "3000", matchCount: 3 }, { condition: "Seller refurbished\u0000", conditionId: "2500", matchCount: 25 }, { condition: "", matchCount: 9 }],
    },
  };
  assert.deepEqual(toCut(reply, "buy it now only", "BUYING_OPTION_REFINEMENTS"), { filter: "buy it now only", total: 52, by: [{ name: "auction", count: 40 }, { name: "buy it now", count: 12 }] });
  assert.deepEqual(toCut(reply, "condition used", "CONDITION_REFINEMENTS"), { filter: "condition used", total: 52, by: [{ name: "Seller refurbished", count: 25 }, { name: "Used", count: 3 }] });
  assert.deepEqual(toCut(reply, "price", null), { filter: "price", total: 52, by: [] });
  assert.deepEqual(toCut({ total: 0 }, "price", "CONDITION_REFINEMENTS"), { filter: "price", total: 0, by: [] });
  for (const odd of [null, [], "52", { total: -1 }, { total: "52" }, {}]) assert.equal(toCut(odd, "x", null), null, JSON.stringify(odd));
  const many = { total: 9, refinement: { conditionDistributions: Array.from({ length: 30 }, (_, n) => ({ condition: `Condition ${n}`, matchCount: n })) } };
  assert.equal(toCut(many, "x", "CONDITION_REFINEMENTS")?.by.length, 20);
});

test("a search's cuts ask eBay once as watched, once for each filter dropped, and once for its words alone", async () => {
  const totals: Record<string, number> = { "": 5, "buy it now only": 52, "items in the UK": 9, "price £140.00 to £330.00": 60, "condition new, opened, used": 20, "category 27386": 6 };
  const wanted = search({ minPrice: 140, maxWithPostage: 330, conditions: ["new", "opened", "used"], categoryId: 27386 });
  const steps = ["", ...cutSteps(wanted).map((step) => step.filter)];
  const calls = fakeEbay((call, n) => {
    const url = new URL(call.url);
    if (n === steps.length + 1) {
      assert.equal(url.searchParams.get("fieldgroups"), "CATEGORY_REFINEMENTS");
      return Response.json({ total: 4409, refinement: { dominantCategoryId: "27386", categoryDistributions: [{ categoryId: "171957", categoryName: "Desktops & All-in-Ones", matchCount: 4291 }, { categoryId: "27386", categoryName: "Graphics/Video Cards", matchCount: 117 }] } });
    }
    const step = steps[n - 1];
    return Response.json({ total: totals[step], refinement: step === "buy it now only" ? { buyingOptionDistributions: [{ buyingOption: "AUCTION", matchCount: 40 }] } : {} });
  });
  const { cuts, calls: used } = await source().cuts!(wanted);
  assert.equal(used, steps.length + 1);
  assert.equal(searchCalls(calls).length, steps.length + 1);
  assert.equal(mintCalls(calls).length, 1);
  assert.deepEqual(cuts, {
    asWatched: 5,
    without: [
      { filter: "buy it now only", total: 52, by: [{ name: "auction", count: 40 }] },
      { filter: "items in the UK", total: 9, by: [] },
      { filter: "price £140.00 to £330.00", total: 60, by: [] },
      { filter: "condition new, opened, used", total: 20, by: [] },
      { filter: "category 27386", total: 6, by: [] },
    ],
    wordsAlone: { total: 4409, categoryId: "27386", categories: [{ id: "171957", name: "Desktops & All-in-Ones", count: 4291 }, { id: "27386", name: "Graphics/Video Cards", count: 117 }] },
  });
  const asked = searchCalls(calls).map((call) => new URL(call.url));
  assert.match(asked[1].searchParams.get("filter") ?? "", /buyingOptions:\{FIXED_PRICE\|AUCTION\}/);
  assert.match(asked[2].searchParams.get("filter") ?? "", /deliveryCountry:GB/);
  assert.doesNotMatch(asked[3].searchParams.get("filter") ?? "", /price/);
  assert.doesNotMatch(asked[4].searchParams.get("filter") ?? "", /conditionIds/);
  assert.equal(asked[5].searchParams.has("category_ids"), false);
  for (const url of asked.slice(1, 5)) assert.equal(url.searchParams.get("category_ids"), "27386");
});

test("a cuts reply eBay sends without a count fails as unreadable, counting the calls made", async () => {
  fakeEbay((_call, n) => (n === 2 ? Response.json({ itemSummaries: [] }) : Response.json({ total: 3 })));
  const error = await failure(source().cuts!(search()));
  assert.deepEqual([error.reason, error.calls], ["reply", 2]);
  fakeEbay((_call, n) => (n === 3 ? Response.json({ total: 3, refinement: "odd" }) : n === 4 ? Response.json({ refinement: {} }) : Response.json({ total: 3 })));
  const words = await failure(source().cuts!(search()));
  assert.deepEqual([words.reason, words.calls], ["reply", 4]);
});

test("any listing is read by its item number, with the ids of eBay's categories it sits in", async () => {
  const calls = fakeEbay(() => Response.json(fullItem({ categoryId: "27386", categoryIdPath: "58058|175673|27386" })));
  const { item: read, calls: used } = await source().item!("110000000001");
  assert.equal(used, 1);
  const asked = calls.filter((call) => call.url !== tokenUrl);
  assert.deepEqual(asked.map((call) => call.url), ["https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=110000000001"]);
  assert.equal(asked[0].headers.get("X-EBAY-C-MARKETPLACE-ID"), "EBAY_GB");
  assert.deepEqual(read.categoryIds, ["58058", "175673", "27386"]);
  assert.equal(read.options, null);
  assert.deepEqual([read.full.listing.id, read.full.listing.title, read.full.listing.price, read.full.listing.variations], ["110000000001", "Dell OptiPlex 7070 SFF number 1", 9500, false]);
  assert.equal(read.full.returns?.accepted, true);
  assert.equal(legacyUrl(apiHost, "123"), "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=123");
});

test("a listing with options is read through its item group, at its cheapest option in stock", async () => {
  const group = { items: [option(1, [["Storage Capacity", "1 TB"]], "15.00", "OUT_OF_STOCK"), option(2, [["Storage Capacity", "4 TB"]], "48.00"), option(3, [["Storage Capacity", "2 TB"]], "20.00")].map((entry) => ({ ...entry, legacyItemId: "226543210987", categoryIdPath: "58058|175669|56083" })) };
  const calls = fakeEbay((_call, n) => (n === 1 ? Response.json({ errors: [{ errorId: 11006, message: "The legacy Id is invalid." }] }, { status: 400 }) : Response.json(group)));
  const { item: read, calls: used } = await source().item!("226543210987");
  assert.equal(used, 2);
  assert.deepEqual(calls.filter((call) => call.url !== tokenUrl).map((call) => call.url), [
    "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=226543210987",
    "https://api.ebay.com/buy/browse/v1/item/get_items_by_item_group?item_group_id=226543210987",
  ]);
  assert.deepEqual([read.full.listing.id, read.full.listing.url, read.full.listing.price, read.full.listing.variations, read.full.listing.groupId], ["226543210987", "https://www.ebay.co.uk/itm/226543210987", 2000, true, "226543210987"]);
  assert.deepEqual(read.categoryIds, ["58058", "175669", "56083"]);
  assert.deepEqual(read.options?.map((entry) => [entry.price, entry.inStock]), [[1500, false], [4800, true], [2000, true]]);
  fakeEbay((_call, n) => (n === 1 ? Response.json({ errors: [{ errorId: 11006 }] }, { status: 400 }) : Response.json({ items: [option(1, [["Size", "1 TB"]], "15.00", "OUT_OF_STOCK")].map((entry) => ({ ...entry, legacyItemId: "226543210987" })) })));
  assert.equal((await source().item!("226543210987")).item.full.listing.price, 1500);
});

test("a listing read by number that's gone, refused, unreadable or not a number says which, counting its calls", async () => {
  fakeEbay(() => new Response("", { status: 404 }));
  assert.deepEqual(await failure(source().item!("110000000001")).then((error) => [error.reason, error.calls]), ["gone", 1]);
  fakeEbay(() => Response.json({ errors: [{ errorId: 11003 }] }, { status: 400 }));
  assert.deepEqual(await failure(source().item!("110000000001")).then((error) => [error.reason, error.calls]), ["gone", 1]);
  fakeEbay(() => Response.json({ errors: [{ errorId: 12345 }] }, { status: 400 }));
  const refused = await failure(source().item!("110000000001"));
  assert.deepEqual([refused.reason, refused.message], ["request", "eBay refused the search (eBay error 12345)"]);
  fakeEbay(() => Response.json({ title: "no number" }));
  assert.equal((await failure(source().item!("110000000001"))).reason, "reply");
  fakeEbay((_call, n) => (n === 1 ? Response.json({ errors: [{ errorId: 11006 }] }, { status: 400 }) : new Response("", { status: 404 })));
  assert.deepEqual(await failure(source().item!("110000000001")).then((error) => [error.reason, error.calls]), ["gone", 2]);
  fakeEbay((_call, n) => (n === 1 ? Response.json({ errors: [{ errorId: 11006 }] }, { status: 400 }) : Response.json({ items: [] })));
  assert.equal((await failure(source().item!("110000000001"))).reason, "reply");
  const calls = fakeEbay(() => Response.json(fullItem()));
  for (const odd of ["", "12a", "1".repeat(21), "../1", "1 2"]) assert.equal((await failure(source().item!(odd))).reason, "request", odd);
  assert.equal(calls.length, 0);
});

test("a listing's category ids come from eBay's path, or its leaf alone, and nothing odd gets through", () => {
  assert.deepEqual(categoryIdsOf({ categoryIdPath: "58058|175673|27386", categoryId: "27386" }), ["58058", "175673", "27386"]);
  assert.deepEqual(categoryIdsOf({ categoryId: "27386" }), ["27386"]);
  assert.deepEqual(categoryIdsOf({ categoryIdPath: "58058|abc|27386|12345678901" }), ["58058", "27386"]);
  assert.deepEqual(categoryIdsOf({ categoryIdPath: Array.from({ length: 15 }, (_, n) => String(n + 1)).join("|") }).length, 10);
  for (const odd of [null, "58058", [], {}, { categoryId: 27386 }, { categoryIdPath: 5 }]) assert.deepEqual(categoryIdsOf(odd), [], JSON.stringify(odd));
});
