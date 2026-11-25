import assert from "node:assert/strict";
import { mock, test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import type { Board } from "./board.js";
import { trains } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true };
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
