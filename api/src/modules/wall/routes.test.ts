import assert from "node:assert/strict";
import type { EventSink } from "../events/feed.js";
import { test } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { Features, WallSettings } from "../../config.js";
import { createJarvisDesk } from "./jarvis.js";
import type { WallPicture } from "./picture.js";
import { noPageDetails, noSuchCode, noSuchPage, pageByWrong, pageDetailsFailed, pairNeedsJson, plainHttpPairing, privacyCheckMs, privateInGuest, switchedOff, tooManyWrongCodes, wall, wallCookie, wallCookieDays, wallReads } from "./routes.js";
import { pageIds } from "./pages.js";
import { createPairings, mostPairings, mostWrongCodes, pairCookie, pairingMs } from "./pairing.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true };
const settings: WallSettings = { token: "w".repeat(40), speaking: "wobble", privatePages: [], remote: false };

async function buildApp(features: Features = allOn, waitMs = 40, picture?: () => Promise<WallPicture>, logs?: string[], guard = false, events?: EventSink) {
  const clock = { at: 1_000_000 };
  const desk = createJarvisDesk();
  const codes = ["123456", "123456", "123456"];
  const pairings = createPairings({ makeCode: () => codes.shift() ?? "999999" });
  const app = Fastify({ trustProxy: true, ...(logs === undefined ? {} : { logger: { level: "info", stream: { write: (line: string) => void logs.push(line) } } }) });
  await app.register(cookie);
  app.register(wall, { prefix: "/wall", features, settings, guard, desk, pairings, picture, now: () => clock.at, waitMs, events });
  return { app, clock, desk };
}

test("everything is a 404 that says so while WALL is off", async () => {
  const { app } = await buildApp({ ...allOn, wall: false });
  for (const [method, url] of [["GET", "/wall"], ["GET", "/wall/jarvis"], ["POST", "/wall/jarvis"], ["POST", "/wall/pair"], ["GET", "/wall/pair"], ["POST", "/wall/pair/confirm"], ["POST", "/wall/logout"]] as const) {
    const response = await app.inject({ method, url, payload: method === "POST" ? {} : undefined });
    assert.equal(response.statusCode, 404, url);
    assert.deepEqual(response.json(), switchedOff);
  }
});

test("Jarvis's report is kept and read back", async () => {
  const { app, clock } = await buildApp();
  const posted = await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "listening", muted: false, heard: null, said: null } });
  assert.equal(posted.statusCode, 200);
  assert.deepEqual(posted.json(), { seq: 1 });
  clock.at += 100;
  const read = await app.inject({ method: "GET", url: "/wall/jarvis" });
  assert.equal(read.statusCode, 200);
  assert.equal(read.headers["cache-control"], "no-store");
  assert.deepEqual(read.json(), { seq: 1, running: true, activity: "listening", muted: false, heard: null, said: null, saidAgeMs: null, page: null, opens: 0, backs: 0, privateNow: [] });
});

test("a bad report is a 400 with the reason, and changes nothing", async () => {
  const { app, desk, clock } = await buildApp();
  const response = await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "dancing" } });
  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /^activity must be one of/);
  assert.equal(desk.view(clock.at).seq, 0);
});

test("a report over 4 KB is refused", async () => {
  const { app } = await buildApp();
  const response = await app.inject({ method: "POST", url: "/wall/jarvis", headers: { "content-type": "application/json" }, payload: JSON.stringify({ activity: "waiting", said: "x".repeat(5000) }) });
  assert.equal(response.statusCode, 413);
});

test("reading with the seq already seen waits for a change", async () => {
  const { app } = await buildApp(allOn, 5000);
  await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "waiting" } });
  const reading = app.inject({ method: "GET", url: "/wall/jarvis?after=1" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "speaking" } });
  const read = await reading;
  assert.equal(read.json().activity, "speaking");
  assert.equal(read.json().seq, 2);
});

test("reading with nothing new answers after the wait with the same seq", async () => {
  const { app } = await buildApp(allOn, 40);
  await app.inject({ method: "POST", url: "/wall/jarvis", payload: { activity: "waiting" } });
  const began = Date.now();
  const read = await app.inject({ method: "GET", url: "/wall/jarvis?after=1" });
  assert.ok(Date.now() - began >= 35);
  assert.equal(read.json().seq, 1);
});

