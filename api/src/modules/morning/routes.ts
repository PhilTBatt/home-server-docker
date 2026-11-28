import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { isMorningBy, type Morning, type MorningBy } from "./morning.js";

export const bodyLimit = 1024;
export const morningOff = { error: "The morning is switched off" };
export const morningByWrong = { error: "Send a JSON object with by, phone or voice" };

function byOf(body: unknown): MorningBy | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((key) => key !== "by")) return null;
  return isMorningBy(fields.by) ? fields.by : null;
}

export const morning: FastifyPluginAsync<{ features: Features; morning?: Morning; now?: () => Date }> = async (app, options) => {
  const now = options.now ?? (() => new Date());

  app.get("/", { logLevel: "warn" }, async (_request, reply) => {
    if (!options.features.morning || options.morning === undefined) return reply.code(404).send(morningOff);
    return reply.header("cache-control", "no-store").send(options.morning.view(now()));
  });

  for (const action of ["up", "snooze"] as const) {
    app.post(`/${action}`, { bodyLimit }, async (request, reply) => {
      if (!options.features.morning || options.morning === undefined) return reply.code(404).send(morningOff);
      const by = byOf(request.body);
      if (by === null) return reply.code(400).send(morningByWrong);
      const answer = action === "up" ? await options.morning.up(by, now()) : await options.morning.snooze(by, now());
      if ("refused" in answer) return reply.code(409).send({ error: answer.refused });
      return answer.view;
    });
  }
};
