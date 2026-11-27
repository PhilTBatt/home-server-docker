import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { buildApp as buildRealApp } from "./app.js";
import { createChangeFeed } from "./modules/trains/changes.js";
import type { Config } from "./config.js";
import type { DealWatcher } from "./modules/deals/watcher.js";
import { createExpiryChecker } from "./modules/expiry/checker.js";
import { createTries } from "./modules/system/doctor.js";
import { createWatchers } from "./modules/watchers/watchers.js";
import { createModes } from "./modules/modes/modes.js";
import { createReminders } from "./modules/reminders/reminders.js";

const config: Config = {
  apiToken: "test-token",
  qbitApiKey: "test-qbit-key",
  jellyfinApiKey: "test-jellyfin-key",
  ntfyTopic: "test-topic",
  healthcheckUrl: "https://hc-ping.com/test",
  deals: { seen: "memory", ebayEnvironment: "production", ebayClientId: "test-ebay-id", ebayClientSecret: "test-ebay-secret", ai: false },
  trains: { key: "test-rail-key", from: "AAA", to: "BBB", boardUrl: "https://api1.raildata.org.uk/test-board" },
  trainAlerts: { days: ["mon", "wed"], start: 420, end: 510, reminder: 405 },
  catchUp: { repos: [], token: "" },
  modes: { bedtimeFrom: null, bedtimeUntil: null },
  phone: { ring: "once", seconds: 30 },
  features: { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true }
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
  ["POST", "/deals/check"],
  ["POST", "/phone/find"],
  ["GET", "/trains"],
  ["GET", "/trains/changes"],
  ["GET", "/expiry"],
  ["GET", "/system/doctor"],
  ["GET", "/watchers"],
  ["POST", "/watchers"],
  ["DELETE", "/watchers/0123abcd"],
  ["GET", "/catch-up"]
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
  const features = { alerts: true, heartbeat: false, dailySummary: true, memoryInbox: false, memoryUpload: false, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true };
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
    cuts: async () => ({ status: "limit" }),
    cutsRefusal: () => "limit",
    explain: async () => ({ status: "limit" }),
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
test("finding the phone is a route of the hub's, which says when it's switched off", async () => {
  const app = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, findPhone: false } } });
  const response = await app.inject({ method: "POST", url: "/phone/find", headers: goodHeader });
  assert.deepEqual([response.statusCode, response.json()], [404, { error: "Finding the phone is switched off" }]);
});

test("train changes come from the feed the hub was given, only with train alerts on", async () => {
  const feed = createChangeFeed("run-1");
  feed.add(["The 07:14 is cancelled."], new Date());
  const on = await buildRealApp({ logger: false, config, trainChanges: feed });
  const given = await on.inject({ method: "GET", url: "/trains/changes", headers: goodHeader });
  assert.deepEqual([given.statusCode, given.json().run, given.json().changes.length], [200, "run-1", 1]);
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, trainAlerts: false, expiryAlerts: false } }, trainChanges: feed });
  const refused = await off.inject({ method: "GET", url: "/trains/changes", headers: goodHeader });
  assert.deepEqual([refused.statusCode, refused.json()], [404, { error: "Train alerts are switched off" }]);
});

test("train times are a route of the hub's, which says when they're switched off", async () => {
  const app = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, trains: false } } });
  const response = await app.inject({ method: "GET", url: "/trains", headers: goodHeader });
  assert.deepEqual([response.statusCode, response.json()], [404, { error: "Train times are switched off" }]);
});

function fakeExpiryChecker(fail = false) {
  let reads = 0;
  const checker = createExpiryChecker({
    load: async () => {
      reads++;
      if (fail) throw new Error("expiry/items.json isn't valid JSON");
      return [{ name: "Alpha", date: "2099-01-01", note: null }];
    },
    store: { load: async () => new Map(), save: async () => undefined },
    send: async () => undefined,
  });
  return { checker, reads: () => reads };
}

