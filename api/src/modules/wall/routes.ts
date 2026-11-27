import type { FastifyPluginAsync } from "fastify";
import type { Features, WallSettings } from "../../config.js";
import { isAuthorized } from "../../token.js";
import { createJarvisDesk, readReport, type JarvisDesk } from "./jarvis.js";

export const nextWaitMs = 20_000;
export const wallCookie = "wall_token";
export const wallCookieDays = 365;
export const wallReads = new Set(["GET /wall/jarvis"]);
export const switchedOff = { error: "The wall is switched off" };

const bodyLimit = 4 * 1024;
const quiet = { logLevel: "warn" as const };

export const wall: FastifyPluginAsync<{ features: Features; settings: WallSettings; desk?: JarvisDesk; now?: () => number; waitMs?: number }> = async (app, options) => {
  const desk = options.desk ?? createJarvisDesk();
  const now = options.now ?? (() => Date.now());
  const waitMs = options.waitMs ?? nextWaitMs;
  const closing = new AbortController();
  app.addHook("onClose", async () => closing.abort());

  app.addHook("preHandler", async (_request, reply) => {
    if (!options.features.wall) return reply.code(404).send(switchedOff);
  });

  app.post("/login", { bodyLimit }, async (request, reply) => {
    const token = typeof request.body === "object" && request.body !== null ? (request.body as Record<string, unknown>).token : undefined;
    if (typeof token !== "string" || token.length > 200 || !isAuthorized(token, options.settings.token)) return reply.code(401).send({ error: "Unauthorized" });
    reply.setCookie(wallCookie, token, { httpOnly: true, secure: "auto", sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * wallCookieDays });
    app.log.info("a screen logged in to the wall");
    return { status: "logged in" };
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(wallCookie, { path: "/", secure: "auto" });
    return { status: "logged out" };
  });

  app.post("/jarvis", { ...quiet, bodyLimit }, async (request, reply) => {
    const report = readReport(request.body);
    if ("refused" in report) return reply.code(400).send({ error: report.refused });
    return { seq: desk.report(report, now()) };
  });

  app.get<{ Querystring: { after?: string } }>("/jarvis", quiet, async (request, reply) => {
    const after = request.query.after ?? "-1";
    if (!/^(-1|\d{1,15})$/.test(after)) return reply.code(400).send({ error: "after must be -1 or a whole number, the seq of the last answer" });
    const gone = new AbortController();
    reply.raw.once("close", () => gone.abort());
    await desk.waitForChange(Number(after), waitMs, AbortSignal.any([gone.signal, closing.signal]));
    return reply.header("cache-control", "no-store").send(desk.view(now()));
  });
};
