import { readdir } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../../config.js";

const inboxDir = "/memory/inbox";

export async function countWaiting(dir = inboxDir): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => {
    throw new Error("Couldn't read the brain inbox");
  });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md").length;
}

export const memory: FastifyPluginAsync<Pick<Config, "features"> & { inboxDir?: string }> = async (app, options) => {
  app.get("/inbox", async (_request, reply) => {
    if (!options.features.memoryInbox) return reply.code(404).send({ error: "The brain inbox is switched off" });
    return { waiting: await countWaiting(options.inboxDir) };
  });
};