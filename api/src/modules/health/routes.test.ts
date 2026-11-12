import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { health } from "./routes.js";

test("health answers ok", async () => {
  const app = Fastify();
  app.register(health);
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});