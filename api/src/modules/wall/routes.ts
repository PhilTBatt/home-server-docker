import type { FastifyPluginAsync } from "fastify";
import type { Features, WallSettings } from "../../config.js";
import { createJarvisDesk, readReport, type JarvisDesk } from "./jarvis.js";
import { codePattern, createPairings, pairCookie, pairIdPattern, pairingMs, type Pairings } from "./pairing.js";
import type { WallPicture } from "./picture.js";
import type { EventSink } from "../events/feed.js";
import { hiddenNow, isPageBy, isPageId, pageBys, pageIds, pageShownMs, wallPages } from "./pages.js";

export const nextWaitMs = 20_000;
export const privacyCheckMs = 1_000;
export const wallCookie = "wall_token";
export const wallCookieDays = 365;
export const wallReads = new Set(["GET /wall", "GET /wall/jarvis", "GET /wall/pages/:id", "GET /events/today", "GET /events/feed"]);
export const switchedOff = { error: "The wall is switched off" };
export const noSuchCode = { error: "No screen is showing that code. Check the code on the screen and try again." };
export const tooManyWrongCodes = { error: "Too many wrong codes, so every screen that was pairing starts again with a new code." };

const bodyLimit = 4 * 1024;
const quiet = { logLevel: "warn" as const };

export const plainHttpPairing = { error: "Pair at https://hub.home: with LOGIN_GUARD on, pairing over plain http is refused" };
export const pairNeedsJson = { error: "Ask for a code with a JSON body, application/json" };
export const noSuchPage = { error: `page must be one of the wall's pages: ${pageIds.join(", ")}` };
export const pageByWrong = { error: `by must be ${pageBys.join(", ")}` };
export const privateInGuest = { error: "That page is private, so it isn't shown while the hub is in guest mode" };
export const noPageDetails = { error: "That page has nothing more than its card on the wall yet, or what it shows is switched off" };
export const pageDetailsFailed = { error: "The hub couldn't read that page's details just now" };

export const wall: FastifyPluginAsync<{ features: Features; settings: WallSettings; guard?: boolean; desk?: JarvisDesk; pairings?: Pairings; picture?: () => Promise<WallPicture>; now?: () => number; waitMs?: number; events?: EventSink; mode?: () => string | null; pageDetails?: Partial<Record<string, () => Promise<unknown>>> }> = async (app, options) => {
  const desk = options.desk ?? createJarvisDesk();
  const pairings = options.pairings ?? createPairings();
  const now = options.now ?? (() => Date.now());
  const waitMs = options.waitMs ?? nextWaitMs;
  const hidden = (id: string) => hiddenNow(options.settings.privatePages, options.mode?.() ?? null)(id);
  const shownView = () => {
    const view = desk.view(now());
    const privateNow = options.settings.privatePages.filter(hidden);
    if (view.page === null || hidden(view.page.id)) return { ...view, page: null, privateNow };
    const id = view.page.id;
    return { ...view, page: { ...view.page, title: wallPages.find((one) => one.id === id)?.title ?? id }, privateNow };
  };
  const privateKey = () => options.settings.privatePages.filter(hidden).join(",");
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
      options.events?.post("screen.paired");
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

  app.get<{ Querystring: { after?: string; private?: string } }>("/jarvis", quiet, async (request, reply) => {
    const after = request.query.after ?? "-1";
    if (!/^(-1|\d{1,15})$/.test(after)) return reply.code(400).send({ error: "after must be -1 or a whole number, the seq of the last answer" });
    const held = request.query.private;
    if (held !== undefined && (typeof held !== "string" || !/^([a-z]{1,20}(,[a-z]{1,20}){0,49})?$/.test(held))) return reply.code(400).send({ error: "private must be the page names the screen was last told are private, with commas between" });
    const gone = new AbortController();
    reply.raw.once("close", () => gone.abort());
    const signal = AbortSignal.any([gone.signal, closing.signal]);
    const privateBefore = held === undefined ? privateKey() : options.settings.privatePages.filter((id) => held.split(",").includes(id)).join(",");
    const started = Date.now();
    while (!signal.aborted && desk.view(now()).seq === Number(after) && privateKey() === privateBefore && Date.now() - started < waitMs) {
      await desk.waitForChange(Number(after), Math.min(privacyCheckMs, waitMs - (Date.now() - started)), signal);
    }
    return reply.header("cache-control", "no-store").send(shownView());
  });

  app.get("/pages", quiet, async (_request, reply) => {
    return reply.header("cache-control", "no-store").send({ pages: wallPages.map((page) => ({ ...page, private: options.settings.privatePages.includes(page.id) })), seconds: pageShownMs / 1000 });
  });

  app.get<{ Params: { id: string } }>("/pages/:id", quiet, async (request, reply) => {
    const id = request.params.id;
    if (!isPageId(id)) return reply.code(404).send(noSuchPage);
    if (hidden(id)) return reply.code(403).send(privateInGuest);
    const read = options.pageDetails?.[id];
    if (read === undefined) return reply.code(404).send(noPageDetails);
    try {
      const details = await read();
      return reply.header("cache-control", "no-store").send({ id, at: new Date(now()).toISOString(), details });
    } catch (error) {
      app.log.warn({ page: { id, why: error instanceof Error ? error.message.slice(0, 120) : "no reason given" } }, "a page's details couldn't be read");
      return reply.code(502).send(pageDetailsFailed);
    }
  });

  app.post("/page", { bodyLimit }, async (request, reply) => {
    const body = typeof request.body === "object" && request.body !== null ? (request.body as Record<string, unknown>) : {};
    if (!isPageId(body.page)) return reply.code(400).send(noSuchPage);
    if (!isPageBy(body.by)) return reply.code(400).send(pageByWrong);
    if (hidden(body.page)) {
      app.log.info({ page: { id: body.page, by: body.by, refused: "private in guest mode" } }, "a private page wasn't opened on the wall, in guest mode");
      return reply.code(403).send(privateInGuest);
    }
    desk.openPage(body.page, body.by, now());
    app.log.info({ page: { id: body.page, by: body.by } }, "a page was opened on the wall");
    return { open: body.page, seconds: pageShownMs / 1000 };
  });

  app.post("/page/back", { bodyLimit }, async (request, reply) => {
    const body = typeof request.body === "object" && request.body !== null ? (request.body as Record<string, unknown>) : {};
    if (!isPageBy(body.by)) return reply.code(400).send(pageByWrong);
    const was = desk.closePage(now());
    app.log.info({ page: { by: body.by, wasOpen: was } }, "the wall was sent back to its main page");
    return { back: was };
  });
};