test("after must be -1 or a whole number", async () => {
  const { app } = await buildApp();
  for (const after of ["x", "1.5", "-2", "1e3", "9999999999999999"]) {
    const response = await app.inject({ method: "GET", url: `/wall/jarvis?after=${after}` });
    assert.equal(response.statusCode, 400, after);
  }
  assert.equal((await app.inject({ method: "GET", url: "/wall/jarvis?after=-1" })).statusCode, 200);
});

async function startPairing(app: Awaited<ReturnType<typeof buildApp>>["app"], cookies: Record<string, string> = {}) {
  const response = await app.inject({ method: "POST", url: "/wall/pair", cookies, payload: {} });
  const id = response.cookies.find((one) => one.name === pairCookie)?.value ?? "";
  return { response, id };
}

test("a screen starts pairing: it gets a 6-digit code to show, and a short-lived cookie only it holds", async () => {
  const { app } = await buildApp();
  const { response, id } = await startPairing(app);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { code: "123456", seconds: 300 });
  assert.equal(response.headers["cache-control"], "no-store");
  const set = response.cookies.find((one) => one.name === pairCookie);
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(set?.httpOnly, true);
  assert.equal(set?.sameSite, "Strict");
  assert.equal(set?.maxAge, pairingMs / 1000);
  assert.equal(response.cookies.some((one) => one.name === wallCookie), false, "nothing that reads the wall yet");
});

test("the phone types the code, and the screen's next look gets the wall's cookie for a year and drops its pairing cookie", async () => {
  const { app } = await buildApp();
  const { id } = await startPairing(app);
  const waiting = await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } });
  assert.deepEqual(waiting.json(), { state: "waiting", seconds: 300 });
  const confirmed = await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "123456" } });
  assert.deepEqual([confirmed.statusCode, confirmed.json()], [200, { paired: true }]);
  const paired = await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } });
  assert.deepEqual(paired.json(), { state: "paired", seconds: 0 });
  const given = paired.cookies.find((one) => one.name === wallCookie);
  assert.equal(given?.value, settings.token, "the same read-only access as the wall's token");
  assert.equal(given?.httpOnly, true);
  assert.equal(given?.sameSite, "Strict");
  assert.equal(given?.maxAge, 60 * 60 * 24 * wallCookieDays);
  assert.equal(paired.cookies.find((one) => one.name === pairCookie)?.value, "");
  const again = await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } });
  assert.deepEqual(again.json(), { state: "gone", seconds: 0 }, "a pairing gives its cookie once");
  assert.equal(again.cookies.some((one) => one.name === wallCookie), false);
});

test("waiting on a pairing is a long poll that answers as soon as the phone confirms it", { timeout: 5_000 }, async () => {
  const { app } = await buildApp(allOn, 2_000);
  const { id } = await startPairing(app);
  const started = Date.now();
  const looking = app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "123456" } });
  const response = await looking;
  assert.equal(response.json().state, "paired");
  assert.ok(Date.now() - started < 1_500, "it didn't wait out the 2 seconds");
});

test("a code lasts 5 minutes, then the screen is told it's gone and starts again", async () => {
  const { app, clock } = await buildApp();
  const { id } = await startPairing(app);
  clock.at += pairingMs;
  const confirmed = await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "123456" } });
  assert.deepEqual([confirmed.statusCode, confirmed.json()], [404, noSuchCode]);
  const looked = await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } });
  assert.deepEqual(looked.json(), { state: "gone", seconds: 0 });
  assert.equal(looked.cookies.find((one) => one.name === pairCookie)?.value, "");
});

test("a screen asking again replaces its own pairing, and two screens never share a code", async () => {
  const { app } = await buildApp();
  const first = await startPairing(app);
  const again = await startPairing(app, { [pairCookie]: first.id });
  assert.equal(again.response.json().code, "123456", "its old code is free again, so it can come back");
  assert.notEqual(again.id, first.id);
  const other = await startPairing(app);
  assert.match(other.response.json().code, /^\d{6}$/);
  assert.notEqual(other.response.json().code, "123456", "the second screen's code was made again, as 123456 was taken");
  assert.deepEqual((await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: first.id } })).json().state, "gone");
});

test(`at most ${mostPairings} screens pair at once`, async () => {
  const { app } = await buildApp();
  for (let i = 0; i < mostPairings; i++) assert.equal((await startPairing(app)).response.statusCode, 200);
  const refused = await startPairing(app);
  assert.equal(refused.response.statusCode, 429);
  assert.equal(refused.id, "");
});

