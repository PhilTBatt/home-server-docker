import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Fastify from "fastify";

process.env.QBIT_API_KEY = "test-qbit-key";
process.env.JELLYFIN_API_KEY = "test-jellyfin-key";
const { media } = await import("./routes.js");

const hash = "0123456789abcdef0123456789abcdef01234567";

function buildApp() {
  const app = Fastify();
  app.register(media, { prefix: "/media" });
  return app;
}

afterEach(() => {
  mock.restoreAll();
});

test("downloads turns qBittorrent's reply into the tidy shape", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json([
      { name: "First", progress: 0.4237, dlspeed: 2048000, eta: 600, state: "downloading", hash },
      { name: "Stalled", progress: 1, dlspeed: 0, eta: 8640000, state: "stalledDL", hash },
    ]),
  );
  const response = await buildApp().inject({ method: "GET", url: "/media/downloads" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [
    { name: "First", percent: 42, speedKBps: 2000, etaSeconds: 600, state: "downloading", hash },
    { name: "Stalled", percent: 100, speedKBps: 0, etaSeconds: null, state: "stalledDL", hash },
  ]);
});

test("stop sends the hash to qBittorrent's stop endpoint", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const response = await buildApp().inject({ method: "POST", url: `/media/downloads/${hash}/stop` });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "stopped" });
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://qbittorrent:8081/api/v2/torrents/stop");
  assert.equal(options?.method, "POST");
  assert.equal(String(options?.body), `hashes=${hash}`);
  assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-qbit-key");
});

test("the hash 'all' is refused before anything reaches qBittorrent", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const response = await buildApp().inject({ method: "POST", url: "/media/downloads/all/stop" });
  assert.equal(response.statusCode, 400);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("an action other than stop or start is refused", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const response = await buildApp().inject({ method: "POST", url: `/media/downloads/${hash}/delete` });
  assert.equal(response.statusCode, 400);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("an error from qBittorrent becomes a 500", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  const response = await buildApp().inject({ method: "GET", url: "/media/downloads" });
  assert.equal(response.statusCode, 500);
});