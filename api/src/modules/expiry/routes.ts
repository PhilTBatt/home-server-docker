import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { londonTime } from "../notify/daily.js";
import type { ExpiryChecker } from "./checker.js";

export const expiry: FastifyPluginAsync<{ features: Features; checker?: ExpiryChecker; now?: () => Date }> = async (app, options) => {
  app.get("/", async (_request, reply) => {
    if (!options.features.expiryAlerts || options.checker === undefined) return reply.code(404).send({ error: "Expiry alerts are switched off" });
    const now = options.now?.() ?? new Date();
    try {
      return { today: londonTime(now).day, items: await options.checker.list(now) };
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : "The expiry list couldn't be read" });
    }
  });
};