test("the expiry list is a route of the hub's, given only the checker it was handed and only with the switch on", async () => {
  const { checker, reads } = fakeExpiryChecker();
  const on = await buildRealApp({ logger: false, config, expiryChecker: checker });
  const given = await on.inject({ method: "GET", url: "/expiry", headers: goodHeader });
  assert.deepEqual([given.statusCode, given.json().items.map((item: { name: string }) => item.name)], [200, ["Alpha"]]);
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, expiryAlerts: false } }, expiryChecker: checker });
  const refused = await off.inject({ method: "GET", url: "/expiry", headers: goodHeader });
  assert.deepEqual([refused.statusCode, refused.json()], [404, { error: "Expiry alerts are switched off" }]);
  assert.equal(reads(), 1);
});

test("a problem with the expiry list shows in the alerts with the deal watcher's, only while the switch is on", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const { checker } = fakeExpiryChecker(true);
  await checker.list(new Date()).catch(() => undefined);
  const on = await buildRealApp({ logger: false, config, expiryChecker: checker });
  const problems = (await on.inject({ method: "GET", url: "/system/alerts", headers: goodHeader })).json().problems as { code: string; message: string }[];
  assert.deepEqual(problems.filter((problem) => problem.code.startsWith("expiry")), [{ code: "expiry-list", message: "The expiry list has a problem: expiry/items.json isn't valid JSON." }]);
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, expiryAlerts: false } }, expiryChecker: checker });
  const offProblems = (await off.inject({ method: "GET", url: "/system/alerts", headers: goodHeader })).json().problems as { code: string }[];
  assert.equal(offProblems.some((problem) => problem.code.startsWith("expiry")), false);
});

test("the server doctor is a route of the hub's, asking qBittorrent and Jellyfin with their keys and the board only with train times on", async () => {
  const asked: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    asked.push(`${url} ${new Headers(init?.headers).get("Authorization") ?? new Headers(init?.headers).get("x-apikey")} ${init?.signal instanceof AbortSignal}`);
    if (url.startsWith("http://qbittorrent")) return Response.json([]);
    if (url.startsWith("http://jellyfin")) return Response.json({ MovieCount: 1, SeriesCount: 2, EpisodeCount: 3 });
    return new Response(null, { status: 503 });
  });
  const { checker } = fakeExpiryChecker();
  const app = await buildRealApp({ logger: false, config, expiryChecker: checker, doctor: { inbox: async () => 0 } });
  const response = await app.inject({ method: "GET", url: "/system/doctor", headers: goodHeader });
  assert.equal(response.statusCode, 200);
  const byName = Object.fromEntries(response.json().checks.map((check: { name: string; state: string; detail: string }) => [check.name, check]));
  assert.deepEqual([byName.qBittorrent.state, byName.Jellyfin.detail, byName["Expiry list"].state], ["ok", "Answering, with 1 movie and 2 series.", "ok"]);
  assert.equal(byName["Brain inbox"].detail, "No notes waiting.", "the inbox it was handed is used, not the real folder");
  assert.equal(byName["Train times"].state, "problem");
  assert.deepEqual(asked.filter((line) => !line.startsWith("https://api1.raildata.org.uk")), ["http://qbittorrent:8081/api/v2/torrents/info?filter=downloading Bearer test-qbit-key true", 'http://jellyfin:8096/Items/Counts MediaBrowser Token="test-jellyfin-key" true']);
  assert.equal(asked.filter((line) => line.startsWith("https://api1.raildata.org.uk/test-board")).length, 1);
  assert.ok(!response.body.includes("test-qbit-key") && !response.body.includes("test-jellyfin-key") && !response.body.includes("test-rail-key") && !response.body.includes("test-topic") && !response.body.includes("hc-ping"));
  asked.length = 0;
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, trains: false, expiryAlerts: false, memoryInbox: false } }, expiryChecker: checker });
  const offReport = (await off.inject({ method: "GET", url: "/system/doctor", headers: goodHeader })).json();
  assert.equal(asked.some((line) => line.startsWith("https://")), false);
  assert.deepEqual(offReport.checks.filter((check: { state: string }) => check.state === "off").map((check: { name: string }) => check.name), ["Backups", "Brain inbox", "Train times", "Expiry list", "Watchers"]);
});

