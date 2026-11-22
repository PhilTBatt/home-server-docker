import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { fetchBoard, type Board, type TrainSettings } from "./board.js";

export const trains: FastifyPluginAsync<{ features: Features; settings: TrainSettings; board?: () => Promise<Board> }> = async (app, options) => {
  const board = options.board ?? (() => fetchBoard(options.settings));

  app.get("/", async (_request, reply) => {
    if (!options.features.trains) return reply.code(404).send({ error: "Train times are switched off" });
    try {
      return await board();
    } catch (error) {
      return reply.code(502).send({ error: `Couldn't get the train times: ${error instanceof Error ? error.message : "no reason given"}` });
    }
  });
};
