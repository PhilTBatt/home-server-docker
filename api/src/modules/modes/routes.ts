import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { askedBy, modeNames, untilMostMs, type Asked, type Modes } from "./modes.js";

export const bodyLimit = 1024;

const isoTime = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/;

export function readAsked(body: unknown, now: Date): Asked | { refused: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { refused: "Send a JSON object with mode and by" };
  const fields = body as Record<string, unknown>;
  const unknown = Object.keys(fields).filter((key) => key !== "mode" && key !== "until" && key !== "by");
  if (unknown.length > 0) return { refused: "Only mode, until and by are allowed" };
  const mode = modeNames.find((name) => name === fields.mode);
  if (mode === undefined) return { refused: `mode must be one of ${modeNames.join(", ")}` };
  const by = askedBy.find((name) => name === fields.by);
  if (by === undefined) return { refused: `by must be one of ${askedBy.join(", ")}` };
  if (fields.until === undefined || fields.until === null) return { mode, until: null, by };
  const most = untilMostMs[mode];
  if (most === undefined) return { refused: "Only away and bedtime can have until" };
  if (typeof fields.until !== "string" || !isoTime.test(fields.until) || !Number.isFinite(Date.parse(fields.until))) return { refused: "until must be a time like 2026-01-31T07:00:00Z" };
  const until = new Date(Date.parse(fields.until));
  if (until.getTime() <= now.getTime()) return { refused: "until must be in the future" };
  if (until.getTime() - now.getTime() > most) return { refused: mode === "away" ? "until can be at most 30 days ahead for away" : "until can be at most 24 hours ahead for bedtime" };
  return { mode, until, by };
}

export const modes: FastifyPluginAsync<{ features: Features; modes?: Modes; now?: () => Date }> = async (app, options) => {
  const switchedOff = { error: "Modes are switched off" };
  const now = options.now ?? (() => new Date());

  app.get("/", async (_request, reply) => {
    if (!options.features.modes || options.modes === undefined) return reply.code(404).send(switchedOff);
    return options.modes.view();
  });

  app.post("/", { bodyLimit }, async (request, reply) => {
    if (!options.features.modes || options.modes === undefined) return reply.code(404).send(switchedOff);
    const at = now();
    const asked = readAsked(request.body, at);
    if ("refused" in asked) return reply.code(400).send({ error: asked.refused });
    const result = await options.modes.set(asked, at);
    if ("refused" in result) return reply.code(409).send({ error: result.refused });
    return result.view;
  });
};
