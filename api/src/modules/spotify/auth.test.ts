import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { accountsMs, authorizeUrl, challengeFor, createSpotifyAuth, newState, newVerifier, notSignedIn, readGrant, readRedirectUri, readSaved, refreshEarlyMs, signInMs, signInUrl, spotifyScopes, SpotifyProblem, tokensFile, tokenUrl, validClientId } from "./auth.js";
import { formOf, grantReply, standInClientId, standInRedirect, standInSpotify, type StandInHandler } from "./stand-in.js";

const settings = { clientId: standInClientId, redirectUri: standInRedirect };

function counting() {
  let n = 0;
  return (size: number) => Buffer.alloc(size, ++n);
}

async function setUp(handle: StandInHandler, start = 1_000_000) {
  const dir = await mkdtemp(join(tmpdir(), "spotify-auth-"));
  const spotify = standInSpotify(handle);
  const clock = { at: start };
  const lines: string[] = [];
  const make = () => createSpotifyAuth({ settings, dir, fetcher: spotify.fetcher, now: () => clock.at, random: counting(), log: (line) => lines.push(line) });
  return { dir, spotify, clock, lines, auth: make(), make };
}

function stateOf(url: string): string {
  return new URL(url).searchParams.get("state") ?? "";
}

function problem(status: number, message: string | RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof SpotifyProblem, String(error));
    assert.equal(error.status, status);
    if (typeof message === "string") assert.equal(error.message, message);
    else assert.match(error.message, message);
    return true;
  };
}

test("the verifier and state are long random base64url, and the challenge is the verifier's SHA-256 as RFC 7636 shows", () => {
  const verifier = newVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]{86}$/);
  assert.notEqual(newVerifier(), verifier);
  assert.match(newState(), /^[A-Za-z0-9_-]{32}$/);
  assert.equal(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("the sign-in address asks Spotify's authorize page for a code with PKCE, every scope, the redirect and the state", () => {
  const url = new URL(signInUrl(settings, "the-state", "the-challenge"));
  assert.equal(`${url.origin}${url.pathname}`, authorizeUrl);
  assert.equal(authorizeUrl, "https://accounts.spotify.com/authorize");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    response_type: "code",
    client_id: standInClientId,
    scope: spotifyScopes.join(" "),
    redirect_uri: standInRedirect,
    state: "the-state",
    code_challenge_method: "S256",
    code_challenge: "the-challenge",
  });
  assert.equal(spotifyScopes.length, 10);
  assert.ok(!spotifyScopes.some((scope) => scope.includes("email")));
});

test("client IDs and redirect addresses are read strictly", () => {
  assert.deepEqual([validClientId(standInClientId), validClientId(standInClientId.toUpperCase()), validClientId("")], [true, false, false]);
  assert.equal(readRedirectUri("https://hub.home/spotify.html"), "https://hub.home/spotify.html");
  assert.equal(readRedirectUri("http://127.0.0.1:8888/callback"), "http://127.0.0.1:8888/callback");
  for (const bad of ["http://hub.home/x", "https://localhost/x", "http://127.0.0.1/x", "https://hub.home", "https://hub.home/x?y", "https://hub.home/x#y", "not a url"]) assert.equal(readRedirectUri(bad), null, bad);
});

test("starting a sign-in gives Spotify's address with a fresh state and the verifier's challenge, valid for 10 minutes", async () => {
  const { auth, clock, spotify, lines } = await setUp(() => ({ status: 500 }));
  const started = auth.startSignIn();
  const url = new URL(started.url);
  assert.equal(url.searchParams.get("code_challenge"), challengeFor(Buffer.alloc(64, 1).toString("base64url")));
  assert.equal(url.searchParams.get("state"), Buffer.alloc(24, 2).toString("base64url"));
  assert.equal(started.expiresAt, new Date(clock.at + signInMs).toISOString());
  assert.equal(signInMs, 600_000);
  assert.equal((await auth.status()).signingIn, true);
  assert.equal(spotify.seen.length, 0);
  assert.deepEqual(lines, ["spotify: a sign-in was started, waiting 10 minutes for Spotify's answer"]);
});