test("a wrong code is refused, and after five wrong codes every waiting pairing is dropped so it can't be guessed", async () => {
  const { app } = await buildApp();
  const { id } = await startPairing(app);
  for (let i = 1; i < mostWrongCodes; i++) {
    const wrong = await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "000000" } });
    assert.deepEqual([wrong.statusCode, wrong.json()], [404, noSuchCode]);
  }
  const fifth = await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "000000" } });
  assert.deepEqual([fifth.statusCode, fifth.json()], [429, tooManyWrongCodes]);
  assert.equal((await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "123456" } })).statusCode, 404, "the right code is gone too");
  assert.equal((await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } })).json().state, "gone");
});

test("a right code resets the count of wrong ones", async () => {
  const { app } = await buildApp();
  await startPairing(app);
  for (let i = 1; i < mostWrongCodes; i++) await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "000000" } });
  assert.equal((await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "123456" } })).statusCode, 200);
  await startPairing(app);
  for (let i = 1; i < mostWrongCodes; i++) assert.equal((await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "000000" } })).statusCode, 404);
});

test("a code must be six digits, and a pairing cookie that isn't one of the hub's is ignored", async () => {
  const { app } = await buildApp();
  for (const payload of [{ code: "12345" }, { code: "1234567" }, { code: 123456 }, { code: "12345a" }, {}]) {
    assert.equal((await app.inject({ method: "POST", url: "/wall/pair/confirm", payload })).statusCode, 400, JSON.stringify(payload));
  }
  for (const id of ["nope", "0".repeat(31), `${"0".repeat(32)}x`]) {
    assert.deepEqual((await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } })).json(), { state: "gone", seconds: 0 });
  }
});

test("pairing logs say what happened, never a code or a pairing's cookie", async () => {
  const logs: string[] = [];
  const { app } = await buildApp(allOn, 40, undefined, logs);
  const { id } = await startPairing(app);
  await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "999000" } });
  await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "123456" } });
  await app.inject({ method: "GET", url: "/wall/pair", cookies: { [pairCookie]: id } });
  const all = logs.join("");
  assert.ok(!all.includes("123456") && !all.includes("999000") && !all.includes(id) && !all.includes(settings.token), all.slice(0, 400));
  for (const said of ["a screen started pairing, showing a code", "a pairing code was wrong", "a screen was paired from the phone", "a paired screen took its login and can show the wall"]) assert.ok(all.includes(said), said);
});

test("the old token login is gone: the wall's page pairs from the phone instead", async () => {
  const { app } = await buildApp();
  assert.equal((await app.inject({ method: "POST", url: "/wall/login", payload: { token: settings.token } })).statusCode, 404);
});

test("logging out clears the wall's cookie", async () => {
  const { app } = await buildApp();
  const response = await app.inject({ method: "POST", url: "/wall/logout" });
  assert.equal(response.statusCode, 200);
  const cleared = response.cookies.find((one) => one.name === wallCookie);
  assert.equal(cleared?.value, "");
});

const sample = { at: "2026-11-30T07:02:00.000Z", clock: "07:02", day: "Monday morning", phase: "morning", mode: "normal", modeUntil: null, speaking: "wobble", remote: false, items: [], train: null, timers: [], playing: null } satisfies WallPicture;

test("the wall's picture is given as it was made, never kept by the browser", async () => {
  const { app } = await buildApp(allOn, 40, async () => sample);
  for (const url of ["/wall", "/wall/"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, url);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), sample);
  }
});

test("with no picture to give it says so, and one that fails is a 502 in plain words", async () => {
  const none = await buildApp();
  assert.deepEqual([(await none.app.inject({ method: "GET", url: "/wall" })).statusCode, (await none.app.inject({ method: "GET", url: "/wall" })).json()], [503, { error: "The wall has nothing to show yet" }]);
  const failing = await buildApp(allOn, 40, async () => Promise.reject(new Error("secret detail")));
  const response = await failing.app.inject({ method: "GET", url: "/wall" });
  assert.deepEqual([response.statusCode, response.json()], [502, { error: "Couldn't put the wall's picture together" }]);
});

