import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { buildApp as buildRealApp } from "./app.js";
import type { Config } from "./config.js";
import type { DealWatcher } from "./modules/deals/watcher.js";

const config: Config = {
  apiToken: "test-token",
  qbitApiKey: "test-qbit-key",
  jellyfinApiKey: "test-jellyfin-key",
  ntfyTopic: "test-topic",
  healthcheckUrl: "https://hc-ping.com/test",
  deals: { seen: "memory", ebayEnvironment: "production", ebayClientId: "test-ebay-id", ebayClientSecret: "test-ebay-secret", ai: false },
  features: { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true }
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
  ["GET", `/media/downloads/${hash}`],
  ["POST", `/media/downloads/${hash}/stop`],
  ["POST", `/media/downloads/${hash}/start`],
  ["GET", "/media/library"],
  ["POST", "/media/library/scan"],
  ["POST", "/auth/logout"],
  ["GET", "/system/wifi-reconnects"],
  ["GET", "/system/status"],
  ["GET", "/system/alerts"],
  ["GET", "/system/features"],
  ["GET", "/memory/inbox"],
  ["POST", "/memory/inbox"],
  ["GET", "/deals/status"],
  ["GET", "/deals/searches"],
  ["GET", "/deals/matches"],
  ["GET", "/deals/searches/optiplex/hidden"],
  ["POST", "/deals/check"]
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
  const features = { alerts: true, heartbeat: false, dailySummary: true, memoryInbox: false, memoryUpload: false, deals: true };
  const app = await buildRealApp({ logger: false, config: { ...config, features } });
  const response = await app.inject({ method: "GET", url: "/system/features", headers: goodHeader });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), features);
});

test("the app serves /memory/inbox, and switched off it says so", async () => {
  const off = { ...config.features, memoryInbox: false };
  const app = await buildRealApp({ logger: false, config: { ...config, features: off } });
  const response = await app.inject({ method: "GET", url: "/memory/inbox", headers: goodHeader });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "The brain inbox is switched off" });
});

test("switched on, /memory/inbox tries to count rather than saying it's off", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/memory/inbox", headers: goodHeader });
  assert.doesNotMatch(response.body, /switched off/);
});

test("the app trusts Caddy's forwarded protocol, so an HTTPS login gets an HTTPS-only cookie", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "x-forwarded-proto": "https" },
    payload: { token: "test-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["set-cookie"]), /; Secure(;|$)/);
});

test("an HTTP login to the app still gets a cookie it can use", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "POST", url: "/auth/login", payload: { token: "test-token" } });
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(String(response.headers["set-cookie"]), /; Secure(;|$)/);
});

const dealRoutes = [
  ["GET", "/deals/status"],
  ["GET", "/deals/searches"],
  ["GET", "/deals/matches"],
  ["POST", "/deals/check"],
] as const;

function fakeDealWatcher() {
  const runs: boolean[] = [];
  const watcher: DealWatcher = {
    run: async (_now, force = false) => {
      runs.push(force);
      return { ran: true, checked: 2, alerts: 1, failed: 0, unsent: false };
    },
    problems: () => [],
    status: () => ({ lastRun: null, callsToday: 3, callsPerDay: 1000, alertsToday: 1, alertsPerDay: 60, note: null, problems: [], quiet: null, digest: null }),
    searches: () => [],
    hidden: () => null,
    matches: () => [],
    snooze: async () => true,
    wake: async () => true,
    full: async () => ({ status: "unknown" }),
    detailNames: async () => ({ status: "limit" }),
    categories: async () => ({ status: "limit" }),
    categoryDetails: async () => ({ status: "limit" }),
  };
  return { watcher, runs };
}

test("the app serves the deal routes when the switch is on and it's given a watcher", async () => {
  const { watcher, runs } = fakeDealWatcher();
  const app = await buildRealApp({ logger: false, config, dealWatcher: watcher });
  for (const [method, url] of dealRoutes) {
    const response = await app.inject({ method, url, headers: goodHeader });
    assert.equal(response.statusCode, 200, `${method} ${url}`);
  }
  assert.deepEqual(runs, [true]);
});

test("with the DEALS switch off, every deal route says so and the watcher is never touched", async () => {
  const { watcher, runs } = fakeDealWatcher();
  const app = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, deals: false } }, dealWatcher: watcher });
  for (const [method, url] of dealRoutes) {
    const response = await app.inject({ method, url, headers: goodHeader });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
    assert.deepEqual(response.json(), { error: "The deal watcher is switched off" });
  }
  assert.deepEqual(runs, []);
});