test("the server doctor shows the heartbeat's and the alerts' latest outcomes from the tries it was handed", async () => {
  mock.method(globalThis, "fetch", async () => Response.json([]));
  const tries = { heartbeat: createTries(), alerts: createTries() };
  tries.heartbeat.failed(new Date("2026-11-26T11:00:00Z"));
  const app = await buildRealApp({ logger: false, config, tries, doctor: { inbox: async () => 0, trains: async () => ({}) } });
  const report = (await app.inject({ method: "GET", url: "/system/doctor", headers: goodHeader })).json();
  const byName = Object.fromEntries(report.checks.map((check: { name: string; state: string; detail: string }) => [check.name, check]));
  assert.deepEqual([byName.Heartbeat.state, byName.Heartbeat.detail, byName["Phone alerts"].detail], ["problem", "The last ping to Healthchecks.io, 26 Nov at 11:00, failed.", "No alert check has finished since the API started."]);
});

function quietWatchers() {
  return createWatchers({
    sources: { finished: async () => [], disk: async () => ({ freeGB: 50, totalGB: 100 }), answering: { qbittorrent: async () => [], jellyfin: async () => ({}) } },
    send: async () => undefined,
    makeId: () => "0123abcd",
  });
}

test("watchers are a route of the hub's, given only the watchers it was handed and only with the switch on", async () => {
  const watching = quietWatchers();
  const on = await buildRealApp({ logger: false, config, watchers: watching });
  const added = await on.inject({ method: "POST", url: "/watchers", headers: goodHeader, payload: { kind: "disk-free-below", percent: 10 } });
  assert.deepEqual([added.statusCode, added.json().id], [200, "0123abcd"]);
  const listed = await on.inject({ method: "GET", url: "/watchers", headers: goodHeader });
  assert.deepEqual(listed.json().watchers.map((watcher: { what: string }) => watcher.what), ["free disk space to fall below 10%"]);
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, watchers: false } }, watchers: watching });
  for (const [method, url] of [["GET", "/watchers"], ["POST", "/watchers"], ["DELETE", "/watchers/0123abcd"]] as const) {
    const refused = await off.inject({ method, url, headers: goodHeader, ...(method === "POST" ? { payload: { kind: "disk-free-below", percent: 20 } } : {}) });
    assert.deepEqual([refused.statusCode, refused.json()], [404, { error: "Watchers are switched off" }], `${method} ${url}`);
  }
  assert.equal(watching.list().length, 1);
});

test("the server doctor's Watchers check reads the watchers the hub was handed, and is off without them or with the switch off", async () => {
  mock.method(globalThis, "fetch", async () => Response.json([]));
  const watching = quietWatchers();
  watching.add({ watch: { kind: "service-answering", service: "jellyfin" }, hours: 24 }, new Date());
  const watchersCheck = async (app: Awaited<ReturnType<typeof buildRealApp>>) => (await app.inject({ method: "GET", url: "/system/doctor", headers: goodHeader })).json().checks.find((check: { name: string }) => check.name === "Watchers");
  const doctor = { inbox: async () => 0, trains: async () => ({}) };
  assert.deepEqual(await watchersCheck(await buildRealApp({ logger: false, config, watchers: watching, doctor })), { name: "Watchers", state: "ok", detail: "Watching for 1 thing.", next: null });
  assert.equal((await watchersCheck(await buildRealApp({ logger: false, config, doctor }))).state, "off");
  assert.equal((await watchersCheck(await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, watchers: false } }, watchers: watching, doctor }))).state, "off");
});

