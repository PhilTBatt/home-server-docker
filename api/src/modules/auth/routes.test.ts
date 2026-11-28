import assert from "node:assert/strict";
import { test } from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { Writable } from "node:stream";
import { auth, mostWrongLogins, plainHttpRefused, tooManyWrong, wrongLoginWindowMs } from "./routes.js";

async function buildApp(trustProxy = false) {
  const app = Fastify({ trustProxy });
  await app.register(cookie);
  app.register(auth, { prefix: "/auth", apiToken: "test-token" });
  return app;
}

test("login with the right token sets the cookie", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { token: "test-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "logged in" });
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /^hub_token=test-token;/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\//);
  assert.doesNotMatch(setCookie, /; Secure(;|$)/);
});

test("login with a wrong token is refused and sets no cookie", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { token: "wrong" },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers["set-cookie"], undefined);
});

test("login without a token in the body is a 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {},
  });
  assert.equal(response.statusCode, 400);
});

test("logout clears the cookie", async () => {
  const app = await buildApp();
  const response = await app.inject({ method: "POST", url: "/auth/logout" });
  assert.equal(response.statusCode, 200);
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /^hub_token=;/);
  assert.match(setCookie, /Max-Age=0/);
});

test("a login that came over HTTPS through the proxy gets an HTTPS-only cookie", async () => {
  const app = await buildApp(true);
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "x-forwarded-proto": "https" },
    payload: { token: "test-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["set-cookie"]), /; Secure(;|$)/);
});

test("a login that came over plain HTTP through the proxy still works, with an ordinary cookie", async () => {
  const app = await buildApp(true);
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "x-forwarded-proto": "http" },
    payload: { token: "test-token" },
  });
  assert.equal(response.statusCode, 200);
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /^hub_token=test-token;/);
  assert.doesNotMatch(setCookie, /; Secure(;|$)/);
});

test("without trusting the proxy, its HTTPS header is ignored", async () => {
  const app = await buildApp(false);
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "x-forwarded-proto": "https" },
    payload: { token: "test-token" },
  });
  assert.doesNotMatch(String(response.headers["set-cookie"]), /; Secure(;|$)/);
});

test("logout over HTTPS clears the cookie with the same HTTPS-only flag", async () => {
  const app = await buildApp(true);
  const response = await app.inject({ method: "POST", url: "/auth/logout", headers: { "x-forwarded-proto": "https" } });
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /^hub_token=;/);
  assert.match(setCookie, /Expires=Thu, 01 Jan 1970/);
  assert.match(setCookie, /; Secure(;|$)/);
});

test("logout over plain HTTP still clears the cookie", async () => {
  const app = await buildApp(true);
  const response = await app.inject({ method: "POST", url: "/auth/logout", headers: { "x-forwarded-proto": "http" } });
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /^hub_token=;/);
  assert.doesNotMatch(setCookie, /; Secure(;|$)/);
});
async function buildGuarded(clock: { at: number }, logs?: string[]) {
  const stream = new Writable({
    write(chunk, _encoding, done) {
      logs?.push(String(chunk));
      done();
    },
  });
  const app = Fastify({ trustProxy: true, logger: logs === undefined ? false : { stream } });
  await app.register(cookie);
  app.register(auth, { prefix: "/auth", apiToken: "test-token", guard: true, now: () => clock.at });
  return app;
}

function login(app: Awaited<ReturnType<typeof buildGuarded>>, token: string, proto = "https") {
  return app.inject({ method: "POST", url: "/auth/login", headers: { "x-forwarded-proto": proto }, payload: { token } });
}

test("with the guard on, a login over plain http is refused, right token or not, and sets no cookie", async () => {
  const app = await buildGuarded({ at: 0 });
  for (const token of ["test-token", "wrong"]) {
    const response = await login(app, token, "http");
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), plainHttpRefused);
    assert.equal(response.headers["set-cookie"], undefined);
  }
});

test("with the guard on, a login with no proxy header counts as plain http and is refused", async () => {
  const app = await buildGuarded({ at: 0 });
  const response = await app.inject({ method: "POST", url: "/auth/login", payload: { token: "test-token" } });
  assert.equal(response.statusCode, 403);
});

