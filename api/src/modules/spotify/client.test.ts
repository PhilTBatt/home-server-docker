import assert from "node:assert/strict";
import { test } from "node:test";
import { notSignedIn, SpotifyProblem, type SignInStatus, type SpotifyAuth } from "./auth.js";
import { apiBase, apiMs, createSpotifyClient, devModeHint, itemOf, noDevice, playBody, playingOf, queueMost, refusal, searchOf } from "./client.js";
import { standInSpotify, type SeenRequest, type StandInHandler, type StandInReply } from "./stand-in.js";

const trackUri = "spotify:track:4iV5W9uYEdYUVa79Axb7Rh";
const albumUri = "spotify:album:4aawyAB9vmqN3uQ7FjRGTy";
const playlistId = "37i9dQZF1DXcBWIGoYBM5M";
const deviceId = "0d1841b0976bae2a3a310dd74c0f3df354899bc8";

function fakeAuth(options: { signedIn?: boolean; signedInAt?: string } = {}) {
  let n = 1;
  const forgot: number[] = [];
  const auth: SpotifyAuth = {
    startSignIn: () => ({ url: "", expiresAt: "" }),
    finishSignIn: async () => ({ signedIn: true, scopes: [] }),
    signOut: async () => undefined,
    status: async (): Promise<SignInStatus> => ({ signedIn: options.signedIn ?? true, scopes: [], signedInAt: options.signedInAt ?? "2026-11-27T00:00:00.000Z", refreshedAt: null, signingIn: false, problem: null }),
    accessToken: async () => {
      if (options.signedIn === false) throw new SpotifyProblem(409, notSignedIn);
      return `access-${n}`;
    },
    forgetAccess: () => {
      forgot.push(n);
      n += 1;
    },
  };
  return { auth, forgot };
}

function setUp(handle: StandInHandler, authOptions: { signedIn?: boolean; signedInAt?: string } = {}) {
  const spotify = standInSpotify(handle);
  const { auth, forgot } = fakeAuth(authOptions);
  const lines: string[] = [];
  const client = createSpotifyClient({ auth, fetcher: spotify.fetcher, now: () => 0, log: (line) => lines.push(line) });
  return { client, seen: spotify.seen, lines, forgot };
}

function routed(routes: Record<string, StandInReply | ((request: SeenRequest) => StandInReply)>): StandInHandler {
  return (request) => {
    const key = `${request.method} ${request.url.pathname.replace(/^\/v1/, "")}`;
    const reply = routes[key];
    if (reply === undefined) return { status: 599, body: { unexpected: key } };
    return typeof reply === "function" ? reply(request) : reply;
  };
}

function called(request: SeenRequest): string {
  const query = request.url.search;
  return `${request.method} ${request.url.pathname}${query}${request.body === "" ? "" : ` ${request.body}`}`;
}

function problem(status: number, message: string | RegExp, waitSeconds: number | null = null) {
  return (error: unknown) => {
    assert.ok(error instanceof SpotifyProblem, String(error));
    assert.equal(error.status, status);
    if (typeof message === "string") assert.equal(error.message, message);
    else assert.match(error.message, message);
    assert.equal(error.waitSeconds, waitSeconds);
    return true;
  };
}

const track = { type: "track", name: "A Song", uri: trackUri, duration_ms: 200_000, artists: [{ name: "First Artist" }, { name: "Second\u0007Artist" }], album: { name: "An Album" } };
const episode = { type: "episode", name: "An Episode", uri: "spotify:episode:512ojhOuo1ktJprKbVcKyQ", duration_ms: 1_800_000, show: { name: "A Show" } };
const device = { id: deviceId, is_active: true, is_private_session: false, is_restricted: false, name: "Kitchen speaker", type: "Speaker", volume_percent: 59, supports_volume: true };

test("every call goes to Spotify's Web API with the access token, never following a redirect, and with a time limit", async () => {
  const { client, seen } = setUp(routed({ "GET /me/player/devices": { status: 200, body: { devices: [] } } }));
  await client.devices();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url.href, `${apiBase}/me/player/devices`);
  assert.equal(apiBase, "https://api.spotify.com/v1");
  assert.deepEqual([seen[0].headers.authorization, seen[0].redirect, seen[0].signal], ["Bearer access-1", "error", true]);
  assert.equal(apiMs, 8000);
});

