import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { fetchBoard, type Board, type TrainSettings } from "./board.js";
import type { ChangeFeed } from "./changes.js";

function asked(query: unknown, name: string): string | null | undefined {
  const value = typeof query === "object" && query !== null ? (query as Record<string, unknown>)[name] : undefined;
  if (value === undefined || value === "") return null;
  return typeof value === "string" ? value : undefined;
}

export const trains: FastifyPluginAsync<{ features: Features; settings: TrainSettings; board?: () => Promise<Board>; changes?: ChangeFeed; now?: () => Date }> = async (app, options) => {
  const board = options.board ?? (() => fetchBoard(options.settings));

  app.get("/", async (_request, reply) => {
    if (!options.features.trains) return reply.code(404).send({ error: "Train times are switched off" });
    try {
      return await board();
    } catch (error) {
      return reply.code(502).send({ error: `Couldn't get the train times: ${error instanceof Error ? error.message : "no reason given"}` });
    }
  });

  app.get("/changes", { logLevel: "warn" }, async (request, reply) => {
    if (!options.features.trainAlerts || options.changes === undefined) return reply.code(404).send({ error: "Train alerts are switched off" });
    const after = asked(request.query, "after");
    if (after === undefined || (after !== null && !/^\d{1,9}$/.test(after))) return reply.code(400).send({ error: "after must be a whole number" });
    const run = asked(request.query, "run");
    if (run === undefined || (run !== null && run.length > 100)) return reply.code(400).send({ error: "run must be the run a last answer gave" });
    return options.changes.since(after === null ? null : Number(after), run, options.now?.() ?? new Date());
  });
};
