import type { FastifyPluginAsync } from "fastify";

export const health: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return { status: "ok" };
  });
};