test("nothing is asked of Spotify while it isn't signed in", async () => {
  const { client, seen } = setUp(() => ({ status: 200 }), { signedIn: false });
  await assert.rejects(client.playing(), problem(409, notSignedIn));
  await assert.rejects(client.pause(undefined), problem(409, notSignedIn));
  assert.equal(seen.length, 0);
});

test("the playback state says what's playing, where, and how, with Spotify's text cleaned", async () => {
  const { client, seen } = setUp(routed({ "GET /me/player": { status: 200, body: { is_playing: true, progress_ms: 1234, shuffle_state: false, repeat_state: "context", currently_playing_type: "track", item: track, device, context: { type: "album", uri: albumUri } } } }));
  assert.deepEqual(await client.playing(), {
    active: true,
    playing: true,
    item: { kind: "track", name: "A Song", by: ["First Artist", "Second Artist"], album: "An Album", uri: trackUri, durationMs: 200_000 },
    progressMs: 1234,
    device: { id: deviceId, name: "Kitchen speaker", type: "speaker", active: true, volumePercent: 59, supportsVolume: true, restricted: false, privateSession: false },
    shuffle: false,
    repeat: "context",
    context: { kind: "album", uri: albumUri },
  });
  assert.equal(seen[0].url.searchParams.get("additional_types"), "episode");
});

test("with nothing active, Spotify's empty answer says so", async () => {
  const { client } = setUp(routed({ "GET /me/player": { status: 204 } }));
  assert.deepEqual(await client.playing(), { active: false, playing: false, item: null, progressMs: null, device: null, shuffle: null, repeat: null, context: null });
});

test("an episode is shown with its show, and things that aren't tracks or episodes, or have odd addresses, are left out", () => {
  assert.deepEqual(itemOf(episode), { kind: "episode", name: "An Episode", by: ["A Show"], album: null, uri: "spotify:episode:512ojhOuo1ktJprKbVcKyQ", durationMs: 1_800_000 });
  for (const odd of [null, { ...track, type: "ad" }, { ...track, uri: "https://evil.example/x" }, { ...track, uri: "spotify:track:abc def" }]) assert.equal(itemOf(odd), null, JSON.stringify(odd));
  assert.equal(itemOf({ ...track, name: `${"x".repeat(200)}` })?.name.length, 120);
  assert.equal(playingOf({ is_playing: true, repeat_state: "sideways" }).repeat, null);
});

test("devices list each one's id, name, type, whether it's active and its volume, leaving out an id that isn't plain", async () => {
  const { client, lines } = setUp(routed({ "GET /me/player/devices": { status: 200, body: { devices: [device, { ...device, id: "bad id;rm", is_active: false, volume_percent: null, name: "Phone" }, { ...device, id: null, volume_percent: 150 }] } } }));
  const { devices } = await client.devices();
  assert.deepEqual(
    devices.map((entry) => [entry.id, entry.name, entry.active, entry.volumePercent]),
    [
      [deviceId, "Kitchen speaker", true, 59],
      [null, "Phone", false, null],
      [null, "Kitchen speaker", true, null],
    ],
  );
  assert.ok(lines.includes("spotify: 3 devices, 2 active"));
});

test("the queue gives what's playing and at most 20 next", async () => {
  const { client } = setUp(routed({ "GET /me/player/queue": { status: 200, body: { currently_playing: track, queue: [...Array.from({ length: 25 }, () => track), null] } } }));
  const queue = await client.queue();
  assert.equal(queue.current?.uri, trackUri);
  assert.equal(queue.next.length, queueMost);
  assert.equal(queueMost, 20);
});

