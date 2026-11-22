import Fastify from "fastify";
import { health } from "./modules/health/routes.js";
import { media } from "./modules/media/routes.js";
import cookie from "@fastify/cookie";
import { isAuthorized, tokenFromHeader } from "./token.js";
import { auth } from "./modules/auth/routes.js";
import { system } from "./modules/system/routes.js";
import { memory } from "./modules/memory/routes.js";
import type { Config } from "./config.js";
import { deals } from "./modules/deals/routes.js";
import { phone } from "./modules/phone/routes.js";
import type { DealWatcher } from "./modules/deals/watcher.js";

export async function buildApp(options: { logger: boolean; config: Config; dealWatcher?: DealWatcher }) {
  const app = Fastify({ logger: options.logger, trustProxy: true });
  const dealWatcher = options.config.features.deals ? options.dealWatcher : undefined;

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
  app.register(system, { prefix: "/system", features: options.config.features, moreProblems: () => dealWatcher?.problems() ?? [] });
  app.register(memory, { prefix: "/memory", features: options.config.features });
  app.register(phone, { prefix: "/phone", features: options.config.features, ntfyTopic: options.config.ntfyTopic });
  app.register(deals, {
    prefix: "/deals",
    features: options.config.features,
    watcher: dealWatcher,
    seen: options.config.deals.seen,
    environment: options.config.deals.ebayEnvironment,
    ai: options.config.deals.ai,
  });
  return app;
}