import type { FastifyPluginAsync } from "fastify";
import type { Features } from "../../config.js";
import { modeNames } from "../modes/modes.js";
import { aheadMostMs, idPattern, kinds, mostReminders, plainText, repeats, type Asked, type Reminders } from "./reminders.js";

export const bodyLimit = 1024;

const isoTime = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/;
const allowed = ["text", "at", "repeat", "urgent", "kind", "mode"];

export function readAsked(body: unknown, now: Date): Asked | { refused: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { refused: "Send a JSON object with text and at" };
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !allowed.includes(key))) return { refused: `Only ${allowed.join(", ")} are allowed` };
  const text = plainText(fields.text);
  if (text === null) return { refused: "text must be 1 to 200 characters of plain text" };
  if (typeof fields.at !== "string" || !isoTime.test(fields.at) || !Number.isFinite(Date.parse(fields.at))) return { refused: "at must be a time like 2026-01-31T07:00:00Z" };
  const at = new Date(Date.parse(fields.at));
  if (at.getTime() <= now.getTime()) return { refused: "at must be in the future" };
  if (at.getTime() - now.getTime() > aheadMostMs) return { refused: "at can be at most a year ahead" };
  const repeat = fields.repeat === undefined || fields.repeat === null ? null : repeats.find((one) => one === fields.repeat);
  if (repeat === undefined) return { refused: `repeat must be null or one of ${repeats.join(", ")}` };
  if (fields.urgent !== undefined && typeof fields.urgent !== "boolean") return { refused: "urgent must be true or false" };
  const kind = fields.kind === undefined ? "reminder" : kinds.find((one) => one === fields.kind);
  if (kind === undefined) return { refused: `kind must be one of ${kinds.join(", ")}` };
  if (kind === "reminder" && fields.mode !== undefined) return { refused: "mode is only for kind mode" };
  const mode = kind === "mode" ? modeNames.find((one) => one === fields.mode) : null;
  if (mode === undefined) return { refused: `mode must be one of ${modeNames.join(", ")}` };
  if (kind === "mode" && fields.urgent === true) return { refused: "A timed mode switch can't be urgent" };
  return { text, at, repeat, urgent: fields.urgent === true, kind, mode };
}

export const reminders: FastifyPluginAsync<{ features: Features; reminders?: Reminders; now?: () => Date }> = async (app, options) => {
  const switchedOff = { error: "Reminders are switched off" };
  const now = options.now ?? (() => new Date());
  const badId = { error: "id must be a reminder's id from GET /reminders" };
  const missing = { error: "No reminder with that id" };

  app.get("/", async (_request, reply) => {
    if (!options.features.reminders || options.reminders === undefined) return reply.code(404).send(switchedOff);
    return { most: mostReminders, reminders: options.reminders.list() };
  });

  app.post("/", { bodyLimit }, async (request, reply) => {
    if (!options.features.reminders || options.reminders === undefined) return reply.code(404).send(switchedOff);
    const at = now();
    const asked = readAsked(request.body, at);
    if ("refused" in asked) return reply.code(400).send({ error: asked.refused });
    const added = await options.reminders.add(asked, at);
    if ("refused" in added) return reply.code(409).send({ error: added.refused });
    return added.added;
  });

  app.get<{ Querystring: { after?: string } }>("/due", { logLevel: "warn" }, async (request, reply) => {
    if (!options.features.reminders || options.reminders === undefined) return reply.code(404).send(switchedOff);
    const after = request.query.after ?? "0";
    if (!/^\d{1,15}$/.test(after)) return reply.code(400).send({ error: "after must be a whole number from 0, the seq of the last answer" });
    return options.reminders.due(Number(after));
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!options.features.reminders || options.reminders === undefined) return reply.code(404).send(switchedOff);
    if (!idPattern.test(request.params.id)) return reply.code(400).send(badId);
    if (!(await options.reminders.cancel(request.params.id, now()))) return reply.code(404).send(missing);
    return { cancelled: request.params.id };
  });

  app.post<{ Params: { id: string } }>("/:id/snooze", { bodyLimit }, async (request, reply) => {
    if (!options.features.reminders || options.reminders === undefined) return reply.code(404).send(switchedOff);
    if (!idPattern.test(request.params.id)) return reply.code(400).send(badId);
    const body = request.body;
    const minutes = typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length === 1 ? (body as Record<string, unknown>).minutes : undefined;
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) return reply.code(400).send({ error: "Send only minutes, a whole number from 1 to 240" });
    const snoozed = await options.reminders.snooze(request.params.id, minutes, now());
    if (snoozed === null) return reply.code(404).send(missing);
    if ("refused" in snoozed) return reply.code(409).send({ error: snoozed.refused });
    return snoozed.snoozed;
  });

  app.post<{ Params: { id: string } }>("/:id/done", async (request, reply) => {
    if (!options.features.reminders || options.reminders === undefined) return reply.code(404).send(switchedOff);
    if (!idPattern.test(request.params.id)) return reply.code(400).send(badId);
    const done = await options.reminders.done(request.params.id, now());
    if (done === null) return reply.code(404).send(missing);
    return done.done === null ? { done: request.params.id, removed: true } : { done: request.params.id, removed: false, next: done.done.at };
  });
};
