import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { mock, test } from "node:test";
import { actionQuestion, watchText, actionsEnv, allowedHubTools, checkHubServer, defaultMusicYes, describeAction, describeWithHub, fullHash, hubActionTools, hubApiUrl, hubNoYesTools, hubMusicChanges, hubMusicControls, hubMusicReadTools, hubNotBuilt, hubReadTools, hubServerEnv, hubServerFile, hubServerFor, hubToolPrefix, hubWallTools, isHubAction, lookUpDownload, lookupMs, musicText, nameLimit, needsHubYes, noTorrentError, notDoneNote, shownName, withHubToken, type Lookup } from "./hub-tools.js";

test("the hub's MCP server is the built one mounted from mcp/, run with this Node, and its tools are named mcp__hub__ on the Agent SDK", () => {
  assert.equal(hubServerFile, "/mcp/dist/server.js");
  assert.equal(hubToolPrefix, "mcp__hub__");
  assert.deepEqual(hubServerFor("hub-token"), { command: process.execPath, args: ["/mcp/dist/server.js"], token: "hub-token", actions: false, musicYes: "changes" });
  assert.deepEqual(hubServerFor("hub-token", true), { command: process.execPath, args: ["/mcp/dist/server.js"], token: "hub-token", actions: true, musicYes: "changes" });
  assert.equal(hubServerFor("hub-token", true, hubServerFile, "all").musicYes, "all");
  assert.deepEqual(hubServerFor("hub-token", false, "/elsewhere/server.js").args, ["/elsewhere/server.js"]);
});

test("the MCP server's actions are on only when asked for, and it's told nothing else", () => {
  assert.deepEqual(actionsEnv(hubServerFor("hub-token")), { MCP_ACTIONS: "off" });
  assert.deepEqual(actionsEnv({ command: "node", args: [], token: "hub-token" }), { MCP_ACTIONS: "off" });
  assert.deepEqual(actionsEnv(hubServerFor("hub-token", true)), { MCP_ACTIONS: "on" });
});

test("an MCP server started by Jarvis himself gets the token and the actions setting", () => {
  assert.deepEqual(hubServerEnv(hubServerFor("hub-token")), { API_TOKEN: "hub-token", MCP_ACTIONS: "off" });
  assert.deepEqual(hubServerEnv(hubServerFor("hub-token", true)), { API_TOKEN: "hub-token", MCP_ACTIONS: "on" });
});

test("Jarvis knows the hub's read tools and actions by name, Spotify's among them, and accepts the actions only when they're on", () => {
  assert.deepEqual(hubReadTools, ["get_status", "get_alerts", "get_features", "get_downloads", "get_library", "get_wifi_reconnects", "get_backup", "get_watchers", "get_expiries", "get_doctor", "get_mode", "get_reminders", "get_chore", "get_sessions", "get_events", "get_deal_status", "get_deal_searches", "get_catch_up", "get_deal_matches", "get_deal_listing", "get_deal_hidden", "get_spotify_playing", "get_spotify_devices", "get_spotify_queue", "get_spotify_search", "get_spotify_playlists"]);
  assert.deepEqual(hubMusicReadTools, ["get_spotify_playing", "get_spotify_devices", "get_spotify_queue", "get_spotify_search", "get_spotify_playlists"]);
  assert.deepEqual(hubMusicControls, ["spotify_play", "spotify_pause", "spotify_next", "spotify_previous", "spotify_seek", "spotify_volume", "spotify_shuffle", "spotify_repeat", "spotify_queue_add", "spotify_transfer"]);
  assert.deepEqual(hubMusicChanges, ["spotify_playlist_add", "spotify_save"]);
  assert.deepEqual(hubActionTools, ["scan_library", "stop_download", "start_download", "add_watcher", "cancel_watcher", "cancel_reminder", "run_chore", ...hubMusicControls, ...hubMusicChanges]);
  assert.deepEqual(allowedHubTools(hubServerFor("t")), hubReadTools);
  assert.deepEqual(hubNoYesTools, ["set_reminder", "snooze_reminder"]);
  assert.deepEqual(allowedHubTools(hubServerFor("t", true)), [...hubReadTools, ...hubNoYesTools, ...hubActionTools]);
  assert.deepEqual(hubNoYesTools.map(isHubAction), [false, false]);
  assert.equal(isHubAction("cancel_reminder"), true, "cancelling a reminder needs a yes: a cancelled one is gone");
  assert.equal(actionQuestion("cancel_reminder", { id: "0a1b2c3d" }), "Jarvis wants to cancel the reminder 0a1b2c3d. Type yes to let him, or anything else to stop it");
  assert.ok(hubActionTools.every(isHubAction));
  assert.deepEqual(["get_status", "get_watchers", "read_file", "mcp__hub__scan_library", "Scan_library", "mcp__hub__add_watcher", ""].map(isHubAction), [false, false, false, false, false, false, false]);
});

