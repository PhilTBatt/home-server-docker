import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { mock, test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import type { Board } from "./board.js";
import { createChangeFeed, type ChangeFeed } from "./changes.js";
import { trains } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true };
const settings = { key: "test-rail-key", from: "AAA", to: "BBB", boardUrl: "https://api1.raildata.org.uk/test-board" };
const board: Board = { from: "Alpha", to: "Beta", departures: [{ due: "08:14", expected: "On time", platform: "16", cancelled: false, reason: null, destination: "Beta" }], buses: 0, messages: [] };

function buildApp(features: Features, read: () => Promise<Board>) {
  const app = Fastify();
  app.register(trains, { prefix: "/trains", features, settings, board: read });
  return app;
}

test("train times give the board, at /trains", async () => {
  const app = buildApp(allOn, async () => board);
  const reply = await app.inject({ method: "GET", url: "/trains" });
  assert.deepEqual([reply.statusCode, reply.json()], [200, board]);
});

test("with them switched off, the board isn't asked", async () => {
  let asked = 0;
  const app = buildApp({ ...allOn, trains: false }, async () => (asked++, board));
  const reply = await app.inject({ method: "GET", url: "/trains" });
  assert.deepEqual([reply.statusCode, reply.json(), asked], [404, { error: "Train times are switched off" }, 0]);
});

test("a board that fails is a 502 saying why", async () => {
  const app = buildApp(allOn, async () => {
    throw new Error("the board refused the key (401)");
  });
  const reply = await app.inject({ method: "GET", url: "/trains" });
  assert.deepEqual([reply.statusCode, reply.json()], [502, { error: "Couldn't get the train times: the board refused the key (401)" }]);
  assert.equal(reply.body.includes("test-rail-key"), false);
});

test("without a board given, the route asks the real board with the hub's settings", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ crs: "AAA", locationName: "Alpha", filterLocationName: "Beta", trainServices: [] }), { status: 200 }));
  try {
    const app = Fastify();
    app.register(trains, { prefix: "/trains", features: allOn, settings });
    const reply = await app.inject({ method: "GET", url: "/trains" });
    assert.deepEqual([reply.statusCode, reply.json()], [200, { from: "Alpha", to: "Beta", departures: [], buses: 0, messages: [] }]);
    assert.equal(String(fetchMock.mock.calls[0].arguments[0]), "https://api1.raildata.org.uk/test-board/AAA?numRows=5&filterCrs=BBB&filterType=to");
  } finally {
    fetchMock.mock.restore();
  }
});

test("with a change station, the route asks both boards there and gives the journeys", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes("arrivals") ? { crs: "CCC", locationName: "Gamma", filterLocationName: "Alpha", trainServices: [] } : { crs: "CCC", filterLocationName: "Beta", trainServices: [] }), { status: 200 }));
  try {
    const app = Fastify();
    app.register(trains, { prefix: "/trains", features: allOn, settings: { ...settings, boardUrl: "https://api1.raildata.org.uk/test-board/GetDepartureBoard", journey: { at: "CCC", walk: 3, arrivalsKey: "test-arrivals-key", arrivalsUrl: "https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails", detailsUrl: "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails" } } });
    const reply = await app.inject({ method: "GET", url: "/trains" });
    assert.deepEqual([reply.statusCode, reply.json()], [200, { from: "Alpha", via: "Gamma", to: "Beta", walk: 3, journeys: [], messages: [] }]);
    assert.deepEqual(fetchMock.mock.calls.map((call) => String(call.arguments[0]).split("?")[0]).sort(), ["https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails/CCC", "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails/CCC"]);
  } finally {
    fetchMock.mock.restore();
  }
});

function withChanges(features: Features, changes?: ChangeFeed) {
  const app = Fastify();
  app.register(trains, { prefix: "/trains", features, settings, board: async () => board, changes, now: () => new Date("2026-11-23T07:00:00Z") });
  return app;
}

function feedWithTwo(): ChangeFeed {
  const feed = createChangeFeed("run-1");
  feed.add(["The 07:14 is cancelled."], new Date("2026-11-23T06:47:00Z"));
  feed.add(["The 07:44 is now expected 07:54, 10 minutes late."], new Date("2026-11-23T06:49:00Z"));
  return feed;
}

test("today's train changes are at /trains/changes, after a number and run if given", async () => {
  const app = withChanges(allOn, feedWithTwo());
  const all = await app.inject({ method: "GET", url: "/trains/changes" });
  assert.equal(all.statusCode, 200);
  assert.deepEqual(all.json().changes.map((change: { id: number }) => change.id), [1, 2]);
  assert.deepEqual([all.json().run, all.json().latest], ["run-1", 2]);
  const later = await app.inject({ method: "GET", url: "/trains/changes?after=1&run=run-1" });
  assert.deepEqual(later.json(), { run: "run-1", latest: 2, changes: [{ id: 2, at: "2026-11-23T06:49:00.000Z", lines: ["The 07:44 is now expected 07:54, 10 minutes late."] }] });
  const otherRun = await app.inject({ method: "GET", url: "/trains/changes?after=2&run=run-0" });
  assert.deepEqual(otherRun.json().changes.length, 2);
  const empty = await app.inject({ method: "GET", url: "/trains/changes?after=&run=" });
  assert.deepEqual(empty.json().changes.length, 2);
});

test("with train alerts off, or no feed, the changes are a 404", async () => {
  for (const app of [withChanges({ ...allOn, trainAlerts: false, expiryAlerts: false }, feedWithTwo()), withChanges(allOn)]) {
    const reply = await app.inject({ method: "GET", url: "/trains/changes" });
    assert.deepEqual([reply.statusCode, reply.json()], [404, { error: "Train alerts are switched off" }]);
  }
  const timesOff = await withChanges({ ...allOn, trains: false }, feedWithTwo()).inject({ method: "GET", url: "/trains/changes" });
  assert.equal(timesOff.statusCode, 200);
});

test("an after that isn't a whole number, or a run that's too long or given twice, is refused", async () => {
  const app = withChanges(allOn, feedWithTwo());
  for (const query of ["after=-1", "after=1.5", "after=one", "after=1e3", "after=1234567890", "after=1&after=2"]) {
    const reply = await app.inject({ method: "GET", url: `/trains/changes?${query}` });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "after must be a whole number" }], query);
  }
  for (const query of [`run=${"r".repeat(101)}`, "run=a&run=b"]) {
    const reply = await app.inject({ method: "GET", url: `/trains/changes?${query}` });
    assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "run must be the run a last answer gave" }], query);
  }
  assert.equal((await app.inject({ method: "GET", url: `/trains/changes?run=${"r".repeat(100)}` })).statusCode, 200);
});

test("asking for the changes isn't logged, since Jarvis asks every 30 seconds, while asking for the board still is", async () => {
  const logged: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      logged.push(String(chunk));
      done();
    },
  });
  const app = Fastify({ logger: { level: "info", stream } });
  app.register(trains, { prefix: "/trains", features: allOn, settings, board: async () => board, changes: feedWithTwo() });
  await app.inject({ method: "GET", url: "/trains/changes?after=1&run=run-1" });
  assert.equal(logged.filter((line) => line.includes("/trains/changes")).length, 0, logged.join(""));
  await app.inject({ method: "GET", url: "/trains" });
  assert.ok(logged.some((line) => line.includes('"url":"/trains"')), logged.join(""));
  await app.inject({ method: "GET", url: "/trains/changes?after=x" });
  assert.equal(logged.filter((line) => line.includes("/trains/changes")).length, 0, "a refused ask isn't logged either");
});