test("asking for a code needs a JSON body, so another site's page can't ask for one without the browser asking first", async () => {
  const { app } = await buildApp();
  const plain = await app.inject({ method: "POST", url: "/wall/pair", headers: { "content-type": "text/plain" }, payload: "x" });
  assert.deepEqual([plain.statusCode, plain.json()], [415, pairNeedsJson]);
  assert.equal(plain.cookies.length, 0);
  const form = await app.inject({ method: "POST", url: "/wall/pair", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "a=b" });
  assert.equal(form.statusCode, 415);
  const disguised = await app.inject({ method: "POST", url: "/wall/pair", headers: { "content-type": "text/plain; charset=application/json" }, payload: "{}" });
  assert.equal(disguised.statusCode, 415, "JSON named anywhere but the start isn't JSON");
  assert.equal((await app.inject({ method: "POST", url: "/wall/pair", headers: { "content-type": "application/json; charset=utf-8" }, payload: "{}" })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/wall/pair", payload: {} })).statusCode, 200);
});

test("with LOGIN_GUARD on, pairing over plain http is refused, so its cookies only ever go over https", async () => {
  const { app } = await buildApp(allOn, 40, undefined, undefined, true);
  const plain = await app.inject({ method: "POST", url: "/wall/pair", headers: { "x-forwarded-proto": "http" }, payload: {} });
  assert.deepEqual([plain.statusCode, plain.json()], [403, plainHttpPairing]);
  assert.equal((await app.inject({ method: "GET", url: "/wall/pair", headers: { "x-forwarded-proto": "http" } })).statusCode, 403);
  const secure = await app.inject({ method: "POST", url: "/wall/pair", headers: { "x-forwarded-proto": "https" }, payload: {} });
  const id = secure.cookies.find((one) => one.name === pairCookie);
  assert.equal(id?.secure, true);
  await app.inject({ method: "POST", url: "/wall/pair/confirm", headers: { "x-forwarded-proto": "https" }, payload: { code: "123456" } });
  const paired = await app.inject({ method: "GET", url: "/wall/pair", headers: { "x-forwarded-proto": "https" }, cookies: { [pairCookie]: id?.value ?? "" } });
  assert.equal(paired.cookies.find((one) => one.name === wallCookie)?.secure, true);
});

test("wrong codes only count for 5 minutes, so typos days apart never drop the screens that are pairing", async () => {
  const { app, clock } = await buildApp();
  const { id } = await startPairing(app);
  for (let i = 1; i < mostWrongCodes; i++) await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "000000" } });
  clock.at += pairingMs - 1_000;
  await app.inject({ method: "POST", url: "/wall/pair", cookies: { [pairCookie]: id }, payload: {} });
  clock.at += 2_000;
  const later = await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "000000" } });
  assert.deepEqual([later.statusCode, later.json()], [404, noSuchCode], "the old ones are more than 5 minutes old now");
});

test("a look that's cut off just as its code is confirmed doesn't take the login, so the screen's next look still can", { timeout: 5_000 }, async () => {
  const real = createPairings({ makeCode: () => "123456" });
  let collected = 0;
  const pairings = {
    ...real,
    wait: async (_id: string, _ms: number, signal: AbortSignal) => {
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      return { state: "paired" as const, seconds: 60 };
    },
    collect: (id: string, now: number) => {
      collected++;
      return real.collect(id, now);
    },
  };
  const app = Fastify();
  await app.register(cookie);
  app.register(wall, { prefix: "/wall", features: allOn, settings, desk: createJarvisDesk(), pairings, waitMs: 2_000 });
  const started = await app.inject({ method: "POST", url: "/wall/pair", payload: {} });
  const id = started.cookies.find((one) => one.name === pairCookie)?.value ?? "";
  await app.listen({ port: 0, host: "127.0.0.1" });
  try {
    const port = (app.server.address() as import("node:net").AddressInfo).port;
    const looking = new AbortController();
    const dropped = fetch(`http://127.0.0.1:${port}/wall/pair`, { headers: { cookie: `${pairCookie}=${id}` }, signal: looking.signal }).catch(() => "dropped");
    await new Promise((resolve) => setTimeout(resolve, 50));
    looking.abort();
    assert.equal(await dropped, "dropped");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(collected, 0);
  } finally {
    await app.close();
  }
});

