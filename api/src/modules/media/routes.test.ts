import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import Fastify from "fastify";
import { finishedDownloads, media } from "./routes.js";

const hash = "0123456789abcdef0123456789abcdef01234567";

function buildApp() {
  const app = Fastify();
  app.register(media, { prefix: "/media", qbitApiKey: "test-qbit-key", jellyfinApiKey: "test-jellyfin-key" });
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

test("one download is looked up by its hash, whatever its state, in the same tidy shape", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    Response.json([{ name: "Stopped one", progress: 0.5, dlspeed: 0, eta: 8640000, state: "stoppedDL", hash }]),
  );
  const response = await buildApp().inject({ method: "GET", url: `/media/downloads/${hash}` });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { name: "Stopped one", percent: 50, speedKBps: 0, etaSeconds: null, state: "stoppedDL", hash });
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `http://qbittorrent:8081/api/v2/torrents/info?hashes=${hash}`);
  assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-qbit-key");
});

test("a hash qBittorrent doesn't have is a 404, even if it replies with other torrents", async () => {
  const other = "fedcba9876543210fedcba9876543210fedcba98";
  mock.method(globalThis, "fetch", async () => Response.json([{ name: "Someone else", progress: 1, dlspeed: 0, eta: 0, state: "uploading", hash: other }]));
  const response = await buildApp().inject({ method: "GET", url: `/media/downloads/${hash}` });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "No torrent with that hash" });
  mock.method(globalThis, "fetch", async () => Response.json([]));
  assert.equal((await buildApp().inject({ method: "GET", url: `/media/downloads/${hash}` })).statusCode, 404);
});

test("an error from qBittorrent on looking up one download becomes a 500", async () => {
  mock.method(globalThis, "fetch", async () => Response.json([], { status: 403 }));
  const response = await buildApp().inject({ method: "GET", url: `/media/downloads/${hash}` });
  assert.equal(response.statusCode, 500);
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


test("downloads asks qBittorrent for downloading torrents with the API key", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json([]));
  const response = await buildApp().inject({ method: "GET", url: "/media/downloads" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), []);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://qbittorrent:8081/api/v2/torrents/info?filter=downloading");
  assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-qbit-key");
});

test("start sends the hash to qBittorrent's start endpoint", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const response = await buildApp().inject({ method: "POST", url: `/media/downloads/${hash}/start` });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "started" });
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://qbittorrent:8081/api/v2/torrents/start");
  assert.equal(options?.method, "POST");
  assert.equal(String(options?.body), `hashes=${hash}`);
});

const badHashes = [
  ["uppercase letters", "0123456789ABCDEF0123456789ABCDEF01234567"],
  ["39 characters", "0123456789abcdef0123456789abcdef0123456"],
  ["41 characters", "0123456789abcdef0123456789abcdef012345678"],
  ["a letter outside a to f", "0123456789abcdef0123456789abcdef0123456g"],
  ["two hashes joined with a pipe", `${hash}%7C${hash}`],
] as const;

for (const [label, badHash] of badHashes) {
  test(`a hash with ${label} is refused before anything reaches qBittorrent`, async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
    const response = await buildApp().inject({ method: "POST", url: `/media/downloads/${badHash}/stop` });
    assert.equal(response.statusCode, 400);
    const lookup = await buildApp().inject({ method: "GET", url: `/media/downloads/${badHash}` });
    assert.equal(lookup.statusCode, 400);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
}

test("looking up the hash 'all' is refused before anything reaches qBittorrent", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json([]));
  const response = await buildApp().inject({ method: "GET", url: "/media/downloads/all" });
  assert.equal(response.statusCode, 400);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("an error from qBittorrent on stop becomes a 500", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  const response = await buildApp().inject({ method: "POST", url: `/media/downloads/${hash}/stop` });
  assert.equal(response.statusCode, 500);
});

test("library maps Jellyfin's counts and sends the Jellyfin key", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    Response.json({ MovieCount: 3, SeriesCount: 4, EpisodeCount: 43, ItemCount: 0 }),
  );
  const response = await buildApp().inject({ method: "GET", url: "/media/library" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { movies: 3, series: 4, episodes: 43 });
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://jellyfin:8096/Items/Counts");
  assert.equal(
    new Headers(options?.headers).get("Authorization"),
    'MediaBrowser Token="test-jellyfin-key"',
  );
});

test("an error from Jellyfin on library becomes a 500", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  const response = await buildApp().inject({ method: "GET", url: "/media/library" });
  assert.equal(response.statusCode, 500);
});

test("scan posts to Jellyfin's refresh endpoint", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  const response = await buildApp().inject({ method: "POST", url: "/media/library/scan" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "scan started" });
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://jellyfin:8096/Library/Refresh");
  assert.equal(options?.method, "POST");
  assert.equal(
    new Headers(options?.headers).get("Authorization"),
    'MediaBrowser Token="test-jellyfin-key"',
  );
});

test("an error from Jellyfin on scan becomes a 500", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 500 }));
  const response = await buildApp().inject({ method: "POST", url: "/media/library/scan" });
  assert.equal(response.statusCode, 500);
});
test("finished downloads are asked for with the API key and keep only complete torrents with a completion time, in milliseconds", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    Response.json([
      { name: "Alpha", progress: 1, dlspeed: 0, eta: 0, state: "uploading", hash, completion_on: 1_790_000_000 },
      { name: "Beta", progress: 0.999, dlspeed: 0, eta: 0, state: "stalledDL", hash, completion_on: 1_790_000_100 },
      { name: "Gamma", progress: 1, dlspeed: 0, eta: 0, state: "uploading", hash, completion_on: -1 },
      { name: "Delta", progress: 1, dlspeed: 0, eta: 0, state: "uploading", hash },
      { name: 7, progress: 1, dlspeed: 0, eta: 0, state: "uploading", hash, completion_on: 1_790_000_200 },
    ]),
  );
  assert.deepEqual(await finishedDownloads("test-qbit-key"), [{ name: "Alpha", completedAt: 1_790_000_000_000 }]);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://qbittorrent:8081/api/v2/torrents/info?filter=completed");
  assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-qbit-key");
});

test("an error from qBittorrent on finished downloads is thrown with its status", async () => {
  mock.method(globalThis, "fetch", async () => Response.json([], { status: 403 }));
  await assert.rejects(finishedDownloads("test-qbit-key"), { message: "qBittorrent replied 403" });
});