test("with the guard on, a login over https gets an HTTPS-only cookie with the usual flags", async () => {
  const app = await buildGuarded({ at: 0 });
  const response = await login(app, "test-token");
  assert.equal(response.statusCode, 200);
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /^hub_token=test-token;/);
  assert.match(setCookie, /; Secure(;|$)/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Max-Age=5184000/);
});

test("with the guard on, logout clears the cookie as HTTPS-only even over plain http", async () => {
  const app = await buildGuarded({ at: 0 });
  const response = await app.inject({ method: "POST", url: "/auth/logout", headers: { "x-forwarded-proto": "http" } });
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /^hub_token=;/);
  assert.match(setCookie, /; Secure(;|$)/);
});

test("with the guard on, one wrong token short of the limit still lets the right one in", async () => {
  const clock = { at: 0 };
  const app = await buildGuarded(clock);
  for (let i = 0; i < mostWrongLogins - 1; i++) {
    clock.at = i * 1000;
    assert.equal((await login(app, `wrong-${i}`)).statusCode, 401);
  }
  assert.equal((await login(app, "test-token")).statusCode, 200);
});

test("with the guard on, ten wrong tokens in a minute pause logins, even with the right token, until the first is a minute old", async () => {
  const clock = { at: 0 };
  const app = await buildGuarded(clock);
  assert.equal(mostWrongLogins, 10);
  assert.equal(wrongLoginWindowMs, 60_000);
  for (let i = 0; i < 10; i++) {
    clock.at = i * 1000;
    assert.equal((await login(app, `wrong-${i}`)).statusCode, 401);
  }
  clock.at = 59_999;
  const paused = await login(app, "test-token");
  assert.equal(paused.statusCode, 429);
  assert.deepEqual(paused.json(), tooManyWrong);
  assert.equal(paused.headers["set-cookie"], undefined);
  clock.at = 60_000;
  assert.equal((await login(app, "test-token")).statusCode, 200);
});

test("with the guard on, tries while logins are paused don't lengthen the pause", async () => {
  const clock = { at: 0 };
  const app = await buildGuarded(clock);
  for (let i = 0; i < 10; i++) assert.equal((await login(app, `wrong-${i}`)).statusCode, 401);
  clock.at = 30_000;
  for (let i = 0; i < 50; i++) assert.equal((await login(app, `again-${i}`)).statusCode, 429);
  clock.at = 60_000;
  assert.equal((await login(app, "test-token")).statusCode, 200);
});

test("with the guard on, wrong tokens over plain http are refused without counting", async () => {
  const app = await buildGuarded({ at: 0 });
  for (let i = 0; i < 30; i++) assert.equal((await login(app, `wrong-${i}`, "http")).statusCode, 403);
  assert.equal((await login(app, "test-token")).statusCode, 200);
});

test("with the guard on, the logs hold counts and never a token, right or wrong", async () => {
  const logs: string[] = [];
  const app = await buildGuarded({ at: 0 }, logs);
  await login(app, "test-token", "http");
  for (let i = 0; i < 10; i++) await login(app, `guess-PURPLE-${i}`);
  await login(app, "test-token");
  const all = logs.join("");
  assert.doesNotMatch(all, /test-token|PURPLE/);
  const login_ = logs.map((line) => JSON.parse(line)).filter((line) => line.login !== undefined);
  assert.deepEqual(login_.map((line) => line.login), [
    { refused: "plain http" },
    ...Array.from({ length: 10 }, (_, i) => ({ refused: "wrong token", wrongInLastMinute: i + 1 })),
    { refused: "paused", wrongInLastMinute: 10 },
  ]);
});

test("with the guard off, there's no limit on wrong tokens", async () => {
  const app = await buildApp(true);
  for (let i = 0; i < 50; i++) {
    const response = await app.inject({ method: "POST", url: "/auth/login", headers: { "x-forwarded-proto": "https" }, payload: { token: `wrong-${i}` } });
    assert.equal(response.statusCode, 401);
  }
  const response = await app.inject({ method: "POST", url: "/auth/login", headers: { "x-forwarded-proto": "https" }, payload: { token: "test-token" } });
  assert.equal(response.statusCode, 200);
});
