import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { health } from "./modules/health/routes.js";

const apiToken = process.env.API_TOKEN;
if (!apiToken) {
  throw new Error("API_TOKEN is not set");
}
const expected = Buffer.from(`Bearer ${apiToken}`);

const app = Fastify({ logger: true });

app.addHook("onRequest", async (request, reply) => {
  const given = Buffer.from(request.headers.authorization ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.register(health);

await app.listen({ port: 3000, host: "0.0.0.0" });