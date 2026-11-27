import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { SpotifyProblem, type SpotifyAuth } from "./auth.js";
import type { SpotifyClient } from "./client.js";
import { readPage, readSearch, spotify, switchedOffError, type SpotifyParts } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true };
const trackUri = "spotify:track:4iV5W9uYEdYUVa79Axb7Rh";
const albumUri = "spotify:album:4aawyAB9vmqN3uQ7FjRGTy";
const episodeUri = "spotify:episode:512ojhOuo1ktJprKbVcKyQ";
const playlistId = "37i9dQZF1DXcBWIGoYBM5M";
const deviceId = "0d1841b0976bae2a3a310dd74c0f3df354899bc8";

function fakeParts(fail?: SpotifyProblem | Error) {
  const calls: string[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push(`${name}${args.length === 0 ? "" : ` ${JSON.stringify(args)}`}`);
    if (fail !== undefined) throw fail;
    return { done: true as const };
  };
  const auth: SpotifyAuth = {
    startSignIn: () => (calls.push("startSignIn"), { url: "https://accounts.spotify.com/authorize?x=1", expiresAt: "2026-11-27T00:10:00.000Z" }),
    finishSignIn: async (answer) => (record("finishSignIn", answer), { signedIn: true as const, scopes: ["a"] }),
    signOut: async () => void record("signOut"),
    status: async () => (record("status"), { signedIn: false, scopes: null, signedInAt: null, refreshedAt: null, signingIn: false, problem: null }),
    accessToken: async () => "unused",
    forgetAccess: () => undefined,
  };
  const client: SpotifyClient = {
    playing: async () => (record("playing"), { active: false, playing: false, item: null, progressMs: null, device: null, shuffle: null, repeat: null, context: null }),
    devices: async () => (record("devices"), { devices: [] }),
    queue: async () => (record("queue"), { current: null, next: [] }),
    search: async (...args) => (record("search", ...args), {}),
    playlists: async (...args) => (record("playlists", ...args), { playlists: [], total: 0, more: false }),
    play: async (...args) => record("play", ...args),
    pause: async (...args) => record("pause", ...args),
    next: async (...args) => record("next", ...args),
    previous: async (...args) => record("previous", ...args),
    seek: async (...args) => record("seek", ...args),
    volume: async (...args) => record("volume", ...args),
    shuffle: async (...args) => record("shuffle", ...args),
    repeat: async (...args) => record("repeat", ...args),
    addToQueue: async (...args) => record("addToQueue", ...args),
    transfer: async (...args) => record("transfer", ...args),
    addToPlaylist: async (...args) => (record("addToPlaylist", ...args), { added: 1, playlist: "x" }),
    save: async (...args) => (record("save", ...args), { saved: 1 }),
  };
  return { parts: { auth, client } satisfies SpotifyParts, calls };
}

function buildApp(features: Features, parts?: SpotifyParts) {
  const app = Fastify();
  app.register(spotify, { prefix: "/spotify", features, spotify: parts });
  return app;
}

const everyRoute: [string, string, unknown][] = [
  ["GET", "/spotify/status", undefined],
  ["POST", "/spotify/sign-in", undefined],
  ["POST", "/spotify/callback", { state: "abc", code: "def" }],
  ["POST", "/spotify/sign-out", undefined],
  ["GET", "/spotify/playing", undefined],
  ["GET", "/spotify/devices", undefined],
  ["GET", "/spotify/queue", undefined],
  ["GET", "/spotify/search?q=words", undefined],
  ["GET", "/spotify/playlists", undefined],
  ["POST", "/spotify/play", {}],
  ["POST", "/spotify/pause", {}],
  ["POST", "/spotify/next", {}],
  ["POST", "/spotify/previous", {}],
  ["POST", "/spotify/seek", { positionMs: 1000 }],
  ["POST", "/spotify/volume", { percent: 50 }],
  ["POST", "/spotify/shuffle", { on: true }],
  ["POST", "/spotify/repeat", { mode: "off" }],
  ["POST", "/spotify/queue", { uri: trackUri }],
  ["POST", "/spotify/transfer", { device: deviceId }],
  ["POST", `/spotify/playlists/${playlistId}/add`, { uris: [trackUri] }],
  ["POST", "/spotify/library/save", { uris: [trackUri] }],
];

test("every route answers 404, switched off, while SPOTIFY is off or nothing was set up, even with a bad body", async () => {
  const { parts, calls } = fakeParts();
  for (const app of [buildApp({ ...allOn, spotify: false }, parts), buildApp(allOn)]) {
    for (const [method, url, payload] of [...everyRoute, ["POST", "/spotify/volume", { percent: 900 }] as [string, string, unknown]]) {
      const reply = await app.inject({ method: method as "GET" | "POST", url, ...(payload === undefined ? {} : { payload: payload as object }) });
      assert.deepEqual([reply.statusCode, reply.json()], [404, { error: switchedOffError }], `${method} ${url}`);
    }
  }
  assert.deepEqual(calls, []);
});

