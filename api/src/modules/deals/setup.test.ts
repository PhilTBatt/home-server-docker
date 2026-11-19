import assert from "node:assert/strict";
import { after, afterEach, mock, test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config.js";
import { dealWatcherFor } from "./setup.js";

const made: string[] = [];

after(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  mock.restoreAll();
});

const clientId = "Test-App-PRD-0123456789";
const clientSecret = "PRD-not-a-real-secret";
const topic = "not-a-real-topic";
const accessToken = "not-a-real-access-token";

function settings(overrides: Partial<Config["deals"]> = {}): Pick<Config, "deals" | "ntfyTopic"> {
  return { ntfyTopic: topic, deals: { seen: "memory", ebayEnvironment: "production", ebayClientId: clientId, ebayClientSecret: clientSecret, ...overrides } };
}

async function folder(searches: unknown[] | null) {
  const dir = await mkdtemp(join(tmpdir(), "deals-setup-"));
  made.push(dir);
  if (searches !== null) await writeFile(join(dir, "searches.json"), JSON.stringify({ searches }));
  return dir;
}

function item(n: number) {
  const number = String(110_000_000_000 + n);
  return {
    itemId: `v1|${number}|0`,
    legacyItemId: number,
    title: `Dell OptiPlex 7070 SFF number ${n}`,
    price: { value: `${90 + n}.00`, currency: "GBP" },
    condition: "Used",
    conditionId: "3000",
    buyingOptions: ["FIXED_PRICE"],
    itemLocation: { country: "GB" },
    itemCreationDate: "2026-11-01T09:00:00.000Z",
    itemWebUrl: "https://evil.example/not-used",
    seller: { username: "seller-name-here", feedbackPercentage: "99.4", feedbackScore: 1234 },
  };
}

type Call = { url: string; method: string; headers: Headers; body: string };

function fakeInternet(items: () => unknown[]) {
  const calls: Call[] = [];
  mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : "" };
    calls.push(call);
    const url = new URL(call.url);
    if (url.pathname === "/identity/v1/oauth2/token") return Response.json({ access_token: accessToken, expires_in: 7200, token_type: "Application Access Token" });
    if (url.pathname === "/buy/browse/v1/item_summary/search") return Response.json({ total: items().length, itemSummaries: items() });
    if (url.host === "ntfy.sh") return new Response(null, { status: 200 });
    return new Response(null, { status: 404 });
  });
  return calls;
}

const optiplex = { id: "optiplex", name: "OptiPlex", switch: "on", query: "optiplex 7070 sff", maxPrice: 150 };
const noon = new Date("2026-11-18T12:00:00.000Z");
const later = new Date("2026-11-18T12:30:00.000Z");

test("built from the settings, the watcher reads its list, asks eBay and alerts through ntfy", async () => {
  const dir = await folder([optiplex]);
  let found = [item(1), item(2)];
  const calls = fakeInternet(() => found);
  const watcher = dealWatcherFor(settings(), dir);

  assert.deepEqual(await watcher.run(noon), { ran: true, checked: 1, alerts: 0, failed: 0, unsent: false });
  found = [item(1), item(2), item(3)];
  assert.deepEqual(await watcher.run(later), { ran: true, checked: 1, alerts: 1, failed: 0, unsent: false });

  assert.deepEqual(
    calls.map((call) => `${call.method} ${new URL(call.url).origin}${new URL(call.url).pathname}`),
    [
      "POST https://api.ebay.com/identity/v1/oauth2/token",
      "GET https://api.ebay.com/buy/browse/v1/item_summary/search",
      `POST https://ntfy.sh/${topic}`,
      "GET https://api.ebay.com/buy/browse/v1/item_summary/search",
      `POST https://ntfy.sh/${topic}`,
    ],
  );
  const [watching, deal] = calls.filter((call) => call.url.startsWith("https://ntfy.sh/"));
  assert.equal(watching.headers.get("Title"), "Deal watcher: now watching");
  assert.equal(deal.headers.get("Title"), "Deal: OptiPlex");
  assert.equal(deal.headers.get("Click"), "https://www.ebay.co.uk/itm/110000000003");
  assert.ok(deal.body.startsWith("Dell OptiPlex 7070 SFF number 3\n£93.00, postage not shown\n"));
  assert.equal(new URL(calls[1].url).searchParams.get("filter"), "price:[..150.00],priceCurrency:GBP,buyingOptions:{FIXED_PRICE},itemLocationCountry:GB");
});

