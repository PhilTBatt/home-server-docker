import assert from "node:assert/strict";
import { test } from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";

process.env.API_TOKEN = "test-token";
const { auth } = await import("./routes.js");

async function buildApp() {
  const app = Fastify();
  await app.register(cookie);
  app.register(auth, { prefix: "/auth" });
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