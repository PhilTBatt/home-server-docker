import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import type { CatchUp } from "./catchup.js";

export const defaultDays = 7;
export const mostDays = 30;

export function readDays(query: unknown): number | null {
  const value = typeof query === "object" && query !== null ? (query as Record<string, unknown>).days : undefined;
  if (value === undefined || value === "") return defaultDays;
  if (typeof value !== "string" || !/^\d{1,2}$/.test(value)) return null;
  const days = Number(value);
  return days >= 1 && days <= mostDays ? days : null;
}

export const catchUp: FastifyPluginAsync<{ features: Features; catchUp?: CatchUp; now?: () => Date }> = async (app, options) => {
  app.get("/", async (request, reply) => {
    if (!options.features.catchUp || options.catchUp === undefined) return reply.code(404).send({ error: "Catch-up is switched off" });
    const days = readDays(request.query);
    if (days === null) return reply.code(400).send({ error: `days must be a whole number from 1 to ${mostDays}` });
    return options.catchUp.read(days, options.now?.() ?? new Date());
  });
};
