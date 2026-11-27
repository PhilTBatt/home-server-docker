import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { namePattern, sessionStates, type Sessions } from "./sessions.js";

export const sessions: FastifyPluginAsync<{ features: Features; sessions?: Sessions; now?: () => Date }> = async (app, options) => {
  const switchedOff = { error: "Sessions are switched off" };
  const now = options.now ?? (() => new Date());

  app.get("/", async (_request, reply) => {
    if (!options.features.sessions || options.sessions === undefined) return reply.code(404).send(switchedOff);
    return { sessions: options.sessions.list() };
  });

  app.get<{ Querystring: { after?: string } }>("/changes", { logLevel: "warn" }, async (request, reply) => {
    if (!options.features.sessions || options.sessions === undefined) return reply.code(404).send(switchedOff);
    const after = request.query.after ?? "0";
    if (!/^\d{1,15}$/.test(after)) return reply.code(400).send({ error: "after must be a whole number from 0, the seq of the last answer" });
    return options.sessions.changes(Number(after), now());
  });

  app.post<{ Params: { name: string } }>("/:name/state", { bodyLimit: 1024, logLevel: "warn" }, async (request, reply) => {
    if (!options.features.sessions || options.sessions === undefined) return reply.code(404).send(switchedOff);
    if (!namePattern.test(request.params.name)) return reply.code(400).send({ error: "A session's name is 1 to 20 lowercase letters, digits and -" });
    const body = request.body;
    const fields = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    const state = sessionStates.find((one) => one === fields?.state);
    if (fields === null || Object.keys(fields).length !== 1 || state === undefined) return reply.code(400).send({ error: `Send only state, one of ${sessionStates.join(", ")}` });
    const result = options.sessions.set(request.params.name, state, now());
    if ("refused" in result) return reply.code(409).send({ error: result.refused });
    return result;
  });
};
