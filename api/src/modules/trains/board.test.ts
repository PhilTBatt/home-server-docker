import assert from "node:assert/strict";
import { test } from "node:test";
import { boardMs, boardRows, fetchBoard, readBoard, safeBoardUrl, type TrainSettings } from "./board.js";

const settings: TrainSettings = { key: "test-rail-key", from: "AAA", to: "BBB", boardUrl: "https://api1.raildata.org.uk/test-board" };

const sample = {
  generatedAt: "2026-11-22T07:50:12+00:00",
  locationName: "Alpha",
  crs: "AAA",
  filterLocationName: "Beta",
  filtercrs: "BBB",
  nrccMessages: [{ Value: "Disruption between <a href=\"x\">Alpha &amp; Gamma</a>." }],
  trainServices: [
    { std: "08:14", etd: "On time", platform: "16", operator: "Northern", isCancelled: false, destination: [{ locationName: "Beta", crs: "BBB" }] },
    { std: "08:44", etd: "08:52", platform: null, isCancelled: false, delayReason: "This train has been delayed by a fault", destination: [{ locationName: "Delta", crs: "DDD" }] },
    { std: "09:14", etd: "Cancelled", isCancelled: true, cancelReason: "This train has been cancelled because of a shortage of staff", destination: { location: [{ locationName: "Beta" }] } },
    { std: "09:44", etd: "Delayed", platform: "3" },
  ],
  busServices: [{ std: "09:20", etd: "On time" }],
};

test("a board gives the station names, each train's times, platform, whether it's cancelled and why, and the board's messages as plain text", () => {
  assert.deepEqual(readBoard(sample, settings), {
    from: "Alpha",
    to: "Beta",
    departures: [
      { due: "08:14", expected: "On time", platform: "16", cancelled: false, reason: null, destination: "Beta" },
      { due: "08:44", expected: "08:52", platform: null, cancelled: false, reason: "This train has been delayed by a fault", destination: "Delta" },
      { due: "09:14", expected: "Cancelled", platform: null, cancelled: true, reason: "This train has been cancelled because of a shortage of staff", destination: "Beta" },
      { due: "09:44", expected: "Delayed", platform: "3", cancelled: false, reason: null, destination: null },
    ],
    buses: 1,
    messages: ["Disruption between Alpha & Gamma."],
  });
});

test("a board with no trains, trains in a service list, or names missing still reads, using the station codes", () => {
  assert.deepEqual(readBoard({ crs: "AAA", trainServices: null }, settings), { from: "AAA", to: "BBB", departures: [], buses: 0, messages: [] });
  assert.deepEqual(readBoard({ generatedAt: "2026-11-22T07:50:12+00:00" }, settings).departures, []);
  assert.deepEqual(readBoard({ crs: "AAA", trainServices: { service: [{ std: "10:00", etd: "On time" }] }, nrccMessages: { message: ["Plain one"] } }, settings), { from: "AAA", to: "BBB", departures: [{ due: "10:00", expected: "On time", platform: null, cancelled: false, reason: null, destination: null }], buses: 0, messages: ["Plain one"] });
});

test("odd entries are left out, at most five trains and three messages are kept, and long or odd text is cut down", () => {
  const many = Array.from({ length: 8 }, (_unused, index) => ({ std: `1${index}:00`, etd: "On time" }));
  const read = readBoard({ crs: "AAA", trainServices: [null, 7, { etd: "On time" }, { std: "x", etd: 5 }, ...many], nrccMessages: [{ value: "one" }, "two", { Value: 3 }, "three", "four"] }, settings);
  assert.deepEqual(read.departures.map((departure) => departure.due), ["10:00", "11:00", "12:00", "13:00", "14:00"]);
  assert.equal(boardRows, 5);
  assert.deepEqual(read.messages, ["one", "two", "three"]);
  assert.equal(readBoard({ crs: "AAA", locationName: `A\u0000${"b".repeat(300)}` }, settings).from, `A ${"b".repeat(118)}`);
});

test("a reply that isn't a board is an error", () => {
  for (const body of [null, "board", [], 5, {}, { fault: { faultstring: "Unable to route the message" } }, { crs: "BBB", trainServices: [] }]) assert.throws(() => readBoard(body, settings), { message: "the reply wasn't a departure board" }, JSON.stringify(body));
  assert.throws(() => readBoard({ crs: "AAA", trainServices: "lots" }, settings), { message: "the reply's trains weren't a list" });
  assert.deepEqual(readBoard({ crs: "AAA", areServicesAvailable: false, nrccMessages: [{ Value: "No trains run today because of a strike." }], busServices: [{}, {}] }, settings), { from: "AAA", to: "BBB", departures: [], buses: 2, messages: ["No trains run today because of a strike."] }, "a board with no services still gives its messages and buses");
});