test("the keys go only to eBay, the token only to eBay's search, and the ntfy topic only to ntfy", async () => {
  const dir = await folder([optiplex]);
  let found = [item(1)];
  const calls = fakeInternet(() => found);
  const watcher = dealWatcherFor(settings(), dir);
  await watcher.run(noon);
  found = [item(1), item(2)];
  await watcher.run(later);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  for (const call of calls) {
    const everything = `${call.url} ${call.body} ${[...call.headers].flat().join(" ")}`;
    const host = new URL(call.url).host;
    const path = new URL(call.url).pathname;
    assert.equal(everything.includes(basic), path === "/identity/v1/oauth2/token");
    assert.equal(everything.includes(accessToken), path === "/buy/browse/v1/item_summary/search");
    assert.equal(everything.includes(topic), host === "ntfy.sh");
    assert.ok(!everything.includes(clientSecret));
    assert.ok(!everything.includes("seller-name-here"));
    if (host === "ntfy.sh") assert.equal(call.headers.get("Authorization"), null);
  }
  assert.equal(calls.length, 5);
});

test("nothing is ever sent anywhere but eBay's two addresses and ntfy, and nothing is ever bought or bid on", async () => {
  const dir = await folder([optiplex, { id: "auctions", name: "Auctions", switch: "on", query: "optiplex", buying: ["auction"], dropPercent: 10 }]);
  let found = [item(1)];
  const calls = fakeInternet(() => found);
  const watcher = dealWatcherFor(settings({ seen: "disk" }), dir);
  for (let round = 0; round < 6; round++) {
    found = Array.from({ length: round * 3 + 1 }, (_, i) => item(i + 1));
    await watcher.run(new Date(noon.getTime() + round * 60 * 60_000), round % 2 === 1);
  }
  const kinds = new Set(calls.map((call) => `${call.method} ${new URL(call.url).origin}${new URL(call.url).pathname}`));
  assert.deepEqual([...kinds].sort(), ["GET https://api.ebay.com/buy/browse/v1/item_summary/search", "POST https://api.ebay.com/identity/v1/oauth2/token", `POST https://ntfy.sh/${topic}`]);
  for (const call of calls) {
    for (const word of ["order", "checkout", "offer", "bid", "purchase", "cart", "watchlist"]) {
      assert.ok(!new URL(call.url).pathname.toLowerCase().includes(word), `${word} in ${call.url}`);
    }
  }
});

test("with DEALS_SEEN=memory the folder holds only the list and a state file with nothing from eBay in it", async () => {
  const dir = await folder([optiplex]);
  let found = [item(1), item(2)];
  fakeInternet(() => found);
  const watcher = dealWatcherFor(settings({ seen: "memory" }), dir);
  await watcher.run(noon);
  found = [item(1), item(2), item(3)];
  await watcher.run(later);
  assert.deepEqual((await readdir(dir)).sort(), ["searches.json", "state.json"]);
  const state = await readFile(join(dir, "state.json"), "utf8");
  for (const fragment of ["1100000000", "v1|", "Dell", "seller", "ebay.co.uk", "93", "seen"]) assert.ok(!state.includes(fragment), `${fragment} in ${state}`);
  assert.deepEqual(Object.keys(JSON.parse(state)).sort(), ["alertsToday", "counters", "searches"]);
  assert.deepEqual(Object.keys(JSON.parse(state).alertsToday), Object.keys(JSON.parse(state).searches));
});