test("a screen paired from the phone posts an event, and a wrong code posts none", async () => {
  const posted: unknown[] = [];
  const { app } = await buildApp(allOn, 40, undefined, undefined, false, { post: (kind, facts) => (posted.push([kind, facts]), null) });
  await startPairing(app);
  assert.equal((await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "654321" } })).statusCode, 404);
  assert.deepEqual(posted, []);
  assert.equal((await app.inject({ method: "POST", url: "/wall/pair/confirm", payload: { code: "123456" } })).statusCode, 200);
  assert.deepEqual(posted, [["screen.paired", undefined]]);
});

test("the wall's token may read the wall, one page's details, today's events and the events feed, and nothing else", () => {
  assert.deepEqual([...wallReads].sort(), ["GET /events/feed", "GET /events/today", "GET /wall", "GET /wall/jarvis", "GET /wall/pages/:id"]);
});

async function pagesApp(options: { privatePages?: string[]; mode?: string | null; logs?: string[] } = {}) {
  const clock = { at: 1_000_000 };
  const desk = createJarvisDesk();
  const app = Fastify(options.logs === undefined ? {} : { logger: { level: "info", stream: { write: (line: string) => void options.logs?.push(line) } } });
  await app.register(cookie);
  const mode = { now: options.mode ?? null };
  app.register(wall, { prefix: "/wall", features: allOn, settings: { ...settings, privatePages: options.privatePages ?? [] }, desk, now: () => clock.at, waitMs: 40, mode: () => mode.now });
  return { app, clock, desk, mode };
}

test("the hub lists the wall's pages with the words that open them, which are private, and how long one shows", async () => {
  const { app } = await pagesApp({ privatePages: ["deals"] });
  const listed = await app.inject({ method: "GET", url: "/wall/pages" });
  assert.equal(listed.statusCode, 200);
  const body = listed.json();
  assert.equal(body.seconds, 120);
  assert.deepEqual(body.pages.map((page: { id: string }) => page.id), pageIds);
  assert.deepEqual(body.pages.find((page: { id: string }) => page.id === "deals"), { id: "deals", title: "Deals", say: ["show me the deals"], private: true });
  assert.equal(body.pages.find((page: { id: string }) => page.id === "server").private, false);
});

test("opening a page puts it on the screen's long poll, with who opened it, and back takes it off", async () => {
  const { app, clock } = await pagesApp();
  const opened = await app.inject({ method: "POST", url: "/wall/page", payload: { page: "backup", by: "words" } });
  assert.deepEqual([opened.statusCode, opened.json()], [200, { open: "backup", seconds: 120 }]);
  clock.at += 5_000;
  assert.deepEqual((await app.inject({ method: "GET", url: "/wall/jarvis" })).json().page, { id: "backup", by: "words", ageMs: 5_000, title: "The backup" });
  const back = await app.inject({ method: "POST", url: "/wall/page/back", payload: { by: "words" } });
  assert.deepEqual([back.statusCode, back.json()], [200, { back: true }]);
  assert.equal((await app.inject({ method: "GET", url: "/wall/jarvis" })).json().page, null);
  assert.deepEqual((await app.inject({ method: "POST", url: "/wall/page/back", payload: { by: "jarvis" } })).json(), { back: false });
  assert.equal((await app.inject({ method: "GET", url: "/wall/jarvis" })).json().backs, 2, "each back is counted, open or not");
});

test("only a listed page, opened in a known way, is taken", async () => {
  const { app } = await pagesApp();
  for (const payload of [{ page: "brain", by: "words" }, { page: "Server", by: "words" }, { by: "words" }, { page: "server" }, { page: "server", by: "claude" }, { page: "server", by: "phone" }, ["server", "words"]]) {
    const response = await app.inject({ method: "POST", url: "/wall/page", payload });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
  }
  assert.equal((await app.inject({ method: "POST", url: "/wall/page", payload: "server" })).statusCode, 415);
  assert.deepEqual((await app.inject({ method: "POST", url: "/wall/page", payload: { page: "brain", by: "words" } })).json(), noSuchPage);
  assert.deepEqual((await app.inject({ method: "POST", url: "/wall/page", payload: { page: "server", by: "x" } })).json(), pageByWrong);
  assert.deepEqual((await app.inject({ method: "POST", url: "/wall/page/back", payload: {} })).json(), pageByWrong);
  assert.equal((await app.inject({ method: "GET", url: "/wall/jarvis" })).json().page, null);
});