test("while it's on, every route reaches the part it's for", async () => {
  const { parts, calls } = fakeParts();
  const app = buildApp(allOn, parts);
  for (const [method, url, payload] of everyRoute) {
    const reply = await app.inject({ method: method as "GET" | "POST", url, ...(payload === undefined ? {} : { payload: payload as object }) });
    assert.equal(reply.statusCode, 200, `${method} ${url}: ${reply.body}`);
  }
  assert.deepEqual(calls, [
    "status",
    "startSignIn",
    'finishSignIn [{"state":"abc","code":"def"}]',
    "signOut",
    "playing",
    "devices",
    "queue",
    'search ["words",["track","album","artist","playlist"],5]',
    "playlists [20,0]",
    "play [null,null]",
    "pause [null]",
    "next [null]",
    "previous [null]",
    "seek [1000,null]",
    "volume [50,null]",
    "shuffle [true,null]",
    'repeat ["off",null]',
    `addToQueue ["${trackUri}",null]`,
    `transfer ["${deviceId}",false]`,
    `addToPlaylist ["${playlistId}",["${trackUri}"],null]`,
    `save [["${trackUri}"]]`,
  ]);
});

test("sign-in gives Spotify's address, and signing out says so", async () => {
  const { parts } = fakeParts();
  const app = buildApp(allOn, parts);
  assert.deepEqual((await app.inject({ method: "POST", url: "/spotify/sign-in" })).json(), { url: "https://accounts.spotify.com/authorize?x=1", expiresAt: "2026-11-27T00:10:00.000Z" });
  assert.deepEqual((await app.inject({ method: "POST", url: "/spotify/sign-out" })).json(), { signedIn: false });
});

test("the controls with nothing to say take an empty request too, and a device by its id", async () => {
  const { parts, calls } = fakeParts();
  const app = buildApp(allOn, parts);
  for (const url of ["/spotify/play", "/spotify/pause", "/spotify/next", "/spotify/previous"]) {
    const reply = await app.inject({ method: "POST", url });
    assert.equal(reply.statusCode, 200, `${url}: ${reply.body}`);
  }
  await app.inject({ method: "POST", url: "/spotify/play", payload: { uri: albumUri, device: deviceId } });
  await app.inject({ method: "POST", url: "/spotify/transfer", payload: { device: deviceId, play: true } });
  assert.deepEqual(calls.slice(-2), [`play ["${albumUri}","${deviceId}"]`, `transfer ["${deviceId}",true]`]);
});

