import type { FastifyPluginAsync } from "fastify";

export const health: FastifyPluginAsync = async (app) => {
  app.get("/health", { logLevel: "warn" }, async () => {
    return { status: "ok" };
  });
};