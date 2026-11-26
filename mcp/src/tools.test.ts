import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import type { ApiGet, ApiPost } from "./api.js";
import { buildServer } from "./tools.js";

type Reply = {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

type ToolInfo = {
  name: string;
  description?: string;
  inputSchema: { type: string; properties?: Record<string, { type?: string; pattern?: string }>; required?: string[] };
};

type CallResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

const hash = "0123456789abcdef0123456789abcdef01234567";

const readPaths: Record<string, string> = {
  get_status: "/system/status",
  get_alerts: "/system/alerts",
  get_features: "/system/features",
  get_downloads: "/media/downloads",
  get_library: "/media/library",
  get_wifi_reconnects: "/system/wifi-reconnects",
  get_backup: "/system/backup",
  get_expiries: "/expiry",
  get_doctor: "/system/doctor",
  get_deal_status: "/deals/status",
  get_deal_searches: "/deals/searches",
};

const matchesTool = "get_deal_matches";
const listingTool = "get_deal_listing";
const tuningTools = ["get_deal_search_cuts", "lookup_deal_categories", "lookup_deal_details", "get_deal_hidden", "explain_deal_listing"];

const actions: Record<string, { args: Record<string, unknown>; call: string }> = {
  scan_library: { args: {}, call: "POST /media/library/scan" },
  stop_download: { args: { hash }, call: `POST /media/downloads/${hash}/stop` },
  start_download: { args: { hash }, call: `POST /media/downloads/${hash}/start` },
};

function fakeApi(data: unknown = { ok: true, problems: [] }) {
  const calls: string[] = [];
  const get: ApiGet = async (path) => {
    calls.push(`GET ${path}`);
    return data;
  };
  const post: ApiPost = async (path) => {
    calls.push(`POST ${path}`);
    return data;
  };
  return { get, post, calls };
}

async function connect(api: { get: ApiGet; post: ApiPost; slowGet?: ApiGet }, actions = true) {
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (reply: Reply) => void>();
  client.onmessage = (message) => {
    const reply = message as Reply;
    waiting.get(reply.id)?.(reply);
  };
  await buildServer(api.get, api.post, actions, api.slowGet).connect(serverSide);
  await client.start();

  let nextId = 1;
  const request = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    return new Promise<Reply>((resolve) => {
      waiting.set(id, resolve);
      void client.send({ jsonrpc: "2.0", id, method, params });
    });
  };

  const initialized = await request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const listTools = async () => ((await request("tools/list")).result as { tools: ToolInfo[] }).tools;
  const callTool = (name: string, args: Record<string, unknown> = {}) => request("tools/call", { name, arguments: args });
  return { initialized, listTools, callTool };
}

function refused(reply: Reply) {
  return reply.error !== undefined || (reply.result as CallResult).isError === true;
}

test("names itself home-hub", async () => {
  const { initialized } = await connect(fakeApi());
  const result = initialized.result as { serverInfo: { name: string } };
  assert.equal(result.serverInfo.name, "home-hub");
});

test("offers the eleven read tools, the two listing tools and the five tuning tools, then scan, stop and start, in order", async () => {
  const { listTools } = await connect(fakeApi());
  const names = (await listTools()).map((tool) => tool.name);
  assert.deepEqual(names, [...Object.keys(readPaths), matchesTool, listingTool, ...tuningTools, ...Object.keys(actions)]);
});

test("every tool has a description for Claude to read", async () => {
  const { listTools } = await connect(fakeApi());
  for (const tool of await listTools()) {
    assert.ok((tool.description ?? "").length > 20, `${tool.name} needs a description`);
  }
});

test("the read tools and scan_library take no input", async () => {
  const { listTools } = await connect(fakeApi());
  const noInput = [...Object.keys(readPaths), "scan_library"];
  for (const tool of (await listTools()).filter((t) => noInput.includes(t.name))) {
    assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}), [], `${tool.name} takes input`);
  }
});

