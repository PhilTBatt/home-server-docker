import Fastify from "fastify";
import { health } from "./modules/health/routes.js";
import { media } from "./modules/media/routes.js";
import cookie from "@fastify/cookie";
import { isAuthorized } from "./token.js";
import { auth } from "./modules/auth/routes.js";

const app = Fastify({ logger: true });

await app.register(cookie);

app.addHook("onRequest", async (request, reply) => {
  if (request.routeOptions.url === "/auth/login") return;
  const cookieToken = request.cookies.hub_token;
  const presented = request.headers.authorization ?? (cookieToken ? `Bearer ${cookieToken}` : "");
  if (!isAuthorized(presented)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.register(health);
app.register(media, { prefix: "/media" });
app.register(auth, { prefix: "/auth" });

await app.listen({ port: 3000, host: "0.0.0.0" });