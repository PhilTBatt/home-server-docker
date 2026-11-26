import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { readStatus } from "../system/routes.js";
import { watchersFor } from "./setup.js";

const config = { ntfyTopic: "test-topic", qbitApiKey: "test-qbit-key", jellyfinApiKey: "test-jellyfin-key" };

afterEach(() => {
  mock.restoreAll();
});

test("the real watchers ask qBittorrent's finished downloads and Jellyfin with their keys, and send to the ntfy topic", async () => {
  const asked: string[] = [];
  const start = new Date();
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    asked.push(`${init?.method ?? "GET"} ${url} ${new Headers(init?.headers).get("Authorization") ?? ""}`);
    if (url.startsWith("http://qbittorrent")) return Response.json([{ name: "Alpha", progress: 1, dlspeed: 0, eta: 0, state: "uploading", hash: "x", completion_on: Math.ceil(start.getTime() / 1000) + 5 }]);
    if (url.startsWith("http://jellyfin")) return Response.json({ MovieCount: 1, SeriesCount: 2, EpisodeCount: 3 });
    return new Response(null, { status: 200 });
  });
  const watchers = watchersFor(config);
  watchers.add({ watch: { kind: "download-finished", name: "alpha" }, hours: 24 }, start);
  watchers.add({ watch: { kind: "service-answering", service: "jellyfin" }, hours: 24 }, start);
  assert.deepEqual(await watchers.run(new Date(start.getTime() + 60_000)), { fired: 2, expired: 0, unsent: 0, dropped: 0 });
  assert.deepEqual(asked.slice(0, 2).sort(), ['GET http://jellyfin:8096/Items/Counts MediaBrowser Token="test-jellyfin-key"', "GET http://qbittorrent:8081/api/v2/torrents/info?filter=completed Bearer test-qbit-key"]);
  assert.deepEqual(asked.slice(2), ["POST https://ntfy.sh/test-topic ", "POST https://ntfy.sh/test-topic "]);
});

test("the real watchers ask qBittorrent's downloading list to see that it answers, and read the server's own disk", async () => {
  const asked: string[] = [];
  mock.method(globalThis, "fetch", async (url: string) => {
    asked.push(url);
    return url.startsWith("http://qbittorrent") ? Response.json([]) : new Response(null, { status: 200 });
  });
  const watchers = watchersFor(config);
  const start = new Date();
  watchers.add({ watch: { kind: "service-answering", service: "qbittorrent" }, hours: 24 }, start);
  watchers.add({ watch: { kind: "disk-free-below", percent: 1 }, hours: 24 }, start);
  assert.deepEqual(await watchers.run(new Date(start.getTime() + 60_000)), { fired: 1, expired: 0, unsent: 0, dropped: 0 });
  assert.deepEqual(asked, ["http://qbittorrent:8081/api/v2/torrents/info?filter=downloading", "https://ntfy.sh/test-topic"]);
  assert.deepEqual(watchers.list().map((watcher) => watcher.lastCheck?.ok), [true], "the disk was read; this assumes the test machine's disk is over 1% free");
});

test("the real watchers read the disk's free and total space as GET /system/status gives them", async () => {
  const sent: string[] = [];
  mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    sent.push(String(init?.body));
    return new Response(null, { status: 200 });
  });
  const watchers = watchersFor(config);
  const start = new Date();
  watchers.add({ watch: { kind: "disk-free-below", percent: 99 }, hours: 24 }, start);
  const status = await readStatus();
  assert.deepEqual(await watchers.run(new Date(start.getTime() + 60_000)), { fired: 1, expired: 0, unsent: 0, dropped: 0 }, "this assumes the test machine's disk is under 99% free");
  assert.equal(sent.length, 1);
  assert.match(sent[0], new RegExp(`^Free disk space is down to ${status.diskAvailableGB} of ${status.diskTotalGB} GB \\(`));
});