test("search asks for the words, kinds and limit, and gives only the kinds asked, skipping empty entries", async () => {
  const body = {
    tracks: { items: [track, null] },
    albums: { items: [{ name: "An Album", uri: albumUri, artists: [{ name: "First Artist" }], release_date: "2020-05-01", total_tracks: 12 }, { name: "Not an album", uri: trackUri }] },
    artists: { items: [{ name: "First Artist", uri: "spotify:artist:0TnOYISbd1XYRBk9myaseg" }] },
    playlists: { items: [null, { name: "A Mix", uri: `spotify:playlist:${playlistId}`, owner: { display_name: "Someone" }, items: { total: 50 } }] },
  };
  const { client, seen, lines } = setUp(routed({ "GET /search": { status: 200, body } }));
  const results = await client.search("first artist", ["track", "album", "artist", "playlist"], 5);
  assert.deepEqual(Object.fromEntries(seen[0].url.searchParams), { q: "first artist", type: "track,album,artist,playlist", limit: "5" });
  assert.deepEqual(results, {
    tracks: [{ kind: "track", name: "A Song", by: ["First Artist", "Second Artist"], album: "An Album", uri: trackUri, durationMs: 200_000 }],
    albums: [{ name: "An Album", by: ["First Artist"], uri: albumUri, year: "2020", tracks: 12 }],
    artists: [{ name: "First Artist", uri: "spotify:artist:0TnOYISbd1XYRBk9myaseg" }],
    playlists: [{ name: "A Mix", by: "Someone", uri: `spotify:playlist:${playlistId}`, tracks: 50 }],
  });
  assert.deepEqual(searchOf(body, ["artist"], 5), { artists: [{ name: "First Artist", uri: "spotify:artist:0TnOYISbd1XYRBk9myaseg" }] });
  assert.ok(lines.includes("spotify: search found 4 results across 4 kinds"));
  assert.ok(!lines.join("\n").includes("first artist"));
});

test("playlists say which are yours, asking who's signed in once for each sign-in", async () => {
  const mine = { id: playlistId, name: "Mine", uri: `spotify:playlist:${playlistId}`, owner: { id: "me-id" }, collaborative: false, public: false, items: { total: 3 } };
  const theirs = { ...mine, id: "1aaaaaaaaaaaaaaaaaaaaa", uri: "spotify:playlist:1aaaaaaaaaaaaaaaaaaaaa", name: "Theirs", owner: { id: "other" }, public: true, items: undefined, tracks: { total: 9 } };
  const { client, seen } = setUp(routed({ "GET /me": { status: 200, body: { id: "me-id" } }, "GET /me/playlists": { status: 200, body: { items: [mine, theirs, { id: "bad id" }], total: 30 } } }));
  assert.deepEqual(await client.playlists(20, 0), {
    playlists: [
      { id: playlistId, name: "Mine", uri: `spotify:playlist:${playlistId}`, yours: true, collaborative: false, public: false, tracks: 3 },
      { id: "1aaaaaaaaaaaaaaaaaaaaa", name: "Theirs", uri: "spotify:playlist:1aaaaaaaaaaaaaaaaaaaaa", yours: false, collaborative: false, public: true, tracks: 9 },
    ],
    total: 30,
    more: true,
  });
  await client.playlists(20, 20);
  assert.deepEqual(seen.map(called), ["GET /v1/me", "GET /v1/me/playlists?limit=20&offset=0", "GET /v1/me/playlists?limit=20&offset=20"]);
});

test("playing resumes with no body, plays a track by itself, and plays an album, artist or playlist as the context, on a device if named", async () => {
  const { client, seen } = setUp(routed({ "PUT /me/player/play": { status: 204 } }));
  assert.deepEqual(await client.play(undefined, undefined), { done: true });
  await client.play(trackUri, deviceId);
  await client.play(albumUri, undefined);
  await client.play("spotify:episode:512ojhOuo1ktJprKbVcKyQ", undefined);
  assert.deepEqual(seen.map(called), [
    "PUT /v1/me/player/play",
    `PUT /v1/me/player/play?device_id=${deviceId} {"uris":["${trackUri}"]}`,
    `PUT /v1/me/player/play {"context_uri":"${albumUri}"}`,
    'PUT /v1/me/player/play {"uris":["spotify:episode:512ojhOuo1ktJprKbVcKyQ"]}',
  ]);
  assert.equal(seen[1].headers["content-type"], "application/json");
  assert.equal(seen[0].headers["content-type"], undefined);
  assert.deepEqual([playBody(undefined), playBody(`spotify:playlist:${playlistId}`)], [undefined, { context_uri: `spotify:playlist:${playlistId}` }]);
});

