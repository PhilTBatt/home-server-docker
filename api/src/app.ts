import Fastify from "fastify";
import { health } from "./modules/health/routes.js";
import { media } from "./modules/media/routes.js";
import cookie from "@fastify/cookie";
import { isAuthorized, tokenFromHeader } from "./token.js";
import { auth } from "./modules/auth/routes.js";
import { system } from "./modules/system/routes.js";

export async function buildApp(options: { logger: boolean }) {
  const app = Fastify({ logger: options.logger });

  await app.register(cookie);

  app.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.url === "/auth/login") return;

    const token = tokenFromHeader(request.headers.authorization) ?? request.cookies.hub_token ?? "";
    if (!isAuthorized(token)) return reply.code(401).send({ error: "Unauthorized" }); 
  });

  app.register(health);
  app.register(media, { prefix: "/media" });
  app.register(auth, { prefix: "/auth" });
  app.register(system, { prefix: "/system" });
  return app;
}