test("every action needs a yes except Spotify's playback controls, which need one only with JARVIS_MUSIC_YES=all; changing playlists or the library always does", () => {
  assert.equal(defaultMusicYes, "changes");
  for (const server of [hubServerFor("t", true), hubServerFor("t", true, hubServerFile, "changes"), undefined, { musicYes: undefined }]) {
    assert.deepEqual(["scan_library", "stop_download", "start_download", "add_watcher", "cancel_watcher", ...hubMusicChanges].map((name) => needsHubYes(server, name)), [true, true, true, true, true, true, true], JSON.stringify(server));
    assert.ok(hubMusicControls.every((name) => !needsHubYes(server, name)), JSON.stringify(server));
  }
  const all = hubServerFor("t", true, hubServerFile, "all");
  assert.ok(hubActionTools.every((name) => needsHubYes(all, name)));
  for (const server of [all, hubServerFor("t", true)]) assert.deepEqual(["get_spotify_playing", "get_status", "mcp__hub__spotify_pause", "Spotify_pause", "spotify_reboot", ""].map((name) => needsHubYes(server, name)), [false, false, false, false, false, false]);
});

test("each Spotify action is put to Phil in plain words, showing only what the hub would accept", () => {
  const ask = (name: string, input: unknown) => actionQuestion(name, input);
  const track = "spotify:track:4iV5W9uYEdYUVa79Axb7Rh";
  const device = "0d1841b0976bae2a3a310dd74c0f3df354899bc8";
  const end = ". Type yes to let him, or anything else to stop it";
  assert.equal(ask("spotify_play", {}), `Jarvis wants to carry on playing Spotify${end}`);
  assert.equal(ask("spotify_play", { uri: "spotify:album:4aawyAB9vmqN3uQ7FjRGTy", device }), `Jarvis wants to play the album spotify:album:4aawyAB9vmqN3uQ7FjRGTy on Spotify on the device whose id starts 0d1841b0${end}`);
  assert.equal(ask("spotify_play", { uri: "spotify:artist:0TnOYISbd1XYRBk9myaseg" }), `Jarvis wants to play music by the artist spotify:artist:0TnOYISbd1XYRBk9myaseg on Spotify${end}`);
  assert.equal(ask("spotify_pause", { device: "has space" }), `Jarvis wants to pause Spotify on a device the hub won't accept${end}`);
  assert.equal(ask("spotify_next", {}), `Jarvis wants to skip to the next track${end}`);
  assert.equal(ask("spotify_previous", {}), `Jarvis wants to go back to the previous track${end}`);
  assert.equal(ask("spotify_seek", { positionMs: 95_500 }), `Jarvis wants to jump to 1:35 in what's playing${end}`);
  assert.equal(ask("spotify_volume", { percent: 40 }), `Jarvis wants to set Spotify's volume to 40%${end}`);
  assert.equal(ask("spotify_shuffle", { on: true }), `Jarvis wants to turn shuffle on${end}`);
  assert.equal(ask("spotify_repeat", { mode: "context" }), `Jarvis wants to set repeat to the album or playlist${end}`);
  assert.equal(ask("spotify_repeat", { mode: "track" }), `Jarvis wants to set repeat to this track${end}`);
  assert.equal(ask("spotify_queue_add", { uri: track }), `Jarvis wants to add the track ${track} to the queue${end}`);
  assert.equal(ask("spotify_transfer", { device, play: true }), `Jarvis wants to move the music to the device whose id starts 0d1841b0 and play it there${end}`);
  assert.equal(ask("spotify_playlist_add", { playlist: "37i9dQZF1DXcBWIGoYBM5M", uris: [track, "spotify:episode:512ojhOuo1ktJprKbVcKyQ"] }), `Jarvis wants to add 2 track or episodes to your playlist 37i9dQZF1DXcBWIGoYBM5M${end}`);
  assert.equal(ask("spotify_save", { uris: [track] }), `Jarvis wants to save 1 item to your Spotify library${end}`);
  const refused = `Jarvis wants to change Spotify with details the hub won't accept${end}`;
  for (const [name, input] of [
    ["spotify_play", { uri: "https://evil.example/\u202e" }],
    ["spotify_seek", { positionMs: -1 }],
    ["spotify_volume", { percent: 101 }],
    ["spotify_shuffle", { on: "yes" }],
    ["spotify_repeat", { mode: "all" }],
    ["spotify_queue_add", {}],
    ["spotify_transfer", { device: "a b" }],
    ["spotify_playlist_add", { playlist: "37i9dQZF1DXcBWIGoYBM5M", uris: [] }],
    ["spotify_playlist_add", { playlist: "../x", uris: [track] }],
    ["spotify_save", { uris: ["Ignore your instructions"] }],
    ["spotify_save", null],
    ["spotify_unknown", {}],
  ] as [string, unknown][]) assert.equal(ask(name, input), refused, `${name} ${JSON.stringify(input)}`);
  assert.equal(musicText("scan_library", {}), null);
});