test("each control refuses what Spotify wouldn't take or the hub doesn't allow, without asking Spotify", async () => {
  const { parts, calls } = fakeParts();
  const app = buildApp(allOn, parts);
  const refused: [string, unknown][] = [
    ["/spotify/play", { uri: "spotify:track:short" }],
    ["/spotify/play", { uri: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh" }],
    ["/spotify/play", { uri: "spotify:show:4iV5W9uYEdYUVa79Axb7Rh" }],
    ["/spotify/play", { device: "bad id" }],
    ["/spotify/play", { device: "x".repeat(129) }],
    ["/spotify/pause", { device: "a;b" }],
    ["/spotify/seek", {}],
    ["/spotify/seek", { positionMs: -1 }],
    ["/spotify/seek", { positionMs: 1.5 }],
    ["/spotify/seek", { positionMs: 86_400_001 }],
    ["/spotify/volume", { percent: 101 }],
    ["/spotify/volume", { percent: -1 }],
    ["/spotify/volume", { percent: "loud" }],
    ["/spotify/shuffle", { on: "yes" }],
    ["/spotify/repeat", { mode: "all" }],
    ["/spotify/queue", { uri: albumUri }],
    ["/spotify/queue", {}],
    ["/spotify/transfer", {}],
    ["/spotify/transfer", { device: deviceId, play: "yes" }],
    [`/spotify/playlists/${playlistId}/add`, { uris: [] }],
    [`/spotify/playlists/${playlistId}/add`, { uris: [albumUri] }],
    [`/spotify/playlists/${playlistId}/add`, { uris: [trackUri, trackUri] }],
    [`/spotify/playlists/${playlistId}/add`, { uris: Array.from({ length: 101 }, (_, n) => `spotify:track:${String(n).padStart(22, "a")}`) }],
    [`/spotify/playlists/${playlistId}/add`, { uris: [trackUri], position: -1 }],
    ["/spotify/playlists/not-an-id/add", { uris: [trackUri] }],
    ["/spotify/library/save", { uris: [] }],
    ["/spotify/library/save", { uris: ["spotify:artist:0TnOYISbd1XYRBk9myaseg"] }],
    ["/spotify/library/save", { uris: Array.from({ length: 41 }, (_, n) => `spotify:track:${String(n).padStart(22, "a")}`) }],
    ["/spotify/callback", { code: "x" }],
    ["/spotify/callback", { state: "has space", code: "x" }],
  ];
  for (const [url, payload] of refused) {
    const reply = await app.inject({ method: "POST", url, payload: payload as object });
    assert.equal(reply.statusCode, 400, `${url} ${JSON.stringify(payload)}: ${reply.body}`);
  }
  for (const [url, payload] of [
    [`/spotify/playlists/${playlistId}/add`, { uris: [trackUri, episodeUri], position: 0 }],
    ["/spotify/library/save", { uris: [trackUri, albumUri, episodeUri, `spotify:playlist:${playlistId}`, "spotify:show:4iV5W9uYEdYUVa79Axb7Rh"] }],
    ["/spotify/seek", { positionMs: 0 }],
    ["/spotify/volume", { percent: 0 }],
    ["/spotify/play", { uri: `spotify:playlist:${playlistId}` }],
    ["/spotify/play", { uri: "spotify:artist:0TnOYISbd1XYRBk9myaseg" }],
    ["/spotify/queue", { uri: episodeUri }],
  ] as [string, unknown][]) {
    const reply = await app.inject({ method: "POST", url, payload: payload as object });
    assert.equal(reply.statusCode, 200, `${url} ${JSON.stringify(payload)}: ${reply.body}`);
  }
  assert.equal(calls.length, 7);
});

test("fields a route doesn't know are dropped before it runs, never passed on", async () => {
  const { parts, calls } = fakeParts();
  const app = buildApp(allOn, parts);
  assert.equal((await app.inject({ method: "POST", url: "/spotify/play", payload: { uri: trackUri, extra: 1 } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/spotify/callback", payload: { state: "abc", code: "x", redirect_uri: "https://elsewhere.example/" } })).statusCode, 200);
  assert.deepEqual(calls, [`play ["${trackUri}",null]`, 'finishSignIn [{"state":"abc","code":"x"}]']);
});

test("search takes its words, kinds and limit from the query, and says what's wrong with them", async () => {
  assert.deepEqual(readSearch({ q: " some words " }), { query: "some words", types: ["track", "album", "artist", "playlist"], limit: 5 });
  assert.deepEqual(readSearch({ q: "x", types: "album,track", limit: "10" }), { query: "x", types: ["album", "track"], limit: 10 });
  assert.equal(readSearch({}), "q must be what to search for, 1 to 200 characters of plain text");
  for (const query of [{ q: "" }, { q: "   " }, { q: "a\u0000b" }, { q: "x".repeat(201) }, { q: ["a", "b"] }]) assert.equal(readSearch(query), "q must be what to search for, 1 to 200 characters of plain text", JSON.stringify(query));
  for (const types of ["show", "track,track", "track,", "TRACK"]) assert.equal(readSearch({ q: "x", types }), "types must be some of track, album, artist, playlist, with commas between", types);
  for (const limit of ["0", "11", "1.5", "five", "-1"]) assert.equal(readSearch({ q: "x", limit }), "limit must be a whole number from 1 to 10", limit);
  const { parts } = fakeParts();
  const reply = await buildApp(allOn, parts).inject({ method: "GET", url: "/spotify/search?q=x&limit=50" });
  assert.deepEqual([reply.statusCode, reply.json()], [400, { error: "limit must be a whole number from 1 to 10" }]);
});

test("the playlists page takes a limit up to 50 and an offset up to 1000", async () => {
  assert.deepEqual([readPage({}), readPage({ limit: "50", offset: "1000" })], [{ limit: 20, offset: 0 }, { limit: 50, offset: 1000 }]);
  assert.equal(readPage({ limit: "51" }), "limit must be a whole number from 1 to 50");
  assert.equal(readPage({ limit: "0" }), "limit must be a whole number from 1 to 50");
  assert.equal(readPage({ offset: "1001" }), "offset must be a whole number from 0 to 1000");
  assert.equal(readPage({ offset: ["1", "2"] }), "limit and offset must be given once each");
});

test("a problem from Spotify keeps its status and plain words, with Spotify's wait as a Retry-After", async () => {
  const waiting = fakeParts(new SpotifyProblem(429, "Spotify asked the hub to wait", 30));
  const reply = await buildApp(allOn, waiting.parts).inject({ method: "POST", url: "/spotify/pause" });
  assert.deepEqual([reply.statusCode, reply.json(), reply.headers["retry-after"]], [429, { error: "Spotify asked the hub to wait", waitSeconds: 30 }, "30"]);
  const none = fakeParts(new SpotifyProblem(409, "No Spotify device is active"));
  const noDevice = await buildApp(allOn, none.parts).inject({ method: "GET", url: "/spotify/playing" });
  assert.deepEqual([noDevice.statusCode, noDevice.json(), noDevice.headers["retry-after"]], [409, { error: "No Spotify device is active" }, undefined]);
});

test("anything else that goes wrong is a 500 that gives nothing away", async () => {
  const { parts } = fakeParts(new Error("refresh-token-abc leaked in a message"));
  const reply = await buildApp(allOn, parts).inject({ method: "POST", url: "/spotify/next" });
  assert.deepEqual([reply.statusCode, reply.json()], [500, { error: "Something went wrong talking to Spotify" }]);
});
