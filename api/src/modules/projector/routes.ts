import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { codePattern, type Projector } from "./projector.js";

export const projectorOff = { error: "The projector is switched off" };
export const alreadyBusy = { error: "The hub is already pairing with the projector or sending it a key: wait a moment, then try again" };
export const notPairing = { error: "The projector isn't waiting for a code: press Pair first" };
export const badCode = { error: "The code is the 6 letters and numbers the projector shows, 0 to 9 and A to F" };
export const wrongCode = { error: "That code didn't match the one on the projector. Press Pair to get a new one" };
export const codeTimedOut = { error: "The projector didn't answer in time. Press Pair to try again" };
export const pairingFailed = { error: "Pairing didn't finish. Press Pair to try again" };

const smallBody = 1024;

export const projector: FastifyPluginAsync<{ features: Features; projector?: Projector }> = async (app, options) => {
  const remote = options.projector;
  app.addHook("onClose", async () => remote?.close());
  app.addHook("onRequest", async (_request, reply) => {
    if (!options.features.projector || remote === undefined) return reply.code(404).send(projectorOff);
  });

  app.get("/", async () => remote?.status());

  app.post("/pair", { bodyLimit: smallBody }, async (_request, reply) => {
    if (remote?.pair() === "busy") return reply.code(409).send(alreadyBusy);
    return reply.code(202).send({ pairing: true });
  });

  app.post<{ Body: { code: string } }>("/pair/code", { bodyLimit: smallBody, schema: { body: { type: "object", additionalProperties: false, required: ["code"], properties: { code: { type: "string", maxLength: 6 } } } } }, async (request, reply) => {
    if (!codePattern.test(request.body.code)) return reply.code(400).send(badCode);
    const result = await (remote as Projector).code(request.body.code);
    if (result === "paired") return { paired: true };
    if (result === "wrong code") return reply.code(400).send(wrongCode);
    if (result === "not pairing") return reply.code(409).send(notPairing);
    if (result === "timed out") return reply.code(504).send(codeTimedOut);
    return reply.code(502).send(pairingFailed);
  });

  app.post<{ Body: { on: boolean } }>("/power", { bodyLimit: smallBody, schema: { body: { type: "object", additionalProperties: false, required: ["on"], properties: { on: { type: "boolean" } } } } }, async (request, reply) => {
    const result = await (remote as Projector).power(request.body.on);
    if ("refused" in result) return reply.code(409).send({ error: result.refused });
    return result;
  });

  app.post("/forget", { bodyLimit: smallBody }, async () => {
    await (remote as Projector).forget();
    return { forgotten: true };
  });
};