test("each playback control asks the endpoint Spotify lists, with its value in the query", async () => {
  const { client, seen } = setUp(() => ({ status: 204 }));
  await client.pause(undefined);
  await client.next(deviceId);
  await client.previous(undefined);
  await client.seek(25_000, undefined);
  await client.volume(40, deviceId);
  await client.shuffle(true, undefined);
  await client.shuffle(false, undefined);
  await client.repeat("track", undefined);
  await client.addToQueue(trackUri, undefined);
  await client.transfer(deviceId, true);
  await client.transfer(deviceId, false);
  assert.deepEqual(seen.map(called), [
    "PUT /v1/me/player/pause",
    `POST /v1/me/player/next?device_id=${deviceId}`,
    "POST /v1/me/player/previous",
    "PUT /v1/me/player/seek?position_ms=25000",
    `PUT /v1/me/player/volume?volume_percent=40&device_id=${deviceId}`,
    "PUT /v1/me/player/shuffle?state=true",
    "PUT /v1/me/player/shuffle?state=false",
    "PUT /v1/me/player/repeat?state=track",
    "POST /v1/me/player/queue?uri=spotify%3Atrack%3A4iV5W9uYEdYUVa79Axb7Rh",
    `PUT /v1/me/player {"device_ids":["${deviceId}"],"play":true}`,
    `PUT /v1/me/player {"device_ids":["${deviceId}"],"play":false}`,
  ]);
});

test("adding to a playlist checks it's yours or collaborative first, and never adds to someone else's", async () => {
  let owner = { id: "me-id" };
  let collaborative = false;
  const { client, seen, lines } = setUp(routed({ "GET /me": { status: 200, body: { id: "me-id" } }, [`GET /playlists/${playlistId}`]: () => ({ status: 200, body: { id: playlistId, name: "Road Trip", owner, collaborative } }), [`POST /playlists/${playlistId}/items`]: { status: 201, body: { snapshot_id: "abc" } } }));
  assert.deepEqual(await client.addToPlaylist(playlistId, [trackUri, "spotify:episode:512ojhOuo1ktJprKbVcKyQ"], undefined), { added: 2, playlist: "Road Trip" });
  assert.deepEqual(seen.map(called), ["GET /v1/me", `GET /v1/playlists/${playlistId}?fields=id%2Cname%2Cowner%28id%29%2Ccollaborative`, `POST /v1/playlists/${playlistId}/items {"uris":["${trackUri}","spotify:episode:512ojhOuo1ktJprKbVcKyQ"]}`]);
  owner = { id: "someone-else" };
  await assert.rejects(client.addToPlaylist(playlistId, [trackUri], 0), problem(403, "That playlist isn't one of yours, so nothing was added"));
  assert.equal(seen.filter((request) => request.method === "POST").length, 1);
  assert.ok(lines.includes("spotify: adding to a playlist was refused because it isn't one of yours"));
  collaborative = true;
  await client.addToPlaylist(playlistId, [trackUri], 0);
  assert.equal(called(seen[seen.length - 1]), `POST /v1/playlists/${playlistId}/items {"uris":["${trackUri}"],"position":0}`);
});

test("saving goes to the library with the addresses in the query", async () => {
  const { client, seen } = setUp(routed({ "PUT /me/library": { status: 200 } }));
  assert.deepEqual(await client.save([trackUri, albumUri]), { saved: 2 });
  assert.equal(called(seen[0]), "PUT /v1/me/library?uris=spotify%3Atrack%3A4iV5W9uYEdYUVa79Axb7Rh%2Cspotify%3Aalbum%3A4aawyAB9vmqN3uQ7FjRGTy");
});

test("a 401 gets one more try with a renewed access token, and a second one is a plain refusal", async () => {
  let refusals = 1;
  const { client, seen, forgot, lines } = setUp(() => (refusals-- > 0 ? { status: 401 } : { status: 204 }));
  await client.pause(undefined);
  assert.deepEqual(seen.map((request) => request.headers.authorization), ["Bearer access-1", "Bearer access-2"]);
  assert.deepEqual(forgot, [1]);
  assert.ok(lines.includes("spotify: pause is being tried once more with a renewed access token"));
  const always = setUp(() => ({ status: 401 }));
  await assert.rejects(always.client.pause(undefined), problem(502, "Spotify didn't accept the renewed sign-in: sign in again"));
  assert.equal(always.seen.length, 2);
});