test("stop_download and start_download take one required hash, described for Claude", async () => {
  const { listTools } = await connect(fakeApi());
  for (const tool of (await listTools()).filter((t) => t.name.endsWith("_download"))) {
    assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}), ["hash"]);
    assert.deepEqual(tool.inputSchema.required, ["hash"]);
    assert.equal(tool.inputSchema.properties?.hash.type, "string");
    assert.equal(tool.inputSchema.properties?.hash.pattern, "^[0-9a-f]{40}$");
  }
});

test("tool names use only lowercase words and underscores, so permission rules can name them", async () => {
  const { listTools } = await connect(fakeApi());
  for (const tool of await listTools()) {
    assert.match(tool.name, /^[a-z]+(_[a-z]+)*$/);
  }
});

for (const [name, path] of Object.entries(readPaths)) {
  test(`${name} only reads ${path}`, async () => {
    const fake = fakeApi();
    const { callTool } = await connect(fake);
    const reply = await callTool(name);
    assert.equal(reply.error, undefined);
    assert.deepEqual(fake.calls, [`GET ${path}`]);
  });
}

for (const [name, { args, call }] of Object.entries(actions)) {
  test(`${name} sends ${call} and nothing else`, async () => {
    const fake = fakeApi({ status: "ok" });
    const { callTool } = await connect(fake);
    const reply = await callTool(name, args);
    assert.equal(reply.error, undefined);
    assert.equal((reply.result as CallResult).isError, undefined);
    assert.deepEqual(fake.calls, [call]);
  });
}

test("returns the API's answer as JSON text", async () => {
  const downloads = [{ name: "Some.Show.S01E01", percent: 42, speedKBps: 900, etaSeconds: 120, state: "downloading", hash }];
  const { callTool } = await connect(fakeApi(downloads));
  const result = (await callTool("get_downloads")).result as CallResult;
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(downloads) }]);
  assert.deepEqual(JSON.parse(result.content[0].text), downloads);
});

test("an action returns the API's answer too", async () => {
  const { callTool } = await connect(fakeApi({ status: "stopped" }));
  const result = (await callTool("stop_download", { hash })).result as CallResult;
  assert.deepEqual(result.content, [{ type: "text", text: '{"status":"stopped"}' }]);
});

for (const [label, args] of Object.entries({
  "no hash": {},
  "a short hash": { hash: "abc123" },
  "a hash one character too long": { hash: `${hash}0` },
  "an uppercase hash": { hash: hash.toUpperCase() },
  "a path instead of a hash": { hash: "../../library/scan/aaaaaaaaaaaaaaaaaaaaaaa" },
  "a number": { hash: 12345 },
})) {
  test(`stop_download refuses ${label} without calling the API`, async () => {
    const fake = fakeApi();
    const { callTool } = await connect(fake);
    assert.ok(refused(await callTool("stop_download", args)));
    assert.deepEqual(fake.calls, []);
  });
}

test("start_download refuses a bad hash without calling the API", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  assert.ok(refused(await callTool("start_download", { hash: "all" })));
  assert.deepEqual(fake.calls, []);
});

test("asks the API again on every call rather than reusing an old answer", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  await callTool("get_status");
  await callTool("get_status");
  assert.deepEqual(fake.calls, ["GET /system/status", "GET /system/status"]);
});

test("an API failure comes back as a tool error with its message", async () => {
  const failing = async (): Promise<unknown> => {
    throw new Error("Couldn't reach the API");
  };
  const { callTool } = await connect({ get: failing, post: failing });
  for (const [name, args] of [["get_status", {}], ["stop_download", { hash }]] as const) {
    const result = (await callTool(name, args)).result as CallResult;
    assert.equal(result.isError, true);
    assert.deepEqual(result.content, [{ type: "text", text: "Couldn't reach the API" }]);
  }
});

test("keeps working after a failed call", async () => {
  let calls = 0;
  const flaky: ApiGet = async () => {
    calls++;
    if (calls === 1) throw new Error("The API didn't answer in time");
    return { status: "ok" };
  };
  const { callTool } = await connect({ get: flaky, post: fakeApi().post });
  assert.equal(((await callTool("get_status")).result as CallResult).isError, true);
  assert.equal(((await callTool("get_status")).result as CallResult).isError, undefined);
});