test("catch-up is a route of the hub's, asking GitHub for the listed repos with the token and reusing the doctor's and the modules' reads", async () => {
  const asked: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    asked.push(`${url} ${new Headers(init?.headers).get("authorization") ?? "-"} ${init?.redirect ?? "-"}`);
    if (url.startsWith("https://api.github.com/")) return Response.json([{ sha: "1".repeat(40), commit: { message: "Add the thing", committer: { date: "2026-11-26T09:00:00Z" } } }]);
    if (url.startsWith("http://qbittorrent")) return Response.json([]);
    if (url.startsWith("http://jellyfin")) return Response.json({ MovieCount: 1, SeriesCount: 2, EpisodeCount: 3 });
    return new Response(null, { status: 503 });
  });
  const token = "github_pat_test_0123456789abcdefghij";
  const { checker } = fakeExpiryChecker();
  const watching = quietWatchers();
  watching.add({ watch: { kind: "service-answering", service: "jellyfin" }, hours: 24 }, new Date());
  const app = await buildRealApp({ logger: false, config: { ...config, catchUp: { repos: ["alpha/one"], token } }, expiryChecker: checker, watchers: watching, doctor: { inbox: async () => 2 } });
  const response = await app.inject({ method: "GET", url: "/catch-up?days=3", headers: goodHeader });
  assert.equal(response.statusCode, 200);
  const report = response.json();
  assert.equal(report.days, 3);
  assert.deepEqual(report.repos.map((repo: { repo: string; count: number }) => [repo.repo, repo.count]), [["alpha/one", 1]]);
  assert.deepEqual([report.waiting.inbox, report.waiting.watchers], [{ notes: 2 }, { watching: ["Jellyfin to answer"] }]);
  assert.ok(Array.isArray(report.waiting.expiring.items));
  assert.equal(report.server.state, "problem", "the doctor's line is there, with the board refusing");
  assert.match(report.server.summary, /Train times/);
  const github = asked.filter((line) => line.startsWith("https://api.github.com/"));
  assert.equal(github.length, 1);
  assert.match(github[0], /^https:\/\/api\.github\.com\/repos\/alpha\/one\/commits\?since=\S+&per_page=30 Bearer github_pat_test_0123456789abcdefghij error$/);
  assert.ok(asked.some((line) => line.startsWith("http://qbittorrent")), "the doctor asks qBittorrent as it always does");
  for (const secret of [token, "test-qbit-key", "test-jellyfin-key", "test-rail-key", "test-topic", "hc-ping"]) assert.equal(response.body.includes(secret), false, secret);
});

test("the doctor and catch-up asked together, as the phone page does, ask qBittorrent, Jellyfin and the departure board once between them", async () => {
  const asked: string[] = [];
  mock.method(globalThis, "fetch", async (url: string) => {
    asked.push(url);
    if (url.startsWith("http://qbittorrent")) return Response.json([]);
    if (url.startsWith("http://jellyfin")) return Response.json({ MovieCount: 1, SeriesCount: 2, EpisodeCount: 3 });
    return new Response(null, { status: 503 });
  });
  const app = await buildRealApp({ logger: false, config, doctor: { inbox: async () => 0 } });
  const count = (start: string) => asked.filter((url) => url.startsWith(start)).length;
  const [doctor, catchUp] = await Promise.all([app.inject({ method: "GET", url: "/system/doctor", headers: goodHeader }), app.inject({ method: "GET", url: "/catch-up", headers: goodHeader })]);
  assert.deepEqual([doctor.statusCode, catchUp.statusCode], [200, 200]);
  assert.deepEqual([count("http://qbittorrent"), count("http://jellyfin"), count("https://api1.raildata.org.uk/test-board")], [1, 1, 1]);
  assert.equal(catchUp.json().server.summary, doctor.json().summary);
  const again = await app.inject({ method: "GET", url: "/system/doctor", headers: goodHeader });
  assert.equal(again.statusCode, 200);
  assert.deepEqual([count("http://qbittorrent"), count("http://jellyfin"), count("https://api1.raildata.org.uk/test-board")], [1, 1, 2], "a second look within 10 seconds reuses what answered, and asks the board again because it refused");
});

