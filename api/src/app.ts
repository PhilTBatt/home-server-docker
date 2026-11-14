import Fastify from "fastify";
import { health } from "./modules/health/routes.js";
import { media } from "./modules/media/routes.js";
import cookie from "@fastify/cookie";
import { isAuthorized, tokenFromHeader } from "./token.js";
import { auth } from "./modules/auth/routes.js";
import { system } from "./modules/system/routes.js";
import { memory } from "./modules/memory/routes.js";
import type { Config } from "./config.js";

export async function buildApp(options: { logger: boolean; config: Config }) {
  const app = Fastify({ logger: options.logger });

  await app.register(cookie);

  app.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.url === "/auth/login") return;

    const token = tokenFromHeader(request.headers.authorization) ?? request.cookies.hub_token ?? "";
    if (!isAuthorized(token, options.config.apiToken)) return reply.code(401).send({ error: "Unauthorized" }); 
  });

  app.register(health);
      app.register(media, {
      prefix: "/media",
      qbitApiKey: options.config.qbitApiKey,
      jellyfinApiKey: options.config.jellyfinApiKey,
    });
  app.register(auth, { prefix: "/auth", apiToken: options.config.apiToken });
  app.register(system, { prefix: "/system", features: options.config.features });
  app.register(memory, { prefix: "/memory", features: options.config.features });
  return app;
}