test("a train cancelled where it's going is cancelled, and the board's text loses its HTML and common entities", () => {
  const read = readBoard({ crs: "AAA", trainServices: [{ std: "08:14", etd: "On time", isCancelled: false, filterLocationCancelled: true, cancelReason: "a fault" }, { std: "08:44", etd: "On time", cancelReason: "cancelled further on" }], nrccMessages: [{ Value: "Trains &quot;may&quot; be delayed&nbsp;&lt;today&gt; &amp; it&#39;s busy &ndash; &#8217;&#x2019;&pound;5 &bogus; &amp;quot;" }] }, settings);
  assert.deepEqual(read.departures.map((departure) => [departure.cancelled, departure.reason]), [[true, "a fault"], [false, "cancelled further on"]], "a reason the board gives for a train still running here is kept");
  assert.deepEqual(read.messages, ['Trains "may" be delayed <today> & it\'s busy \u2013 \u2019\u2019\u00a35 &bogus; &quot;']);
});

test("the board is asked for the next five trains from one station to the other, with the key in its header and no redirects", async () => {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => (asked.push({ url, init }), new Response(JSON.stringify(sample), { status: 200 }))) as typeof fetch;
  const board = await fetchBoard(settings, undefined, fetcher);
  assert.equal(board.departures.length, 4);
  assert.equal(asked[0].url, "https://api1.raildata.org.uk/test-board/AAA?numRows=5&filterCrs=BBB&filterType=to");
  assert.deepEqual([asked[0].init?.headers, asked[0].init?.redirect], [{ "x-apikey": "test-rail-key", accept: "application/json" }, "error"]);
  assert.equal(boardMs, 8_000);
});

test("the board can be asked for more rows, and keeps that many", async () => {
  const many = { crs: "AAA", trainServices: Array.from({ length: 12 }, (_unused, index) => ({ std: `07:${String(index).padStart(2, "0")}`, etd: "On time" })) };
  const asked: string[] = [];
  const fetcher = (async (url: string) => (asked.push(url), new Response(JSON.stringify(many), { status: 200 }))) as typeof fetch;
  const board = await fetchBoard(settings, undefined, fetcher, boardMs, 10);
  assert.equal(asked[0], "https://api1.raildata.org.uk/test-board/AAA?numRows=10&filterCrs=BBB&filterType=to");
  assert.equal(board.departures.length, 10);
  assert.equal(readBoard(many, settings).departures.length, 5);
});

test("a refused key, another status, a reply that isn't JSON, no connection or no answer in time are each said plainly, never with the key", async () => {
  const replying = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;
  await assert.rejects(fetchBoard(settings, undefined, replying(401, "test-rail-key is wrong")), { message: "the board refused the key, or the address isn't the product the key is for (401)" });
  await assert.rejects(fetchBoard(settings, undefined, replying(403, "")), { message: "the board refused the key, or the address isn't the product the key is for (403)" });
  const redirected = (async () => {
    throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") });
  }) as unknown as typeof fetch;
  await assert.rejects(fetchBoard(settings, undefined, redirected), { message: "the board's address redirected somewhere else, so check TRAINS_BOARD_URL" });
  await assert.rejects(fetchBoard(settings, undefined, replying(500, "")), { message: "the board replied 500" });
  await assert.rejects(fetchBoard(settings, undefined, replying(404, "")), { message: "the board replied 404, so check TRAINS_BOARD_URL ends just before the station code" });
  const stalling = (async () => ({ ok: true, status: 200, json: () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })) })) as unknown as typeof fetch;
  await assert.rejects(fetchBoard(settings, undefined, stalling, 30), { message: "the board couldn't be reached (no answer within 0.03 seconds)" }, "a reply that stops part way is a timeout, not bad JSON");
  await assert.rejects(fetchBoard(settings, undefined, replying(200, "<html>")), { message: "the board's reply wasn't JSON" });
  const failing = (async () => {
    throw new Error("getaddrinfo ENOTFOUND test-rail-key");
  }) as unknown as typeof fetch;
  await assert.rejects(fetchBoard(settings, undefined, failing), { message: "the board couldn't be reached (no connection)" });
  const silent = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as unknown as typeof fetch;
  await assert.rejects(fetchBoard(settings, undefined, silent, 30), { message: "the board couldn't be reached (no answer within 0.03 seconds)" });
});

test("only an https address on raildata.org.uk, with nothing after a ? or #, is a board address, with any trailing slashes dropped", () => {
  assert.equal(safeBoardUrl("https://api1.raildata.org.uk/a/b/"), "https://api1.raildata.org.uk/a/b");
  assert.equal(safeBoardUrl("https://raildata.org.uk/a"), "https://raildata.org.uk/a");
  for (const url of ["http://raildata.org.uk/a", "https://evilraildata.org.uk/a", "https://raildata.org.uk.evil.com/a", "https://a@raildata.org.uk/a", "https://raildata.org.uk/a?b", "https://raildata.org.uk/a#b", "https://raildata.org.uk/a b", "https://raildata.org.uk/a/{crs}", `https://raildata.org.uk/${"a".repeat(300)}`, ""]) assert.equal(safeBoardUrl(url), null, url);
});