test("with DEALS_SEEN=disk the state file also holds the ids of listings already seen, and still no titles or seller", async () => {
  const dir = await folder([optiplex]);
  fakeInternet(() => [item(1), item(2)]);
  await dealWatcherFor(settings({ seen: "disk" }), dir).run(noon);
  const state = await readFile(join(dir, "state.json"), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(state).searches.optiplex.seen).sort(), ["110000000001", "110000000002"]);
  for (const fragment of ["Dell", "seller", "ebay.co.uk", "99.4", "1234"]) assert.ok(!state.includes(fragment), fragment);
});

test("a second watcher on the same folder carries on where the first stopped", async () => {
  const dir = await folder([optiplex]);
  let found = [item(1)];
  const calls = fakeInternet(() => found);
  await dealWatcherFor(settings({ seen: "disk" }), dir).run(noon);
  found = [item(1), item(2)];
  await dealWatcherFor(settings({ seen: "disk" }), dir).run(later);
  const titles = calls.filter((call) => call.url.startsWith("https://ntfy.sh/")).map((call) => call.headers.get("Title"));
  assert.deepEqual(titles, ["Deal watcher: now watching", "Deal: OptiPlex"]);
});

test("EBAY_ENVIRONMENT=sandbox talks to the sandbox and labels its messages", async () => {
  const dir = await folder([optiplex]);
  let found = [item(1)];
  const calls = fakeInternet(() => found);
  const watcher = dealWatcherFor(settings({ ebayEnvironment: "sandbox" }), dir);
  await watcher.run(noon);
  found = [item(1), item(2)];
  await watcher.run(later);
  const ebay = calls.filter((call) => !call.url.startsWith("https://ntfy.sh/"));
  for (const call of ebay) assert.equal(new URL(call.url).host, "api.sandbox.ebay.com");
  const titles = calls.filter((call) => call.url.startsWith("https://ntfy.sh/")).map((call) => call.headers.get("Title"));
  assert.deepEqual(titles, ["Deal watcher: now watching (sandbox)", "Sandbox deal: OptiPlex"]);
});

test("with no searches.json nothing is asked of eBay and the problem says where the list belongs", async () => {
  const dir = await folder(null);
  const calls = fakeInternet(() => []);
  const watcher = dealWatcherFor(settings(), dir);
  await watcher.run(noon);
  assert.equal(calls.length, 0);
  assert.deepEqual(watcher.problems(), [{ code: "deals-list", message: "The deal watcher's search list has a problem: there's no searches.json in the deals folder." }]);
  assert.deepEqual(await readdir(dir), []);
});

test("a search for a source this build doesn't have is refused when the list is read", async () => {
  const dir = await folder([{ ...optiplex, source: "gumtree" }]);
  const calls = fakeInternet(() => []);
  const watcher = dealWatcherFor(settings(), dir);
  await watcher.run(noon);
  assert.equal(calls.length, 0);
  assert.equal(watcher.problems()[0].message, "The deal watcher's search list has a problem: search 1 (optiplex): source must be one of: ebay.");
});

test("with every search switched off, eBay is never contacted, not even for a token", async () => {
  const dir = await folder([{ ...optiplex, switch: "off" }]);
  const calls = fakeInternet(() => [item(1)]);
  const watcher = dealWatcherFor(settings(), dir);
  await watcher.run(noon);
  await watcher.run(later, true);
  assert.equal(calls.length, 0);
});

test("refused keys show up as a problem without the keys in it", async () => {
  const dir = await folder([optiplex]);
  mock.method(globalThis, "fetch", async () => Response.json({ error: "invalid_client" }, { status: 401 }));
  const watcher = dealWatcherFor(settings(), dir);
  await watcher.run(noon);
  const text = JSON.stringify([watcher.problems(), watcher.status(), watcher.searches()]);
  assert.ok(text.includes("eBay refused the keys"));
  assert.ok(!text.includes(clientId) && !text.includes(clientSecret));
});