test("an unknown tool is refused without calling the API", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  assert.ok(refused(await callTool("delete_download", { hash })));
  assert.deepEqual(fake.calls, []);
});

test("read-only offers only the eleven read tools, the two listing tools and the five tuning tools, which all only read", async () => {
  const { listTools } = await connect(fakeApi(), false);
  const names = (await listTools()).map((tool) => tool.name);
  assert.deepEqual(names, [...Object.keys(readPaths), matchesTool, listingTool, ...tuningTools]);
});

for (const [name, { args }] of Object.entries(actions)) {
  test(`read-only refuses ${name} without calling the API`, async () => {
    const fake = fakeApi();
    const { callTool } = await connect(fake, false);
    assert.ok(refused(await callTool(name, args)));
    assert.deepEqual(fake.calls, []);
  });
}

test("read-only still answers the read tools", async () => {
  const fake = fakeApi({ movies: 0, series: 5, episodes: 46 });
  const { callTool } = await connect(fake, false);
  const result = (await callTool("get_library")).result as CallResult;
  assert.deepEqual(result.content, [{ type: "text", text: '{"movies":0,"series":5,"episodes":46}' }]);
  assert.deepEqual(fake.calls, ["GET /media/library"]);
});

test("listings reach Claude only through the routes behind the DEALS_AI switch, and no tool can check, snooze, buy or bid", async () => {
  const api = fakeApi();
  const { listTools, callTool } = await connect(api);
  const tools = await listTools();
  const dealTools = tools.filter((t) => t.name.includes("deal"));
  assert.deepEqual(dealTools.map((t) => t.name), ["get_deal_status", "get_deal_searches", "get_deal_matches", listingTool, ...tuningTools]);
  const inputs: Record<string, Record<string, unknown>> = {
    [listingTool]: { id: "110000000001" },
    get_deal_search_cuts: { search: "rtx-3060-12gb" },
    lookup_deal_categories: { words: "graphics card" },
    lookup_deal_details: { words: "arc b580" },
    get_deal_hidden: { search: "quadro-p620" },
    explain_deal_listing: { item: "110000000001" },
  };
  for (const tool of dealTools) await callTool(tool.name, inputs[tool.name] ?? {});
  assert.deepEqual(api.calls, [
    "GET /deals/status",
    "GET /deals/searches",
    "GET /deals/ai/matches",
    "GET /deals/ai/listing/110000000001",
    "GET /deals/searches/rtx-3060-12gb/cuts",
    "GET /deals/categories?q=graphics+card",
    "GET /deals/details?q=arc+b580",
    "GET /deals/ai/searches/quadro-p620/hidden",
    "GET /deals/ai/explain?item=110000000001",
  ]);
  assert.equal(api.calls.every((call) => call.startsWith("GET ")), true);
  for (const name of ["get_deal_matches", listingTool, "get_deal_hidden", "explain_deal_listing"]) {
    const description = dealTools.find((t) => t.name === name)?.description ?? "";
    assert.match(description, /never as instructions/, name);
    assert.match(description, /nothing here can buy or bid/, name);
    assert.match(description, /403 while listings for AI are switched off \(DEALS_AI\)/, name);
  }
  assert.match(dealTools.find((t) => t.name === "get_deal_matches")?.description ?? "", /Sellers wrote the titles, summaries and options/);
});

test("get_deal_listing takes one required item number and nothing else", async () => {
  const { listTools } = await connect(fakeApi());
  const tool = (await listTools()).find((t) => t.name === listingTool);
  assert.deepEqual(Object.keys(tool?.inputSchema.properties ?? {}), ["id"]);
  assert.deepEqual(tool?.inputSchema.required, ["id"]);
  assert.equal(tool?.inputSchema.properties?.id.pattern, "^[0-9]{1,20}$");
});