test("Spotify's refusals become plain words and fitting statuses, never its own message", async () => {
  const cases: [StandInReply, number, string | RegExp, number | null][] = [
    [{ status: 404, body: { error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } } }, 409, noDevice, null],
    [{ status: 403, body: { error: { status: 403, message: "x", reason: "PREMIUM_REQUIRED" } } }, 403, "Spotify refused it: it needs Spotify Premium", null],
    [{ status: 403, body: { error: { status: 403, message: "Restriction violated", reason: "ALREADY_PAUSED" } } }, 403, "Spotify refused it: it's already paused", null],
    [{ status: 403, body: { error: { status: 403, message: "User not registered in the Developer Dashboard" } } }, 403, `Spotify refused it (403). ${devModeHint}`, null],
    [{ status: 403, body: { error: { status: 403, reason: "SOMETHING_NEW" } } }, 403, `Spotify refused it (403). ${devModeHint}`, null],
    [{ status: 404, body: { error: { status: 404, message: "Not found" } } }, 404, "Spotify couldn't find that", null],
    [{ status: 400, body: { error: { status: 400, message: "Invalid base62 id" } } }, 400, "Spotify said the request wasn't right (400)", null],
    [{ status: 429, headers: { "retry-after": "17" } }, 429, "Spotify asked the hub to wait", 17],
    [{ status: 429, body: { reason: "QUOTA_EXCEEDED" }, headers: { "retry-after": "3600" } }, 429, "Spotify says the app's quota is used up for now", 3600],
    [{ status: 429, headers: { "retry-after": "soon" } }, 429, "Spotify asked the hub to wait", null],
    [{ status: 503 }, 502, "Spotify had a problem (503)", null],
    [{ status: 302, headers: { location: "https://elsewhere.example" } }, 502, "Spotify answered 302", null],
  ];
  for (const [reply, status, message, wait] of cases) {
    const { client } = setUp(() => reply);
    await assert.rejects(client.pause(undefined), problem(status, message, wait), JSON.stringify(reply));
  }
  assert.equal(refusal({ status: 418, body: null, waitSeconds: null }).message, "Spotify answered 418");
});

test("Spotify not answering, a redirect and an oversized reply are said plainly", async () => {
  const lines: string[] = [];
  const { auth } = fakeAuth();
  const make = (fetcher: typeof fetch) => createSpotifyClient({ auth, fetcher, log: (line) => lines.push(line) });
  await assert.rejects(make(async () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }))).pause(undefined), problem(504, "Spotify (api.spotify.com) didn't answer within 8 seconds"));
  await assert.rejects(make(async () => Promise.reject(new TypeError("fetch failed: redirect mode is set to error"))).pause(undefined), problem(502, "Couldn't reach Spotify (api.spotify.com)"));
  await assert.rejects(make(async () => new Response("x".repeat(1024 * 1024 + 1), { status: 200 })).devices(), problem(502, "Spotify's reply was too big"));
  assert.ok(lines.includes("spotify: pause failed after 0 ms: Spotify (api.spotify.com) didn't answer within 8 seconds") || lines.some((line) => line.startsWith("spotify: pause failed after")));
});

test("the log has each call's name, status and time, and never the token, the search words or a device or playlist id", async () => {
  const { client, lines } = setUp(routed({ "PUT /me/player/play": { status: 204 }, "GET /search": { status: 200, body: {} }, "GET /me": { status: 200, body: { id: "me-id" } }, [`GET /playlists/${playlistId}`]: { status: 200, body: { owner: { id: "me-id" } } }, [`POST /playlists/${playlistId}/items`]: { status: 201 }, "PUT /me/player/pause": { status: 403, body: { error: { reason: "ALREADY_PAUSED" } } } }));
  await client.play(trackUri, deviceId);
  await client.search("private words", ["track"], 3);
  await client.addToPlaylist(playlistId, [trackUri], undefined);
  await client.pause(undefined).catch(() => undefined);
  assert.deepEqual(lines, [
    "spotify: play (track) answered 204 in 0 ms",
    "spotify: search answered 200 in 0 ms",
    "spotify: search found 0 results across 1 kinds",
    "spotify: who's signed in answered 200 in 0 ms",
    "spotify: playlist owner answered 200 in 0 ms",
    "spotify: add 1 to a playlist answered 201 in 0 ms",
    "spotify: pause answered 403 in 0 ms (ALREADY_PAUSED)",
  ]);
  const all = lines.join("\n");
  for (const secret of ["access-1", "private words", deviceId, playlistId, trackUri, "me-id"]) assert.ok(!all.includes(secret), secret);
});
