import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Features } from "../../config.js";
import { isAuthorized, tokenFromHeader } from "../../token.js";
import { isAudience, narrower, type Audience, type EventFeed } from "./feed.js";

export const eventsOff = { error: "The events feed is switched off" };
export const feedWaitMs = 20_000;
export const mostAsked = 500;
const quiet = { logLevel: "warn" as const };

export function wallReach(mode: (() => string | null) | undefined): Audience {
  const now = mode?.() ?? null;
  return now !== null && now !== "guest" ? "home" : "room";
}

export const events: FastifyPluginAsync<{ features: Features; feed?: EventFeed; apiToken: string; mode?: () => string | null; waitMs?: number }> = async (app, options) => {
  const { feed } = options;
  const waitMs = options.waitMs ?? feedWaitMs;
  const closing = new AbortController();
  app.addHook("onClose", async () => closing.abort());

  app.addHook("onRequest", async (_request, reply) => {
    if (!options.features.events || feed === undefined) return reply.code(404).send(eventsOff);
  });

  const reachOf = (request: FastifyRequest<{ Querystring: { for?: string } }>): Audience | { refused: string } => {
    const token = tokenFromHeader(request.headers.authorization) ?? request.cookies.hub_token ?? "";
    const reach: Audience = isAuthorized(token, options.apiToken) ? "owner" : wallReach(options.mode);
    const asked = request.query.for;
    if (asked === undefined) return reach;
    if (!isAudience(asked)) return { refused: "for must be room, home or owner" };
    return narrower(reach, asked);
  };

  app.get<{ Querystring: { for?: string; most?: string } }>("/today", quiet, async (request, reply) => {
    const reach = reachOf(request);
    if (typeof reach !== "string") return reply.code(400).send({ error: reach.refused });
    const most = request.query.most ?? "100";
    if (!/^\d{1,3}$/.test(most) || Number(most) < 1 || Number(most) > mostAsked) return reply.code(400).send({ error: `most must be a whole number from 1 to ${mostAsked}` });
    const { day, seq, events: shown, more } = (feed as EventFeed).answer(-1, reach, Number(most));
    return reply.header("cache-control", "no-store").send({ day, seq, reach, events: shown, more });
  });

  app.get<{ Querystring: { after?: string; for?: string } }>("/feed", quiet, async (request, reply) => {
    const reach = reachOf(request);
    if (typeof reach !== "string") return reply.code(400).send({ error: reach.refused });
    const after = request.query.after ?? "-1";
    if (!/^(-1|\d{1,15})$/.test(after)) return reply.code(400).send({ error: "after must be -1 or a whole number, the seq of the last answer" });
    const gone = new AbortController();
    reply.raw.once("close", () => gone.abort());
    await (feed as EventFeed).waitForChange(Number(after), waitMs, AbortSignal.any([gone.signal, closing.signal]));
    const reachNow = reachOf(request);
    if (typeof reachNow !== "string") return reply.code(400).send({ error: reachNow.refused });
    return reply.header("cache-control", "no-store").send({ ...(feed as EventFeed).answer(Number(after), reachNow), reach: reachNow });
  });
};