test("a private page isn't opened in guest mode, and one already open disappears when guest mode starts", async () => {
  const { app, mode } = await pagesApp({ privatePages: ["deals"], mode: "guest" });
  const refused = await app.inject({ method: "POST", url: "/wall/page", payload: { page: "deals", by: "words" } });
  assert.deepEqual([refused.statusCode, refused.json()], [403, privateInGuest]);
  assert.equal((await app.inject({ method: "POST", url: "/wall/page", payload: { page: "server", by: "words" } })).statusCode, 200, "every other page shows in guest mode");
  mode.now = "normal";
  assert.equal((await app.inject({ method: "POST", url: "/wall/page", payload: { page: "deals", by: "words" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/wall/jarvis" })).json().page.id, "deals");
  assert.deepEqual((await app.inject({ method: "GET", url: "/wall/jarvis" })).json().privateNow, [], "outside guest mode the private list isn't sent");
  mode.now = "guest";
  const inGuest = (await app.inject({ method: "GET", url: "/wall/jarvis" })).json();
  assert.deepEqual([inGuest.page, inGuest.privateNow], [null, ["deals"]], "in guest mode the screen is told which pages to keep shut, for anything it opens itself");
  mode.now = null;
  assert.equal((await app.inject({ method: "GET", url: "/wall/jarvis" })).json().page.id, "deals", "without modes the hub has no guest mode, so nothing is hidden");
});

test("a screen waiting on the long poll hears within a second or so when guest mode starts or ends, so a private page goes at once", { timeout: 10_000 }, async () => {
  const app = Fastify();
  await app.register(cookie);
  const mode = { now: "normal" as string | null };
  const desk = createJarvisDesk();
  app.register(wall, { prefix: "/wall", features: allOn, settings: { ...settings, privatePages: ["deals"] }, desk, waitMs: 8_000, mode: () => mode.now });
  desk.openPage("deals", "words", Date.now());
  const seq = (await app.inject({ method: "GET", url: "/wall/jarvis" })).json().seq;
  const started = Date.now();
  setTimeout(() => (mode.now = "guest"), 100);
  const answered = (await app.inject({ method: "GET", url: `/wall/jarvis?after=${seq}` })).json();
  assert.ok(Date.now() - started < privacyCheckMs * 2 + 500, `took ${Date.now() - started} ms`);
  assert.deepEqual([answered.page, answered.privateNow], [null, ["deals"]]);
  const quiet = Date.now();
  setTimeout(() => (mode.now = "bedtime"), 100);
  const out = (await app.inject({ method: "GET", url: `/wall/jarvis?after=${seq}` })).json();
  assert.ok(Date.now() - quiet < privacyCheckMs * 2 + 500);
  assert.deepEqual([out.page?.id, out.privateNow], ["deals", []]);
  await app.close();
  const calm = Fastify();
  await calm.register(cookie);
  const calmMode = { now: "normal" };
  calm.register(wall, { prefix: "/wall", features: allOn, settings: { ...settings, privatePages: ["deals"] }, desk: createJarvisDesk(), waitMs: 2_500, mode: () => calmMode.now });
  const calmSeq = (await calm.inject({ method: "GET", url: "/wall/jarvis" })).json().seq;
  setTimeout(() => (calmMode.now = "bedtime"), 100);
  const unchanged = Date.now();
  await calm.inject({ method: "GET", url: `/wall/jarvis?after=${calmSeq}` });
  assert.ok(Date.now() - unchanged >= 2_300, "a mode change that hides nothing doesn't wake it");
  await calm.close();
});

test("a screen that says which pages it was last told are private is answered at once when that's no longer so, even if guest mode changed between its polls", { timeout: 10_000 }, async () => {
  const app = Fastify();
  await app.register(cookie);
  const mode = { now: "normal" as string | null };
  const desk = createJarvisDesk();
  app.register(wall, { prefix: "/wall", features: allOn, settings: { ...settings, privatePages: ["deals", "server"] }, desk, waitMs: 4_000, mode: () => mode.now });
  desk.openPage("deals", "words", Date.now());
  const first = (await app.inject({ method: "GET", url: "/wall/jarvis" })).json();
  assert.deepEqual([first.page?.id, first.privateNow], ["deals", []]);
  mode.now = "guest";
  const started = Date.now();
  const answered = (await app.inject({ method: "GET", url: `/wall/jarvis?after=${first.seq}&private=` })).json();
  assert.ok(Date.now() - started < 300, `took ${Date.now() - started} ms`);
  assert.deepEqual([answered.page, answered.privateNow], [null, ["deals", "server"]]);
  const held = Date.now();
  setTimeout(() => (mode.now = "normal"), 1_500);
  const out = (await app.inject({ method: "GET", url: `/wall/jarvis?after=${first.seq}&private=server,deals,brain` })).json();
  assert.ok(Date.now() - held >= 1_400, "a screen already told the same pages waits, whatever order it sends them in and with names that aren't private");
  assert.deepEqual([out.page?.id, out.privateNow], ["deals", []]);
  mode.now = "guest";
  const stale = Date.now();
  await app.inject({ method: "GET", url: `/wall/jarvis?after=${first.seq}&private=deals` });
  assert.ok(Date.now() - stale < 300, "one told only some of them is answered at once");
  for (const bad of ["Deals", "deals,", ",deals", "deals,,server", "deals%20server", "a".repeat(21), Array.from({ length: 51 }, () => "deals").join(",")]) {
    assert.equal((await app.inject({ method: "GET", url: `/wall/jarvis?after=${first.seq}&private=${bad}` })).statusCode, 400, bad);
  }
  assert.equal((await app.inject({ method: "GET", url: `/wall/jarvis?after=${first.seq}&private=deals&private=server` })).statusCode, 400, "given twice");
  await app.close();
});

test("the logs say which page, how it was opened and what was refused, and nothing else", async () => {
  const logs: string[] = [];
  const { app } = await pagesApp({ privatePages: ["deals"], mode: "guest", logs });
  await app.inject({ method: "POST", url: "/wall/page", payload: { page: "server", by: "jarvis" } });
  await app.inject({ method: "POST", url: "/wall/page", payload: { page: "deals", by: "words" } });
  await app.inject({ method: "POST", url: "/wall/page/back", payload: { by: "words" } });
  const lines = logs.map((line) => JSON.parse(line)).filter((line) => line.page !== undefined);
  assert.deepEqual(lines.map((line) => [line.msg, line.page]), [
    ["a page was opened on the wall", { id: "server", by: "jarvis" }],
    ["a private page wasn't opened on the wall, in guest mode", { id: "deals", by: "words", refused: "private in guest mode" }],
    ["the wall was sent back to its main page", { by: "words", wasOpen: true }],
  ]);
});

test("a screen reads a page's details with the wall's token, never a private page in guest mode, and a page with no details says so", { timeout: 5_000 }, async () => {
  const logs: string[] = [];
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => void logs.push(line) } } });
  await app.register(cookie);
  const mode = { now: "normal" as string | null };
  app.register(wall, { prefix: "/wall", features: allOn, settings: { ...settings, privatePages: ["train"] }, mode: () => mode.now, pageDetails: { train: async () => ({ kind: "trains", rows: [] }), backup: async () => Promise.reject(new Error("the backup state file is missing")) } });
  const read = await app.inject({ method: "GET", url: "/wall/pages/train" });
  assert.equal(read.statusCode, 200);
  assert.equal(read.headers["cache-control"], "no-store");
  assert.deepEqual([read.json().id, read.json().details], ["train", { kind: "trains", rows: [] }]);
  assert.deepEqual([(await app.inject({ method: "GET", url: "/wall/pages/server" })).statusCode, (await app.inject({ method: "GET", url: "/wall/pages/server" })).json()], [404, noPageDetails]);
  assert.deepEqual((await app.inject({ method: "GET", url: "/wall/pages/brain" })).json(), noSuchPage);
  assert.deepEqual([(await app.inject({ method: "GET", url: "/wall/pages/backup" })).statusCode, (await app.inject({ method: "GET", url: "/wall/pages/backup" })).json()], [502, pageDetailsFailed]);
  mode.now = "guest";
  assert.deepEqual([(await app.inject({ method: "GET", url: "/wall/pages/train" })).statusCode, (await app.inject({ method: "GET", url: "/wall/pages/train" })).json()], [403, privateInGuest]);
  assert.ok(wallReads.has("GET /wall/pages/:id") && !wallReads.has("GET /wall/pages"), "screens read one page's details, never the list with its words");
  const failed = logs.map((line) => JSON.parse(line)).filter((line) => line.msg === "a page's details couldn't be read");
  assert.deepEqual(failed.map((line) => [line.level, line.page]), [[40, { id: "backup", why: "the backup state file is missing" }], [40, { id: "backup", why: "the backup state file is missing" }]], "a warning with the page and the hub's own reason");
  await app.close();
});
