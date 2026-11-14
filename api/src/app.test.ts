import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { buildApp as buildRealApp } from "./app.js";
import type { Config } from "./config.js";

const config: Config = {
  apiToken: "test-token",
  qbitApiKey: "test-qbit-key",
  jellyfinApiKey: "test-jellyfin-key",
  ntfyTopic: "test-topic",
  healthcheckUrl: "https://hc-ping.com/test",
  features: { alerts: true, heartbeat: true, dailySummary: true }
};

function buildApp(options: { logger: boolean }) {
  return buildRealApp({ ...options, config });
}

const goodHeader = { authorization: "Bearer test-token" };
const goodCookie = { hub_token: "test-token" };
const hash = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
  mock.restoreAll();
});

test("no token gets a 401 with the error body", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "Unauthorized" });
});

test("the right token in the Authorization header is let in", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/health", headers: goodHeader });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("the right token in the cookie is let in", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/health", cookies: goodCookie });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("a wrong token in the header is refused", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: "Bearer wrong-token" },
  });
  assert.equal(response.statusCode, 401);
});

test("a wrong token in the cookie is refused", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "GET",
    url: "/health",
    cookies: { hub_token: "wrong-token" },
  });
  assert.equal(response.statusCode, 401);
});

test("a good header wins over a bad cookie", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "GET",
    url: "/health",
    headers: goodHeader,
    cookies: { hub_token: "wrong-token" },
  });
  assert.equal(response.statusCode, 200);
});

const badHeaders = [
  ["a wrong token", "Bearer wrong-token"],
  ["another scheme", "Basic test-token"],
  ["the bare token with no scheme", "test-token"],
  ["Bearer with nothing after it", "Bearer "],
  ["an empty value", ""],
] as const;

for (const [label, value] of badHeaders) {
  test(`a header with ${label} is refused even with a good cookie`, async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { authorization: value },
      cookies: goodCookie,
    });
    assert.equal(response.statusCode, 401);
  });
}

const protectedRoutes = [
  ["GET", "/health"],
  ["GET", "/media/downloads"],
  ["POST", `/media/downloads/${hash}/stop`],
  ["POST", `/media/downloads/${hash}/start`],
  ["GET", "/media/library"],
  ["POST", "/media/library/scan"],
  ["POST", "/auth/logout"],
  ["GET", "/system/wifi-reconnects"],
  ["GET", "/system/status"],
  ["GET", "/system/alerts"],
  ["GET", "/system/features"]
] as const;

for (const [method, url] of protectedRoutes) {
  test(`${method} ${url} is refused without a token and calls nothing else`, async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method, url });
    assert.equal(response.statusCode, 401);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
}

test("an unknown route is a 401 without a token, so it doesn't reveal which routes exist", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/no-such-route" });
  assert.equal(response.statusCode, 401);
});

test("an unknown route is a 404 with a token", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/no-such-route", headers: goodHeader });
  assert.equal(response.statusCode, 404);
});

test("login works without a token and sets the cookie", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { token: "test-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["set-cookie"]), /^hub_token=test-token;/);
});

test("login still refuses a wrong token", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { token: "wrong-token" },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers["set-cookie"], undefined);
});

test("login still checks its body, which shows the request got past the lock", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "POST", url: "/auth/login", payload: {} });
  assert.equal(response.statusCode, 400);
});

test("only POST /auth/login is exempt: a GET to it is refused", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/auth/login" });
  assert.equal(response.statusCode, 401);
});

test("the cookie from login opens the lock, and logout clears it", async () => {
  const app = await buildApp({ logger: false });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { token: "test-token" },
  });
  const cookie = login.cookies.find((c) => c.name === "hub_token");
  assert.ok(cookie);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Strict");
  assert.equal(cookie.path, "/");

  const health = await app.inject({
    method: "GET",
    url: "/health",
    cookies: { hub_token: cookie.value },
  });
  assert.equal(health.statusCode, 200);

  const logout = await app.inject({
    method: "POST",
    url: "/auth/logout",
    cookies: { hub_token: cookie.value },
  });
  assert.equal(logout.statusCode, 200);
  const cleared = logout.cookies.find((c) => c.name === "hub_token");
  assert.ok(cleared);
  assert.equal(cleared.value, "");
  assert.equal(cleared.maxAge, 0);
});

test("the lock uses the token from the settings it's given", async () => {
  const app = await buildRealApp({ logger: false, config: { ...config, apiToken: "another-token" } });
  const oldToken = await app.inject({ method: "GET", url: "/health", headers: goodHeader });
  assert.equal(oldToken.statusCode, 401);
  const newToken = await app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: "Bearer another-token" },
  });
  assert.equal(newToken.statusCode, 200);
});

test("login uses the token from the settings it's given", async () => {
  const app = await buildRealApp({ logger: false, config: { ...config, apiToken: "another-token" } });
  const response = await app.inject({ method: "POST", url: "/auth/login", payload: { token: "another-token" } });
  assert.equal(response.statusCode, 200);
});

test("an empty token setting keeps the lock shut", async () => {
  const app = await buildRealApp({ logger: false, config: { ...config, apiToken: "" } });
  const noToken = await app.inject({ method: "GET", url: "/health" });
  const emptyBearer = await app.inject({ method: "GET", url: "/health", headers: { authorization: "Bearer " } });
  const emptyLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { token: "" } });
  assert.equal(noToken.statusCode, 401);
  assert.equal(emptyBearer.statusCode, 401);
  assert.notEqual(emptyLogin.statusCode, 200);
});

test("the media module gets its keys from the settings it's given", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json([]));
  const app = await buildRealApp({
    logger: false,
    config: { ...config, qbitApiKey: "another-qbit-key", jellyfinApiKey: "another-jellyfin-key" },
  });
  await app.inject({ method: "GET", url: "/media/downloads", headers: goodHeader });
  await app.inject({ method: "POST", url: "/media/library/scan", headers: goodHeader });
  const qbitHeaders = new Headers(fetchMock.mock.calls[0].arguments[1]?.headers);
  const jellyfinHeaders = new Headers(fetchMock.mock.calls[1].arguments[1]?.headers);
  assert.equal(qbitHeaders.get("Authorization"), "Bearer another-qbit-key");
  assert.equal(jellyfinHeaders.get("Authorization"), 'MediaBrowser Token="another-jellyfin-key"');
});

test("the features route shows the switches from the settings it's given", async () => {
  const features = { alerts: true, heartbeat: false, dailySummary: true };
  const app = await buildRealApp({ logger: false, config: { ...config, features } });
  const response = await app.inject({ method: "GET", url: "/system/features", headers: goodHeader });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), features);
});