test("catch-up is a 404 with its switch off, and its parts are off with their own switches off, even when handed what they'd read", async () => {
  mock.method(globalThis, "fetch", async () => Response.json([]));
  const { checker } = fakeExpiryChecker();
  const watching = quietWatchers();
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, catchUp: false } }, watchers: watching });
  const refused = await off.inject({ method: "GET", url: "/catch-up", headers: goodHeader });
  assert.deepEqual([refused.statusCode, refused.json()], [404, { error: "Catch-up is switched off" }]);
  const partsOff = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, memoryInbox: false, expiryAlerts: false, watchers: false } }, expiryChecker: checker, watchers: watching, doctor: { inbox: async () => 2 } });
  const report = (await partsOff.inject({ method: "GET", url: "/catch-up", headers: goodHeader })).json();
  assert.deepEqual([report.waiting.inbox, report.waiting.expiring, report.waiting.watchers], [{ off: "MEMORY_INBOX" }, { off: "EXPIRY_ALERTS" }, { off: "WATCHERS" }]);
  assert.deepEqual([report.repos, report.commitsAskedAt], [[], null]);
});

test("catch-up gives the doctor's line even when a service it asks doesn't answer, because the doctor's checks wait less than catch-up waits for it", async () => {
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.startsWith("http://qbittorrent")) return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    if (url.startsWith("http://jellyfin")) return Response.json({ MovieCount: 1, SeriesCount: 2, EpisodeCount: 3 });
    return new Response(null, { status: 503 });
  });
  const app = await buildRealApp({ logger: false, config, doctor: { inbox: async () => 0 } });
  const report = (await app.inject({ method: "GET", url: "/catch-up", headers: goodHeader })).json();
  assert.equal(report.server.state, "problem");
  assert.match(report.server.summary, /qBittorrent/);
});

test("modes are a route of the hub's, behind the token, given only the modes it was handed and only with the switch on", async () => {
  const handed = createModes({ store: { load: async () => "missing", save: async () => {} }, settings: config.modes, topic: "test-topic", send: async () => {} });
  await handed.load(new Date("2026-11-27T12:00:00.000Z"));
  const app = await buildRealApp({ logger: false, config, modes: handed });
  assert.equal((await app.inject({ method: "GET", url: "/mode" })).statusCode, 401);
  const reply = await app.inject({ method: "GET", url: "/mode", headers: goodHeader });
  assert.deepEqual([reply.statusCode, reply.json().mode], [200, "normal"]);
  const posted = await app.inject({ method: "POST", url: "/mode", headers: goodHeader, payload: { mode: "gaming", by: "phone" } });
  assert.equal(posted.json().mode, "gaming");
  assert.equal(handed.view().mode, "gaming");
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, modes: false } }, modes: handed });
  assert.deepEqual((await off.inject({ method: "GET", url: "/mode", headers: goodHeader })).json(), { error: "Modes are switched off" });
  const none = await buildRealApp({ logger: false, config });
  assert.equal((await none.inject({ method: "GET", url: "/mode", headers: goodHeader })).statusCode, 404);
});

test("reminders are a route of the hub's, behind the token, given only the reminders it was handed and only with the switch on", async () => {
  const handed = createReminders({ store: { load: async () => "missing", save: async () => {} }, send: async () => {} });
  await handed.load(new Date());
  const app = await buildRealApp({ logger: false, config, reminders: handed });
  assert.equal((await app.inject({ method: "GET", url: "/reminders" })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/reminders/due" })).statusCode, 401);
  const posted = await app.inject({ method: "POST", url: "/reminders", headers: goodHeader, payload: { text: "Stretch", at: new Date(Date.now() + 60_000).toISOString() } });
  assert.equal(posted.statusCode, 200);
  assert.equal(handed.list().length, 1);
  const off = await buildRealApp({ logger: false, config: { ...config, features: { ...config.features, reminders: false } }, reminders: handed });
  assert.deepEqual((await off.inject({ method: "GET", url: "/reminders", headers: goodHeader })).json(), { error: "Reminders are switched off" });
  const none = await buildRealApp({ logger: false, config });
  assert.equal((await none.inject({ method: "GET", url: "/reminders/due", headers: goodHeader })).statusCode, 404);
});