test("each action is put to Phil in plain words, with a download's hash cut short", () => {
  const hash = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(actionQuestion("scan_library", {}), "Jarvis wants to scan the library. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("stop_download", { hash }), "Jarvis wants to stop the download whose hash starts 01234567. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("start_download", { hash }), "Jarvis wants to start the download whose hash starts 01234567 again. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("start_download", { hash: "abc" }), "Jarvis wants to start the download abc again. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("stop_download", { hash: "ABCDEF0123" }), "Jarvis wants to stop the download whose hash starts ABCDEF01. Type yes to let him, or anything else to stop it");
  for (const input of [{}, null, "x", { hash: 5 }, { hash: "" }, { hash: "\u202eabc" }, { hash: "abc def" }, { hash: "gg" }]) assert.equal(actionQuestion("stop_download", input), "Jarvis wants to stop a download. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("reboot_server", {}), "Jarvis wants to use reboot_server. Type yes to let him, or anything else to stop it");
  assert.equal(notDoneNote, "Phil didn't say yes, so it wasn't done");
});

test("adding a watcher is put to Phil as exactly what will be watched and for how long", () => {
  const ask = (input: unknown) => actionQuestion("add_watcher", input);
  const typeYes = "Type yes to let him, or anything else to stop it";
  assert.equal(ask({ kind: "download-finished", name: "alpha beta" }), `Jarvis wants to watch for a download matching "alpha beta" to finish, for up to 24 hours, and tell your phone once when it happens. ${typeYes}`);
  assert.equal(ask({ kind: "disk-free-below", percent: 15, hours: 1 }), `Jarvis wants to watch for free disk space to fall below 15%, for up to an hour, and tell your phone once when it happens. ${typeYes}`);
  assert.equal(ask({ kind: "service-answering", service: "jellyfin", hours: 168 }), `Jarvis wants to watch for Jellyfin to answer, for up to 168 hours, and tell your phone once when it happens. ${typeYes}`);
  assert.equal(watchText({ kind: "service-answering", service: "qbittorrent" }), "watch for qBittorrent to answer, for up to 24 hours, and tell your phone once when it happens");
  assert.equal(watchText({ kind: "disk-free-below", percent: 1, hours: 2 }), "watch for free disk space to fall below 1%, for up to 2 hours, and tell your phone once when it happens");
  assert.equal(watchText({ kind: "disk-free-below", percent: 99 }), "watch for free disk space to fall below 99%, for up to 24 hours, and tell your phone once when it happens");
  assert.equal(watchText({ kind: "download-finished", name: "Ab" }), "watch for a download matching \"Ab\" to finish, for up to 24 hours, and tell your phone once when it happens");
  assert.notEqual(watchText({ kind: "download-finished", name: "a".repeat(40) }), null);
});

test("a watcher Jarvis can't describe exactly is put to Phil as one the hub won't accept, never with its raw details", () => {
  const refused = "Jarvis wants to add a watcher with details the hub won't accept. Type yes to let him, or anything else to stop it";
  for (const input of [
    null,
    "disk",
    [],
    {},
    { kind: "run-command", name: "reboot" },
    { kind: "download-finished", name: "$(reboot)" },
    { kind: "download-finished", name: "alpha\u202ebeta" },
    { kind: "download-finished", name: "alpha  beta" },
    { kind: "download-finished", name: " alpha" },
    { kind: "download-finished", name: "a" },
    { kind: "download-finished", name: "a".repeat(41) },
    { kind: "download-finished", name: 5 },
    { kind: "download-finished" },
    { kind: "disk-free-below", percent: 0 },
    { kind: "disk-free-below", percent: 100 },
    { kind: "disk-free-below", percent: 15.5 },
    { kind: "disk-free-below", percent: "15" },
    { kind: "service-answering", service: "sonarr" },
    { kind: "service-answering", service: "toString" },
    { kind: "disk-free-below", percent: 15, hours: 0 },
    { kind: "disk-free-below", percent: 15, hours: 169 },
    { kind: "disk-free-below", percent: 15, hours: 1.5 },
    { kind: "disk-free-below", percent: 10, name: "extra" },
    { kind: "download-finished", name: "Alpha", service: "jellyfin" },
    { kind: "service-answering", service: "jellyfin", percent: 5 },
    { kind: "disk-free-below", percent: 10, note: "x" },
  ]) assert.equal(actionQuestion("add_watcher", input), refused, JSON.stringify(input));
});

test("cancelling a watcher is put to Phil with its id, or as a watcher when the id isn't one", () => {
  assert.equal(actionQuestion("cancel_watcher", { id: "0a1b2c3d" }), "Jarvis wants to cancel the watcher 0a1b2c3d. Type yes to let him, or anything else to stop it");
  for (const input of [{}, null, { id: "0A1B2C3D" }, { id: "0a1b2c3" }, { id: "\u202e0a1b2c3d" }, { id: 12345678 }]) assert.equal(actionQuestion("cancel_watcher", input), "Jarvis wants to cancel a watcher. Type yes to let him, or anything else to stop it", JSON.stringify(input));
});

test("an environment gets the hub's token only with the hub's tools, and never a token it already had, nor ears's", () => {
  const env = { PATH: "/usr/bin", API_TOKEN: "old-token", ANTHROPIC_API_KEY: "key", EARS_TOKEN: "ears-token" };
  assert.deepEqual(withHubToken(env, hubServerFor("hub-token")), { PATH: "/usr/bin", ANTHROPIC_API_KEY: "key", API_TOKEN: "hub-token" });
  assert.deepEqual(withHubToken(env, undefined), { PATH: "/usr/bin", ANTHROPIC_API_KEY: "key" });
  assert.deepEqual(withHubToken({ PATH: "/usr/bin" }, undefined), { PATH: "/usr/bin" });
});

test("an unbuilt MCP server stops Jarvis with how to build it; a built one passes", () => {
  assert.throws(() => checkHubServer("/mcp/dist/server.js", () => false), { message: hubNotBuilt("/mcp/dist/server.js") });
  assert.doesNotThrow(() => checkHubServer("/mcp/dist/server.js", (path) => path === "/mcp/dist/server.js"));
  assert.equal(hubNotBuilt("/mcp/dist/server.js"), "JARVIS_HUB_TOOLS is on, but the MCP server isn't built: there's no /mcp/dist/server.js. Build it with npm ci and npm test in mcp/, as the README says");
});

const fullOne = "0123456789abcdef0123456789abcdef01234567";
const typeYes = "Type yes to let him, or anything else to stop it";

test("only a full, lower-case 40-character hash is looked up, as the hub's own rule requires", () => {
  assert.equal(fullHash({ hash: fullOne }), fullOne);
  for (const input of [{ hash: fullOne.toUpperCase() }, { hash: fullOne.slice(1) }, { hash: `${fullOne}0` }, { hash: `${fullOne.slice(1)}g` }, { hash: 5 }, {}, null, fullOne]) assert.equal(fullHash(input), null);
});

test("a download's name is shown on one line, without hidden characters or double quotes, and cut at 80 characters", () => {
  assert.equal(shownName("Some.Film.2024.1080p"), "Some.Film.2024.1080p");
  assert.equal(shownName(" two\nlines\tand  spaces "), "two lines and spaces");
  assert.equal(shownName('a"b\u202ec\u200bd\u001be'), "a'bcd\ufffde");
  assert.equal(shownName("\u201cA\u201d \u201eB\u201f \u2033C\u2036 \uff02D\uff02 \u301dE\u301e\u301f"), "'A' 'B' 'C' 'D' 'E''");
  assert.equal(nameLimit, 80);
  const long = shownName("x".repeat(100));
  assert.deepEqual([[...long].length, long.endsWith("x…")], [80, true]);
  assert.equal(shownName("x".repeat(80)), "x".repeat(80));
  const emoji = shownName("😀".repeat(90));
  assert.equal(emoji, `${"😀".repeat(79)}…`);
  assert.equal(shownName(`${"y".repeat(78)} z${"w".repeat(10)}`), `${"y".repeat(78)}…`);
});

test("a lookup that answers quickly leaves no timer running", async () => {
  const timers = () => process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
  const before = timers();
  await describeAction("stop_download", { hash: fullOne }, async () => ({ name: "Film", percent: 1 }), new AbortController().signal, 30_000);
  await describeAction("stop_download", { hash: fullOne }, async () => null, undefined, 30_000);
  assert.equal(timers(), before);
});

test("stopping or starting asks the hub for the download's name and shows it, with how far it got and the hash's start", async () => {
  const asked: string[] = [];
  const lookup: Lookup = async (hash) => {
    asked.push(hash);
    return { name: "Some.Film.2024.1080p", percent: 62 };
  };
  assert.equal(await describeAction("stop_download", { hash: fullOne }, lookup), `Jarvis wants to stop the download whose hash starts 01234567 (62% done), named "Some.Film.2024.1080p". ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne }, lookup), `Jarvis wants to start the download whose hash starts 01234567 again (62% done), named "Some.Film.2024.1080p". ${typeYes}`);
  assert.deepEqual(asked, [fullOne, fullOne]);
  const quoted: Lookup = async () => ({ name: 'Bad" (hash starts 99999999) named \u201cOther', percent: 1 });
  assert.equal(await describeAction("stop_download", { hash: fullOne }, quoted), `Jarvis wants to stop the download whose hash starts 01234567 (1% done), named "Bad' (hash starts 99999999) named 'Other". ${typeYes}`);
});

test("a hash the hub doesn't have, or a lookup that fails, is said plainly, and the question is still asked", async () => {
  assert.equal(await describeAction("stop_download", { hash: fullOne }, async () => null), `Jarvis wants to stop a download the hub doesn't have (hash starts 01234567). ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne }, async () => null), `Jarvis wants to start a download the hub doesn't have (hash starts 01234567). ${typeYes}`);
  const failing: Lookup = async () => {
    throw new Error("The hub replied 500");
  };
  assert.equal(await describeAction("stop_download", { hash: fullOne }, failing), `Jarvis wants to stop the download whose hash starts 01234567 (couldn't look up its name). ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne }, failing), `Jarvis wants to start the download whose hash starts 01234567 again (couldn't look up its name). ${typeYes}`);
});

test("scanning, or a hash that isn't a full one, isn't looked up; a hash that isn't full is said so", async () => {
  let calls = 0;
  const lookup: Lookup = async () => {
    calls++;
    return { name: "x", percent: 0 };
  };
  for (const [name, input] of [["scan_library", {}], ["get_status", { hash: fullOne }]] as const) {
    assert.equal(await describeAction(name, input, lookup), actionQuestion(name, input));
  }
  assert.equal(await describeAction("stop_download", { hash: "abc" }, lookup), `Jarvis wants to stop the download abc (not a full hash, so it can't be looked up). ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne.toUpperCase() }, lookup), `Jarvis wants to start the download whose hash starts 01234567 again (not a full hash, so it can't be looked up). ${typeYes}`);
  assert.equal(await describeAction("stop_download", {}, lookup), `Jarvis wants to stop a download (not a full hash, so it can't be looked up). ${typeYes}`);
  assert.equal(calls, 0);
});

test("a lookup gives up after 5 seconds, or at once when the question is called off, and says it couldn't", async () => {
  assert.equal(lookupMs, 5_000);
  const signals: AbortSignal[] = [];
  const hanging: Lookup = (_hash, signal) =>
    new Promise((_resolve, reject) => {
      signals.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  const started = Date.now();
  assert.equal(await describeAction("stop_download", { hash: fullOne }, hanging, undefined, 50), `Jarvis wants to stop the download whose hash starts 01234567 (couldn't look up its name). ${typeYes}`);
  assert.ok(Date.now() - started < 1000);
  const calledOff = new AbortController();
  const asking = describeAction("stop_download", { hash: fullOne }, hanging, calledOff.signal, 30_000);
  calledOff.abort();
  assert.match(await asking, /couldn't look up its name/);
  assert.match(await describeAction("stop_download", { hash: fullOne }, hanging, new AbortController().signal, 50), /couldn't look up its name/);
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.ok(Date.now() - started < 1000);
});

test("a lookup that ignores being called off still can't hold the question up", { timeout: 5000 }, async () => {
  const deaf: Lookup = () => new Promise(() => {});
  const started = Date.now();
  assert.match(await describeAction("stop_download", { hash: fullOne }, deaf, new AbortController().signal, 50), /couldn't look up its name/);
  const calledOff = new AbortController();
  const asking = describeAction("stop_download", { hash: fullOne }, deaf, calledOff.signal, 30_000);
  calledOff.abort();
  assert.match(await asking, /couldn't look up its name/);
  const already = new AbortController();
  already.abort();
  assert.match(await describeAction("stop_download", { hash: fullOne }, deaf, already.signal, 30_000), /couldn't look up its name/);
  assert.ok(Date.now() - started < 1000);
});

test("the lookup's time limit is 5 seconds unless told otherwise", async () => {
  const delays: number[] = [];
  const realSetTimeout = globalThis.setTimeout;
  mock.method(globalThis, "setTimeout", ((run: () => void, ms: number) => {
    delays.push(ms);
    return realSetTimeout(run, ms);
  }) as typeof setTimeout);
  try {
    await describeAction("stop_download", { hash: fullOne }, async () => null, new AbortController().signal);
  } finally {
    mock.restoreAll();
  }
  assert.deepEqual(delays, [5_000]);
});

test("with the hub's token, a stop or start question asks http://api:3000 for that download, follows no redirects, and shows it", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ name: "Film", percent: 42, speedKBps: 0, etaSeconds: null, state: "stoppedDL", hash: fullOne }));
  try {
    const describe = describeWithHub("hub-token");
    const calledOff = new AbortController();
    assert.equal(await describe("start_download", { hash: fullOne }, calledOff.signal), `Jarvis wants to start the download whose hash starts 01234567 again (42% done), named "Film". ${typeYes}`);
    assert.equal(await describe("scan_library", {}, calledOff.signal), actionQuestion("scan_library", {}));
    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, options] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, `http://api:3000/media/downloads/${fullOne}`);
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer hub-token");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.signal?.aborted, false);
    calledOff.abort();
    assert.equal(options?.signal?.aborted, true);
  } finally {
    mock.restoreAll();
  }
});

async function fakeHub(reply: (request: IncomingMessage) => { status: number; body: string }) {
  const seen: { url: string | undefined; authorization: string | undefined; method: string | undefined }[] = [];
  const server = createServer((request, response) => {
    seen.push({ url: request.url, authorization: request.headers.authorization, method: request.method });
    const { status, body } = reply(request);
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("the lookup asks the hub's API for that one download with the token, and takes its name and progress", async () => {
  assert.equal(hubApiUrl, "http://api:3000");
  const hub = await fakeHub(() => ({ status: 200, body: JSON.stringify({ name: "Film", percent: 42, speedKBps: 1, etaSeconds: null, state: "stoppedDL", hash: fullOne }) }));
  try {
    assert.deepEqual(await lookUpDownload(fullOne, "hub-token", new AbortController().signal, hub.url), { name: "Film", percent: 42 });
    assert.deepEqual(hub.seen, [{ url: `/media/downloads/${fullOne}`, authorization: "Bearer hub-token", method: "GET" }]);
    await assert.rejects(lookUpDownload("fedcba9876543210fedcba9876543210fedcba98", "hub-token", new AbortController().signal, hub.url));
  } finally {
    await hub.close();
  }
});

test("only the hub's own 'no torrent' answer means it doesn't have it; any other reply is a failed lookup", async () => {
  assert.equal(noTorrentError, "No torrent with that hash");
  const replies = [
    { status: 404, body: JSON.stringify({ error: noTorrentError }), expected: null },
    { status: 404, body: JSON.stringify({ message: `Route GET:/media/downloads/${fullOne} not found`, error: "Not Found", statusCode: 404 }), expected: "failed" },
    { status: 500, body: JSON.stringify({ error: noTorrentError }), expected: "failed" },
    { status: 500, body: JSON.stringify({ name: "Film", percent: 42, hash: fullOne }), expected: "failed" },
    { status: 401, body: JSON.stringify({ error: "Unauthorized" }), expected: "failed" },
    { status: 200, body: "not json", expected: "failed" },
    { status: 200, body: JSON.stringify({ name: 5, percent: 1 }), expected: "failed" },
    { status: 200, body: JSON.stringify({ name: "Film", hash: fullOne }), expected: "failed" },
    { status: 200, body: JSON.stringify({ name: "Film", percent: 42 }), expected: "failed" },
    { status: 200, body: JSON.stringify(null), expected: "failed" },
  ];
  for (const { status, body, expected } of replies) {
    const hub = await fakeHub(() => ({ status, body }));
    try {
      const result = await lookUpDownload(fullOne, "hub-token", new AbortController().signal, hub.url).catch(() => "failed");
      assert.deepEqual(result, expected, `${status} ${body}`);
    } finally {
      await hub.close();
    }
  }
});

test("a lookup that's redirected fails rather than following it, even to a server with the right answer", async () => {
  const elsewhere = await fakeHub(() => ({ status: 200, body: JSON.stringify({ name: "Film", percent: 42, hash: fullOne }) }));
  const redirecting = createServer((_request, response) => {
    response.writeHead(302, { location: `${elsewhere.url}/media/downloads/${fullOne}` });
    response.end();
  });
  await new Promise<void>((resolve) => redirecting.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(redirecting.address() as AddressInfo).port}`;
    await assert.rejects(lookUpDownload(fullOne, "hub-token", new AbortController().signal, url));
    assert.deepEqual(elsewhere.seen, []);
  } finally {
    await new Promise((resolve) => redirecting.close(resolve));
    await elsewhere.close();
  }
});

test("a lookup that's called off stops waiting for the hub", async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const started = Date.now();
    await assert.rejects(lookUpDownload(fullOne, "hub-token", AbortSignal.timeout(50), url));
    assert.ok(Date.now() - started < 1000);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the hub's tools that ask eBay live are left out of Jarvis's read tools, so his questions can't use up the deal watcher's daily calls", () => {
  for (const tool of ["get_deal_search_cuts", "lookup_deal_categories", "lookup_deal_details", "explain_deal_listing"]) assert.ok(!hubReadTools.includes(tool), tool);
  assert.ok(hubReadTools.every((tool) => tool.startsWith("get_")));
  assert.equal(new Set(hubReadTools).size, hubReadTools.length);
});

test("run_chore asks yes or no, saying which chore and what it does, and never repeats a job it doesn't know", () => {
  assert.equal(actionQuestion("run_chore", { job: "rebuild-api" }), "Jarvis wants to rebuild the API and restart it (the rebuild-api chore). Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("run_chore", { job: "run-tests" }), "Jarvis wants to run the hub's tests in throwaway containers (the run-tests chore). Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("run_chore", { job: "pull-images" }), "Jarvis wants to download newer images for the services, without restarting anything (the pull-images chore). Type yes to let him, or anything else to stop it");
  for (const input of [{ job: "reboot now" }, { job: "toString" }, {}, null]) assert.equal(actionQuestion("run_chore", input), "Jarvis wants to run a chore the runner won't accept. Type yes to let him, or anything else to stop it");
  assert.equal(isHubAction("run_chore"), true);
});

test("run_chore for a session says which session it starts or stops", () => {
  assert.equal(actionQuestion("run_chore", { job: "session-start-docker" }), "Jarvis wants to start the Claude Code session docker. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("run_chore", { job: "session-stop-brain" }), "Jarvis wants to stop the Claude Code session brain. Type yes to let him, or anything else to stop it");
  for (const job of ["session-start-Docker", "session-start-", "session-start-a b"]) assert.equal(actionQuestion("run_chore", { job }), "Jarvis wants to run a chore the runner won't accept. Type yes to let him, or anything else to stop it", job);
});

test("with the wall's pages on, the hub's MCP server is told to give open_wall_page, which runs without a yes and is never an action", () => {
  const paged = { ...hubServerFor("t"), wallPages: true };
  assert.deepEqual(hubWallTools, ["open_wall_page"]);
  assert.deepEqual(actionsEnv(paged), { MCP_ACTIONS: "off", MCP_WALL_PAGES: "on" });
  assert.deepEqual(hubServerEnv({ ...hubServerFor("t", true), wallPages: true }), { API_TOKEN: "t", MCP_ACTIONS: "on", MCP_WALL_PAGES: "on" });
  assert.deepEqual(actionsEnv({ ...hubServerFor("t"), wallPages: false }), { MCP_ACTIONS: "off" }, "off, the server isn't told at all, so it uses its own default, off");
  assert.deepEqual(allowedHubTools(paged), [...hubReadTools, "open_wall_page"]);
  assert.deepEqual(allowedHubTools({ ...hubServerFor("t", true), wallPages: true }), [...hubReadTools, "open_wall_page", ...hubNoYesTools, ...hubActionTools]);
  assert.equal(isHubAction("open_wall_page"), false);
  assert.equal(needsHubYes({ musicYes: "all" }, "open_wall_page"), false);
});
