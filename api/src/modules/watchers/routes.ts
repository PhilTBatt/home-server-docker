import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { readAsked } from "./kinds.js";
import { idPattern, mostWatchers, type Watchers } from "./watchers.js";

export const bodyLimit = 1024;

export const watchers: FastifyPluginAsync<{ features: Features; watchers?: Watchers; now?: () => Date }> = async (app, options) => {
  const switchedOff = { error: "Watchers are switched off" };

  app.get("/", async (_request, reply) => {
    if (!options.features.watchers || options.watchers === undefined) return reply.code(404).send(switchedOff);
    return { most: mostWatchers, watchers: options.watchers.list() };
  });

  app.post("/", { bodyLimit }, async (request, reply) => {
    if (!options.features.watchers || options.watchers === undefined) return reply.code(404).send(switchedOff);
    const asked = readAsked(request.body);
    if ("refused" in asked) return reply.code(400).send({ error: asked.refused });
    const added = options.watchers.add(asked, options.now?.() ?? new Date());
    if ("refused" in added) return reply.code(409).send({ error: added.refused });
    return added.added;
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!options.features.watchers || options.watchers === undefined) return reply.code(404).send(switchedOff);
    const { id } = request.params;
    if (!idPattern.test(id)) return reply.code(400).send({ error: "id must be a watcher's id from GET /watchers" });
    if (!options.watchers.cancel(id)) return reply.code(404).send({ error: "No watcher with that id" });
    return { cancelled: id };
  });
};