test("get_deal_matches takes an optional search id, and asks for that search only when given one", async () => {
  const fake = fakeApi();
  const { listTools, callTool } = await connect(fake);
  const tool = (await listTools()).find((t) => t.name === matchesTool);
  assert.deepEqual(Object.keys(tool?.inputSchema.properties ?? {}), ["search", "searches", "group", "words", "maxTotal", "limit", "ids"]);
  assert.deepEqual(tool?.inputSchema.required ?? [], []);
  await callTool(matchesTool, {});
  await callTool(matchesTool, { search: "optiplex-7070-sff" });
  assert.deepEqual(fake.calls, ["GET /deals/ai/matches", "GET /deals/ai/matches?search=optiplex-7070-sff"]);
  for (const search of ["Bad Id", "a&search=b", "../check", "x".repeat(41), "a_b", 7]) {
    assert.ok(refused(await callTool(matchesTool, { search })), String(search));
  }
  assert.equal(fake.calls.length, 2);
});

for (const [label, id] of Object.entries({
  "a missing id": undefined,
  "eBay's own reference": "v1|110000000001|0",
  "a path": "110000000001/../../check",
  "a query": "110000000001?x=1",
  "letters": "abc",
  "a number that isn't text": 110000000001,
  "an id that's too long": "1".repeat(21),
  "an empty id": "",
  "an id with a space": "1100 0000",
})) {
  test(`get_deal_listing refuses ${label} without calling the API`, async () => {
    const fake = fakeApi();
    const { callTool } = await connect(fake);
    assert.ok(refused(await callTool(listingTool, id === undefined ? {} : { id })));
    assert.deepEqual(fake.calls, []);
  });
}

test("read-only can still read one listing, because it only reads", async () => {
  const fake = fakeApi({ note: "x" });
  const { callTool } = await connect(fake, false);
  const result = (await callTool(listingTool, { id: "110000000001" })).result as CallResult;
  assert.deepEqual(result.content, [{ type: "text", text: '{"note":"x"}' }]);
  assert.deepEqual(fake.calls, ["GET /deals/ai/listing/110000000001"]);
});

test("the deal tools say they fail while the watcher is switched off, so a 404 isn't mistaken for a fault", async () => {
  const { listTools } = await connect(fakeApi());
  for (const tool of (await listTools()).filter((t) => t.name.includes("deal"))) {
    assert.match(tool.description ?? "", /404 while the deal watcher is switched off/);
  }
});
test("get_deal_matches turns its filters into the route's query, with the price in pounds and pence", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  await callTool(matchesTool, { group: "ram", words: " ddr4 3200 ", maxTotal: 120, limit: 5 });
  await callTool(matchesTool, { searches: ["ddr4-2x16gb", "hukd-ddr4"], maxTotal: 99.5 });
  await callTool(matchesTool, { group: "power supply", words: "  " });
  await callTool(matchesTool, { ids: ["110000000001", "hukd-5000001"] });
  assert.deepEqual(fake.calls, [
    "GET /deals/ai/matches?group=ram&words=ddr4+3200&maxTotal=120.00&limit=5",
    "GET /deals/ai/matches?searches=ddr4-2x16gb%2Chukd-ddr4&maxTotal=99.50",
    "GET /deals/ai/matches?group=power+supply",
    "GET /deals/ai/matches?ids=110000000001%2Chukd-5000001",
  ]);
});

test("get_deal_matches refuses odd filters without calling the API", async () => {
  const fake = fakeApi();
  const { callTool } = await connect(fake);
  const odd: Record<string, unknown>[] = [
    { group: "memory" },
    { searches: [] },
    { searches: ["Bad Id"] },
    { searches: Array.from({ length: 21 }, (_, i) => `s${i}`) },
    { words: "ddr*" },
    { words: "a\nb" },
    { words: "x".repeat(101) },
    { maxTotal: 0 },
    { maxTotal: -1 },
    { maxTotal: 1.234 },
    { maxTotal: "120" },
    { limit: 0 },
    { limit: 51 },
    { limit: 2.5 },
    { ids: [] },
    { ids: ["v1|110000000001|0"] },
    { ids: ["hukd-"] },
    { ids: Array.from({ length: 21 }, (_, i) => String(i + 1)) },
  ];
  for (const input of odd) assert.ok(refused(await callTool(matchesTool, input)), JSON.stringify(input));
  assert.deepEqual(fake.calls, []);
});

