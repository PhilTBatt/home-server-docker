import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";
import type { DealWatcher } from "./watcher.js";

type DealOptions = Pick<Config, "features"> & {
  watcher?: DealWatcher;
  seen?: string;
  environment?: string;
  now?: () => Date;
};

const checkGapMs = 60 * 1000;
const switchedOff = { error: "The deal watcher is switched off" };

export const deals: FastifyPluginAsync<DealOptions> = async (app, options) => {
  const now = options.now ?? (() => new Date());
  const watcher = options.features.deals ? options.watcher : undefined;
  let lastForced: number | null = null;

  app.get("/status", async (_request, reply) => {
    if (watcher === undefined) return reply.code(404).send(switchedOff);
    return { ...watcher.status(), seen: options.seen ?? null, environment: options.environment ?? null };
  });

  app.get("/searches", async (_request, reply) => {
    if (watcher === undefined) return reply.code(404).send(switchedOff);
    return watcher.searches();
  });

  app.get("/matches", async (_request, reply) => {
    if (watcher === undefined) return reply.code(404).send(switchedOff);
    return watcher.matches(now());
  });

  app.post("/check", async (_request, reply) => {
    if (watcher === undefined) return reply.code(404).send(switchedOff);
    const time = now();
    if (lastForced !== null && time.getTime() - lastForced < checkGapMs) {
      return reply.code(429).send({ error: "The deal watcher was asked to check less than a minute ago" });
    }
    const previous = lastForced;
    lastForced = time.getTime();
    const summary = await watcher.run(time, true);
    if (!summary.ran) {
      lastForced = previous;
      return reply.code(409).send({ error: "A check is already running" });
    }
    return { checked: summary.checked, alerts: summary.alerts, failed: summary.failed, unsent: summary.unsent };
  });
};