import assert from "node:assert/strict";
import { test } from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { auth } from "./routes.js";

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