test("finishing swaps the code for tokens with the verifier and no secret, saves the refresh token readable only by the API, and signs in", async () => {
  const { auth, dir, spotify, clock } = await setUp(() => grantReply("access-one", "refresh-one"));
  const state = stateOf(auth.startSignIn().url);
  clock.at += 1000;
  assert.deepEqual(await auth.finishSignIn({ code: "the-code", state }), { signedIn: true, scopes: [...spotifyScopes] });
  assert.equal(spotify.seen.length, 1);
  const [asked] = spotify.seen;
  assert.equal(asked.url.href, tokenUrl);
  assert.equal(tokenUrl, "https://accounts.spotify.com/api/token");
  assert.equal(asked.method, "POST");
  assert.equal(asked.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(asked.headers.authorization, undefined);
  assert.deepEqual([asked.redirect, asked.signal], ["error", true]);
  assert.deepEqual(formOf(asked), { grant_type: "authorization_code", code: "the-code", redirect_uri: standInRedirect, client_id: standInClientId, code_verifier: Buffer.alloc(64, 1).toString("base64url") });
  const saved = JSON.parse(await readFile(join(dir, tokensFile), "utf8"));
  assert.deepEqual(saved, { refreshToken: "refresh-one", scopes: [...spotifyScopes], signedInAt: new Date(clock.at).toISOString(), refreshedAt: null });
  assert.equal((await stat(join(dir, tokensFile))).mode & 0o777, 0o600);
  const status = await auth.status();
  assert.deepEqual(status, { signedIn: true, scopes: [...spotifyScopes], signedInAt: new Date(clock.at).toISOString(), refreshedAt: null, signingIn: false, problem: null });
  assert.equal(await auth.accessToken(), "access-one");
  assert.equal(spotify.seen.length, 1);
});

test("an answer is used once, only for the sign-in that's waiting, and only within 10 minutes", async () => {
  const { auth, spotify, clock } = await setUp(() => grantReply("access-one", "refresh-one"));
  await assert.rejects(auth.finishSignIn({ code: "c", state: "nothing-waiting" }), problem(400, "That answer isn't for the sign-in the hub is waiting for: start again from the Spotify page"));
  const state = stateOf(auth.startSignIn().url);
  await assert.rejects(auth.finishSignIn({ code: "c", state: `${state}x` }), problem(400, /isn't for the sign-in/));
  await assert.rejects(auth.finishSignIn({ code: "c", state: state.slice(1) }), problem(400, /isn't for the sign-in/));
  clock.at += signInMs + 1;
  await assert.rejects(auth.finishSignIn({ code: "c", state }), problem(400, "That sign-in was started over 10 minutes ago: start again"));
  await assert.rejects(auth.finishSignIn({ code: "c", state }), problem(400, /isn't for the sign-in/));
  const again = stateOf(auth.startSignIn().url);
  await auth.finishSignIn({ code: "c", state: again });
  await assert.rejects(auth.finishSignIn({ code: "c", state: again }), problem(400, /isn't for the sign-in/));
  assert.equal(spotify.seen.length, 1);
});

test("a newer sign-in replaces one that's waiting, so the older state no longer works", async () => {
  const { auth, lines } = await setUp(() => grantReply("a", "r"));
  const first = stateOf(auth.startSignIn().url);
  const second = stateOf(auth.startSignIn().url);
  assert.notEqual(first, second);
  await assert.rejects(auth.finishSignIn({ code: "c", state: first }), problem(400, /isn't for the sign-in/));
  assert.ok(lines.includes("spotify: a sign-in that was waiting was replaced by a new one"));
});

test("when Spotify answers with an error, nothing is asked or saved, and the sign-in is over", async () => {
  const { auth, spotify, dir } = await setUp(() => grantReply("a", "r"));
  const state = stateOf(auth.startSignIn().url);
  await assert.rejects(auth.finishSignIn({ state, error: "access_denied" }), problem(400, "Spotify didn't sign in (access_denied), so nothing was saved"));
  assert.equal(spotify.seen.length, 0);
  await assert.rejects(readFile(join(dir, tokensFile)), { code: "ENOENT" });
  const odd = stateOf(auth.startSignIn().url);
  await assert.rejects(auth.finishSignIn({ state: odd, error: "<script>" }), problem(400, "Spotify didn't sign in (an error), so nothing was saved"));
  const none = stateOf(auth.startSignIn().url);
  await assert.rejects(auth.finishSignIn({ state: none }), problem(400, "Spotify's answer had no code in it"));
});

test("a refused code says to check the redirect address, and a reply without tokens isn't saved", async () => {
  const refused = await setUp(() => ({ status: 400, body: { error: "invalid_grant", error_description: "Invalid redirect URI" } }));
  await assert.rejects(refused.auth.finishSignIn({ code: "c", state: stateOf(refused.auth.startSignIn().url) }), problem(502, "Spotify refused the sign-in code (400, invalid_grant): check SPOTIFY_REDIRECT_URI is exactly the address in the app's settings, then start again"));
  assert.equal((await refused.auth.status()).signedIn, false);
  for (const reply of [grantReply("access", null), { status: 200, body: { access_token: "x" } }, { status: 200, text: "not json" }, { status: 200, body: { ...(grantReply("a b", "r").body as object) } }]) {
    const odd = await setUp(() => reply);
    await assert.rejects(odd.auth.finishSignIn({ code: "c", state: stateOf(odd.auth.startSignIn().url) }), problem(502, "Spotify's reply to the sign-in didn't have the tokens in it"));
    await assert.rejects(readFile(join(odd.dir, tokensFile)), { code: "ENOENT" });
  }
});

test("before the access token runs out it's renewed with the refresh token and client ID, keeping the refresh token unless Spotify sends a new one", async () => {
  let reply = grantReply("access-one", "refresh-one");
  const { auth, spotify, clock, dir } = await setUp(() => reply);
  await auth.finishSignIn({ code: "c", state: stateOf(auth.startSignIn().url) });
  clock.at += 3600_000 - refreshEarlyMs - 1;
  assert.equal(await auth.accessToken(), "access-one");
  assert.equal(spotify.seen.length, 1);
  clock.at += 1;
  reply = grantReply("access-two", null);
  assert.equal(await auth.accessToken(), "access-two");
  assert.equal(spotify.seen.length, 2);
  assert.deepEqual(formOf(spotify.seen[1]), { grant_type: "refresh_token", refresh_token: "refresh-one", client_id: standInClientId });
  assert.equal(spotify.seen[1].headers.authorization, undefined);
  let saved = JSON.parse(await readFile(join(dir, tokensFile), "utf8"));
  assert.deepEqual([saved.refreshToken, saved.refreshedAt], ["refresh-one", new Date(clock.at).toISOString()]);
  clock.at += 3600_000;
  reply = grantReply("access-three", "refresh-two");
  assert.equal(await auth.accessToken(), "access-three");
  saved = JSON.parse(await readFile(join(dir, tokensFile), "utf8"));
  assert.equal(saved.refreshToken, "refresh-two");
  clock.at += 3600_000;
  reply = grantReply("access-four", null);
  await auth.accessToken();
  assert.equal(formOf(spotify.seen[3]).refresh_token, "refresh-two");
});

test("two asks at once share one renewal, and forgetting the access token makes the next ask renew", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  const { auth, spotify } = await setUp(async () => {
    if (first) {
      first = false;
      return grantReply("access-one", "refresh-one");
    }
    await gate;
    return grantReply("access-two", null);
  });
  await auth.finishSignIn({ code: "c", state: stateOf(auth.startSignIn().url) });
  auth.forgetAccess();
  const both = Promise.all([auth.accessToken(), auth.accessToken()]);
  release();
  assert.deepEqual(await both, ["access-two", "access-two"]);
  assert.equal(spotify.seen.length, 2);
});

test("a saved sign-in from before a restart is read and renewed on first use", async () => {
  const first = await setUp(() => grantReply("access-one", "refresh-one"));
  await first.auth.finishSignIn({ code: "c", state: stateOf(first.auth.startSignIn().url) });
  const later = createSpotifyAuth({ settings, dir: first.dir, fetcher: first.spotify.fetcher, now: () => first.clock.at, log: (line) => first.lines.push(line) });
  assert.equal((await later.status()).signedIn, true);
  assert.equal(await later.accessToken(), "access-one");
  assert.equal(formOf(first.spotify.seen[1]).grant_type, "refresh_token");
  assert.ok(first.lines.includes("spotify: the saved sign-in was read, with 10 scopes"));
});

test("when Spotify no longer accepts the refresh token, the saved sign-in is removed and it says to sign in again", async () => {
  let reply = grantReply("access-one", "refresh-one");
  const { auth, clock, dir } = await setUp(() => reply);
  await auth.finishSignIn({ code: "c", state: stateOf(auth.startSignIn().url) });
  clock.at += 3600_000;
  reply = { status: 400, body: { error: "invalid_grant" } };
  const removed = "Spotify no longer accepts the saved sign-in, so it was removed: sign in again";
  await assert.rejects(auth.accessToken(), problem(409, removed));
  await assert.rejects(readFile(join(dir, tokensFile)), { code: "ENOENT" });
  assert.deepEqual([(await auth.status()).signedIn, (await auth.status()).problem], [false, removed]);
  await assert.rejects(auth.accessToken(), problem(409, removed));
});

test("other refusals to renew keep the saved sign-in to try again", async () => {
  for (const [reply, status, message] of [
    [{ status: 500 }, 502, "Spotify refused to renew the sign-in (500)"],
    [{ status: 400, body: { error: "invalid_client" } }, 502, "Spotify refused to renew the sign-in (400)"],
    [{ status: 429, headers: { "retry-after": "30" } }, 429, "Spotify asked the hub to wait before signing in again"],
    [{ status: 200, body: { nope: true } }, 502, "Spotify's reply to renewing the sign-in wasn't a token"],
  ] as const) {
    let answer: { status: number; body?: unknown; headers?: Record<string, string> } = grantReply("access-one", "refresh-one");
    const { auth, clock, dir } = await setUp(() => answer);
    await auth.finishSignIn({ code: "c", state: stateOf(auth.startSignIn().url) });
    clock.at += 3600_000;
    answer = reply;
    await assert.rejects(auth.accessToken(), problem(status, message));
    assert.equal(JSON.parse(await readFile(join(dir, tokensFile), "utf8")).refreshToken, "refresh-one");
    assert.equal((await auth.status()).signedIn, true);
  }
});

test("Spotify not answering in time or at all is said plainly", async () => {
  const slow = await setUp(() => grantReply("a", "r"));
  const timing = createSpotifyAuth({ settings, dir: slow.dir, fetcher: async () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" })) });
  await assert.rejects(timing.finishSignIn({ code: "c", state: stateOf(timing.startSignIn().url) }), problem(504, `Spotify (accounts.spotify.com) didn't answer within ${accountsMs / 1000} seconds`));
  const down = createSpotifyAuth({ settings, dir: slow.dir, fetcher: async () => Promise.reject(new TypeError("fetch failed")) });
  await assert.rejects(down.finishSignIn({ code: "c", state: stateOf(down.startSignIn().url) }), problem(502, "Couldn't reach Spotify (accounts.spotify.com)"));
  const big = createSpotifyAuth({ settings, dir: slow.dir, fetcher: async () => new Response("x".repeat(1024 * 1024 + 1), { status: 200 }) });
  await assert.rejects(big.finishSignIn({ code: "c", state: stateOf(big.startSignIn().url) }), problem(502, "Spotify's reply was too big"));
});

test("without a saved sign-in there's no access token, and a file the hub didn't write is reported, not used", async () => {
  const { auth, dir, make } = await setUp(() => grantReply("a", "r"));
  await assert.rejects(auth.accessToken(), problem(409, notSignedIn));
  assert.deepEqual(await auth.status(), { signedIn: false, scopes: null, signedInAt: null, refreshedAt: null, signingIn: false, problem: null });
  await writeFile(join(dir, tokensFile), "{ not json");
  const broken = make();
  const status = await broken.status();
  assert.deepEqual([status.signedIn, status.problem], [false, "The saved sign-in, spotify/tokens.json, isn't one the hub wrote, so sign in again"]);
  await assert.rejects(broken.accessToken(), problem(409, /isn't one the hub wrote/));
});

test("signing out removes the saved sign-in and anything waiting", async () => {
  const { auth, dir } = await setUp(() => grantReply("access-one", "refresh-one"));
  await auth.finishSignIn({ code: "c", state: stateOf(auth.startSignIn().url) });
  auth.startSignIn();
  await auth.signOut();
  await assert.rejects(readFile(join(dir, tokensFile)), { code: "ENOENT" });
  assert.deepEqual(await auth.status(), { signedIn: false, scopes: null, signedInAt: null, refreshedAt: null, signingIn: false, problem: null });
  await assert.rejects(auth.accessToken(), problem(409, notSignedIn));
  await auth.signOut();
});

test("a sign-in that can't be saved says so and isn't kept", async () => {
  const { lines } = await setUp(() => grantReply("a", "r"));
  const missing = createSpotifyAuth({ settings, dir: join(tmpdir(), "no-such-spotify-folder", "deeper"), fetcher: standInSpotify(() => grantReply("access-one", "refresh-one")).fetcher, log: (line) => lines.push(line) });
  await assert.rejects(missing.finishSignIn({ code: "c", state: stateOf(missing.startSignIn().url) }), problem(500, "The sign-in couldn't be saved in spotify/tokens.json: check the spotify folder is there and the API may write to it"));
  assert.equal((await missing.status()).signedIn, false);
  assert.ok(lines.includes("spotify: the sign-in couldn't be saved (ENOENT)"));
});

test("the log says what happened in numbers and words, and never holds a token, code, verifier, state or the client ID", async () => {
  let reply = grantReply("access-secret-one", "refresh-secret-one");
  const { auth, clock, lines } = await setUp(() => reply);
  const started = auth.startSignIn().url;
  const state = stateOf(started);
  const verifier = Buffer.alloc(64, 1).toString("base64url");
  await auth.finishSignIn({ code: "code-secret", state });
  clock.at += 3600_000;
  reply = grantReply("access-secret-two", "refresh-secret-two");
  await auth.accessToken();
  clock.at += 3600_000;
  reply = { status: 400, body: { error: "invalid_grant" } };
  await auth.accessToken().catch(() => undefined);
  await auth.signOut();
  assert.deepEqual(lines, [
    "spotify: a sign-in was started, waiting 10 minutes for Spotify's answer",
    "spotify: signed in after 0 ms, with 10 scopes",
    "spotify: the access token was renewed in 0 ms, for 3600 seconds, with a new refresh token",
    "spotify: refreshing the access token was refused with 400 (invalid_grant) after 0 ms",
    "spotify: signed out, though it wasn't signed in",
  ]);
  const all = lines.join("\n");
  for (const secret of ["access-secret", "refresh-secret", "code-secret", state, verifier, standInClientId, challengeFor(verifier)]) assert.ok(!all.includes(secret), secret);
});

test("readGrant and readSaved take only what the hub expects", () => {
  assert.deepEqual(readGrant({ access_token: "abcdefghijk", token_type: "Bearer", expires_in: 3600, refresh_token: "lmnopqrstuv", scope: "a b" }), { accessToken: "abcdefghijk", expiresInSeconds: 3600, refreshToken: "lmnopqrstuv", scopes: ["a", "b"] });
  for (const odd of [null, [], { access_token: "short" }, { access_token: "abcdefghijk", expires_in: 3600, token_type: "mac" }, { access_token: "abcdefghijk", expires_in: 3.5 }, { access_token: "abcdefghijk", expires_in: 10 }, { access_token: "abcdefghijk", expires_in: 3600, refresh_token: 5 }]) assert.equal(readGrant(odd), null, JSON.stringify(odd));
  assert.deepEqual(readSaved(JSON.stringify({ refreshToken: "abcdefghijk", scopes: ["a-b"], signedInAt: "2026-11-27T00:00:00.000Z", refreshedAt: null })), { refreshToken: "abcdefghijk", scopes: ["a-b"], signedInAt: "2026-11-27T00:00:00.000Z", refreshedAt: null });
  for (const odd of ["", "[]", '{"refreshToken":"x"}', JSON.stringify({ refreshToken: "abcdefghijk", scopes: ["A B"], signedInAt: "2026-11-27T00:00:00.000Z", refreshedAt: null }), JSON.stringify({ refreshToken: "abcdefghijk", scopes: [], signedInAt: "later", refreshedAt: null })]) assert.equal(readSaved(odd), null, odd);
});