test("the tools that wait on eBay lookups or read a listing use the slower client, and the rest the usual one", async () => {
  const quick = fakeApi();
  const slow = fakeApi();
  const { callTool } = await connect({ get: quick.get, post: quick.post, slowGet: slow.get });
  await callTool("get_deal_search_cuts", { search: "quadro-p620" });
  await callTool("lookup_deal_categories", { words: "graphics card" });
  await callTool("lookup_deal_details", { words: "quadro p620", categoryId: "27386" });
  await callTool("explain_deal_listing", { item: "https://www.ebay.co.uk/itm/110000000001?hash=x", search: "quadro-p620" });
  await callTool("get_deal_hidden", { search: "quadro-p620" });
  await callTool("get_deal_searches");
  assert.deepEqual(slow.calls, [
    "GET /deals/searches/quadro-p620/cuts",
    "GET /deals/categories?q=graphics+card",
    "GET /deals/details?q=quadro+p620&categoryId=27386",
    `GET /deals/ai/explain?item=${encodeURIComponent("https://www.ebay.co.uk/itm/110000000001?hash=x")}&search=quadro-p620`,
  ]);
  assert.deepEqual(quick.calls, ["GET /deals/ai/searches/quadro-p620/hidden", "GET /deals/searches"]);
});

test("the tuning tools refuse odd inputs without calling the API", async () => {
  const api = fakeApi();
  const { callTool } = await connect(api);
  const odd: [string, Record<string, unknown>][] = [
    ["get_deal_search_cuts", {}],
    ["get_deal_search_cuts", { search: "Bad Id" }],
    ["get_deal_search_cuts", { search: "../status" }],
    ["get_deal_hidden", { search: "x".repeat(41) }],
    ["lookup_deal_categories", { words: "" }],
    ["lookup_deal_categories", { words: "quadro*" }],
    ["lookup_deal_categories", { words: "a\nb" }],
    ["lookup_deal_categories", { words: "   " }],
    ["lookup_deal_details", { words: "x".repeat(101) }],
    ["lookup_deal_details", { words: "ram", categoryId: "27386a" }],
    ["lookup_deal_details", { words: "ram", categoryId: 27386 }],
    ["explain_deal_listing", {}],
    ["explain_deal_listing", { item: "12345" }],
    ["explain_deal_listing", { item: "see https://www.ebay.co.uk/itm/110000000001" }],
    ["explain_deal_listing", { item: `https://www.ebay.co.uk/itm/${"1".repeat(500)}` }],
    ["explain_deal_listing", { item: "110000000001", search: "Bad Id" }],
  ];
  for (const [name, args] of odd) assert.ok(refused(await callTool(name, args)), `${name} ${JSON.stringify(args)}`);
  assert.deepEqual(api.calls, []);
});

test("get_deal_searches says what the health notes and calls today mean", async () => {
  const { listTools } = await connect(fakeApi());
  const description = (await listTools()).find((tool) => tool.name === "get_deal_searches")?.description ?? "";
  for (const kind of ["incomplete", "mostlyHidden", "nothingFound", "noMatch", "callsToday"]) assert.match(description, new RegExp(kind));
  assert.match(description, /never includes the listings themselves/);
});

test("get_deal_search_cuts says what lastCheck is for and that eBay calls its totals just an indicator", async () => {
  const { listTools } = await connect(fakeApi());
  const description = (await listTools()).find((tool) => tool.name === "get_deal_search_cuts")?.description ?? "";
  assert.match(description, /lastCheck is eBay's count at the search's last check/);
  assert.match(description, /null when the search hasn't been checked with its current settings since the API started/);
  assert.match(description, /"just an indicator"/);
});

test("explain_deal_listing says how a listing with options, or with too many to read, is judged", async () => {
  const { listTools } = await connect(fakeApi());
  const description = (await listTools()).find((tool) => tool.name === "explain_deal_listing")?.description ?? "";
  assert.match(description, /names the option it was judged at/);
  assert.match(description, /more options than a check reads is judged at its cheapest option not marked out of stock/);
});