test("without a watcher the deal routes say it's switched off, whatever the switch says", async () => {
  const app = await buildApp({ logger: false });
  for (const [method, url] of dealRoutes) {
    const response = await app.inject({ method, url, headers: goodHeader });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
  }
});

test("a check can't be started with a wrong token or the cookie of someone logged out", async () => {
  const { watcher, runs } = fakeDealWatcher();
  const app = await buildRealApp({ logger: false, config, dealWatcher: watcher });
  for (const headers of [{}, { authorization: "Bearer wrong-token" }, { authorization: "test-token" }, { cookie: "hub_token=" }]) {
    const response = await app.inject({ method: "POST", url: "/deals/check", headers });
    assert.equal(response.statusCode, 401);
  }
  assert.deepEqual(runs, []);
});

test("no deal route ever shows the eBay keys, the ntfy topic or the API token", async () => {
  const { watcher } = fakeDealWatcher();
  const app = await buildRealApp({ logger: false, config, dealWatcher: watcher });
  for (const [method, url] of dealRoutes) {
    const response = await app.inject({ method, url, headers: goodHeader });
    for (const secret of ["test-ebay-id", "test-ebay-secret", "test-topic", "test-token"]) {
      assert.ok(!response.body.includes(secret), `${secret} in ${url}`);
      assert.ok(!JSON.stringify(response.headers).includes(secret), `${secret} in the headers of ${url}`);
    }
  }
});

test("the deal status says where seen listings are kept and which eBay it talks to", async () => {
  const { watcher } = fakeDealWatcher();
  const app = await buildRealApp({ logger: false, config, dealWatcher: watcher });
  const response = await app.inject({ method: "GET", url: "/deals/status", headers: goodHeader });
  assert.deepEqual(response.json(), { lastRun: null, callsToday: 3, callsPerDay: 1000, alertsToday: 1, alertsPerDay: 60, note: null, problems: [], quiet: null, digest: null, seen: "memory", environment: "production", ai: false });
});

test("a deal watcher problem shows in /system/alerts, so it reaches the phone like any other", async () => {
  const { watcher } = fakeDealWatcher();
  watcher.problems = () => [{ code: "deals-source", message: "The deal watcher can't check its searches: eBay refused the keys." }];
  const app = await buildRealApp({ logger: false, config, dealWatcher: watcher });
  const alerts = (await app.inject({ method: "GET", url: "/system/alerts", headers: goodHeader })).json();
  assert.equal(alerts.ok, false);
  assert.deepEqual(alerts.problems.at(-1), { code: "deals-source", message: "The deal watcher can't check its searches: eBay refused the keys." });
});

test("with the DEALS switch off, the watcher's problems are never asked for or shown", async () => {
  const { watcher } = fakeDealWatcher();
  let asked = 0;
  watcher.problems = () => {
    asked += 1;
    return [{ code: "deals-state", message: "The deal watcher couldn't save its state, so it may repeat or miss alerts after a restart." }];
  };
  const app = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, deals: false } }, dealWatcher: watcher });
  const alerts = (await app.inject({ method: "GET", url: "/system/alerts", headers: goodHeader })).json();
  assert.ok(!JSON.stringify(alerts).includes("deal watcher"));
  assert.equal(asked, 0);
});

test("with no watcher, /system/alerts works as before", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({ method: "GET", url: "/system/alerts", headers: goodHeader });
  assert.equal(response.statusCode, 200);
  assert.ok(!response.body.includes("deal watcher"));
});

test("the app passes the DEALS_AI switch on to the deal routes, and they still need the token", async () => {
  const { watcher } = fakeDealWatcher();
  const off = await buildRealApp({ logger: false, config, dealWatcher: watcher });
  assert.equal((await off.inject({ method: "GET", url: "/deals/ai/matches", headers: goodHeader })).statusCode, 403);
  const on = await buildRealApp({ logger: false, config: { ...config, deals: { ...config.deals, ai: true } }, dealWatcher: watcher });
  const response = await on.inject({ method: "GET", url: "/deals/ai/matches", headers: goodHeader });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().searches, []);
  assert.equal((await on.inject({ method: "GET", url: "/deals/status", headers: goodHeader })).json().ai, true);
  for (const url of ["/deals/ai/matches", "/deals/ai/listing/110000000001", "/deals/listing/110000000001", "/deals/details?q=ddr4"]) {
    assert.equal((await on.inject({ method: "GET", url })).statusCode, 401, url);
  }
  for (const url of ["/deals/searches/optiplex/snooze", "/deals/searches/optiplex/wake"]) {
    assert.equal((await on.inject({ method: "POST", url })).statusCode, 401, url);
  }
});