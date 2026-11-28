import type { FastifyPluginAsync } from "fastify";
import type { Features, WallSettings } from "../../config.js";
import { createJarvisDesk, readReport, type JarvisDesk } from "./jarvis.js";
import { codePattern, createPairings, pairCookie, pairIdPattern, pairingMs, type Pairings } from "./pairing.js";
import type { WallPicture } from "./picture.js";

export const nextWaitMs = 20_000;
export const wallCookie = "wall_token";
export const wallCookieDays = 365;
export const wallReads = new Set(["GET /wall", "GET /wall/jarvis"]);
export const switchedOff = { error: "The wall is switched off" };
export const noSuchCode = { error: "No screen is showing that code. Check the code on the screen and try again." };
export const tooManyWrongCodes = { error: "Too many wrong codes, so every screen that was pairing starts again with a new code." };

const bodyLimit = 4 * 1024;
const quiet = { logLevel: "warn" as const };

export const plainHttpPairing = { error: "Pair at https://hub.home: with LOGIN_GUARD on, pairing over plain http is refused" };
export const pairNeedsJson = { error: "Ask for a code with a JSON body, application/json" };

export const wall: FastifyPluginAsync<{ features: Features; settings: WallSettings; guard?: boolean; desk?: JarvisDesk; pairings?: Pairings; picture?: () => Promise<WallPicture>; now?: () => number; waitMs?: number }> = async (app, options) => {
  const desk = options.desk ?? createJarvisDesk();
  const pairings = options.pairings ?? createPairings();
  const now = options.now ?? (() => Date.now());
  const waitMs = options.waitMs ?? nextWaitMs;
  const closing = new AbortController();
  app.addHook("onClose", async () => closing.abort());

  app.addHook("preHandler", async (_request, reply) => {
    if (!options.features.wall) return reply.code(404).send(switchedOff);
  });

  app.get("/", async (_request, reply) => {
    if (options.picture === undefined) return reply.code(503).send({ error: "The wall has nothing to show yet" });
    try {
      return reply.header("cache-control", "no-store").send(await options.picture());
    } catch {
      return reply.code(502).send({ error: "Couldn't put the wall's picture together" });
    }
  });

  const plainRefused = (protocol: string) => options.guard === true && protocol !== "https";
  const pairOf = (cookies: Record<string, string | undefined>): string | undefined => {
    const id = cookies[pairCookie];
    return id !== undefined && pairIdPattern.test(id) ? id : undefined;
  };

  app.post("/pair", { bodyLimit }, async (request, reply) => {
    if (plainRefused(request.protocol)) return reply.code(403).send(plainHttpPairing);
    if (!/^application\/json(;|$)/.test(request.headers["content-type"] ?? "")) return reply.code(415).send(pairNeedsJson);
    const started = pairings.start(now(), pairOf(request.cookies));
    if ("refused" in started) {
      app.log.warn({ pairing: { refused: "too many", live: pairings.live(now()) } }, "a screen couldn't start pairing: too many are pairing");
      return reply.code(429).send({ error: started.refused });
    }
    reply.setCookie(pairCookie, started.id, { httpOnly: true, secure: "auto", sameSite: "strict", path: "/", maxAge: Math.round(pairingMs / 1000) });
    app.log.info({ pairing: { started: true, replaced: started.replaced, live: pairings.live(now()) } }, "a screen started pairing, showing a code");
    return reply.header("cache-control", "no-store").send({ code: started.code, seconds: Math.round(pairingMs / 1000) });
  });

  app.get("/pair", quiet, async (request, reply) => {
    if (plainRefused(request.protocol)) return reply.code(403).send(plainHttpPairing);
    const id = pairOf(request.cookies);
    reply.header("cache-control", "no-store");
    if (id === undefined) return { state: "gone", seconds: 0 };
    const gone = new AbortController();
    reply.raw.once("close", () => gone.abort());
    const seen = await pairings.wait(id, waitMs, AbortSignal.any([gone.signal, closing.signal]), now);
    if (gone.signal.aborted) return seen;
    if (seen.state === "paired" && pairings.collect(id, now())) {
      reply.setCookie(wallCookie, options.settings.token, { httpOnly: true, secure: "auto", sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * wallCookieDays });
      reply.clearCookie(pairCookie, { path: "/", secure: "auto" });
      app.log.info({ pairing: { collected: true } }, "a paired screen took its login and can show the wall");
      return { state: "paired", seconds: 0 };
    }
    if (seen.state === "gone") reply.clearCookie(pairCookie, { path: "/", secure: "auto" });
    return seen;
  });

  app.post("/pair/confirm", { bodyLimit }, async (request, reply) => {
    const code = typeof request.body === "object" && request.body !== null ? (request.body as Record<string, unknown>).code : undefined;
    if (typeof code !== "string" || !codePattern.test(code)) return reply.code(400).send({ error: "code must be the 6 digits the screen shows" });
    const result = pairings.confirm(code, now());
    if (result === "paired") {
      app.log.info({ pairing: { confirmed: true } }, "a screen was paired from the phone");
      return { paired: true };
    }
    if (result === "dropped") {
      app.log.warn({ pairing: { refused: "too many wrong codes", dropped: true } }, "every pairing was dropped after too many wrong codes");
      return reply.code(429).send(tooManyWrongCodes);
    }
    app.log.warn({ pairing: { refused: "wrong code" } }, "a pairing code was wrong");
    return reply.code(404).send(noSuchCode);
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
