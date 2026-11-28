import Fastify from "fastify";
import { health } from "./modules/health/routes.js";
import { downloading, libraryCounts, media } from "./modules/media/routes.js";
import cookie from "@fastify/cookie";
import { isAuthorized, tokenFromHeader } from "./token.js";
import { auth } from "./modules/auth/routes.js";
import { doctorReads, readStatus, system } from "./modules/system/routes.js";
import { countWaiting, memory } from "./modules/memory/routes.js";
import type { Config } from "./config.js";
import { deals } from "./modules/deals/routes.js";
import { phone } from "./modules/phone/routes.js";
import { boardFor, trains } from "./modules/trains/routes.js";
import type { DealWatcher } from "./modules/deals/watcher.js";
import type { ChangeFeed } from "./modules/trains/changes.js";
import { expiry } from "./modules/expiry/routes.js";
import type { ExpiryChecker } from "./modules/expiry/checker.js";
import { kept, runDoctor, type DoctorSources, type Tries } from "./modules/system/doctor.js";
import { watchers } from "./modules/watchers/routes.js";
import type { Watchers } from "./modules/watchers/watchers.js";
import { catchUpDoctorMs, createCatchUp } from "./modules/catchup/catchup.js";
import { catchUp } from "./modules/catchup/routes.js";
import { modes } from "./modules/modes/routes.js";
import type { Modes } from "./modules/modes/modes.js";
import { reminders } from "./modules/reminders/routes.js";
import { talk } from "./modules/talk/routes.js";
import type { Reminders } from "./modules/reminders/reminders.js";
import { chores } from "./modules/chores/routes.js";
import type { Chores } from "./modules/chores/chores.js";
import { sessions } from "./modules/sessions/routes.js";
import type { Sessions } from "./modules/sessions/sessions.js";
import { spotify, type SpotifyParts } from "./modules/spotify/routes.js";
import { spotifyFor } from "./modules/spotify/setup.js";
import { wall, wallCookie, wallReads } from "./modules/wall/routes.js";
import { projector } from "./modules/projector/routes.js";
import type { Projector } from "./modules/projector/projector.js";
import { morning } from "./modules/morning/routes.js";
import type { Morning } from "./modules/morning/morning.js";
import { events } from "./modules/events/routes.js";
import type { EventFeed } from "./modules/events/feed.js";
import type { JarvisDesk } from "./modules/wall/jarvis.js";
import { trainPage } from "./modules/wall/page-data.js";
import { serverMapPage } from "./modules/wall/server-map.js";
import { createJarvisSwitches, switchboardPage } from "./modules/wall/switchboard.js";
import { createTally, readBootTime, securityPage, type Tally } from "./modules/wall/security.js";
import { healthPage } from "./modules/wall/health.js";
import type { Status } from "./modules/system/alerts.js";
import { buildPicture, keptPicture, wallDoctorMs, wallTrainsMs, type WallSources } from "./modules/wall/picture.js";

export async function buildApp(options: { logger: boolean; config: Config; dealWatcher?: DealWatcher; trainChanges?: ChangeFeed; expiryChecker?: ExpiryChecker; tries?: { heartbeat: Tries; alerts: Tries }; watchers?: Watchers; doctor?: Partial<DoctorSources>; modes?: Modes; reminders?: Reminders; chores?: Chores; sessions?: Sessions; spotify?: SpotifyParts; jarvisDesk?: JarvisDesk; wallSources?: Partial<WallSources>; projector?: Projector; events?: EventFeed; morning?: Morning; tally?: Tally; bootTime?: (now: Date) => Promise<Date | null>; startedAt?: Date; status?: () => Promise<Status> }) {
  const app = Fastify({ logger: options.logger, trustProxy: true });
  const startedAt = options.startedAt ?? new Date();
  const tally = options.tally ?? createTally(startedAt);
  const dealWatcher = options.config.features.deals ? options.dealWatcher : undefined;
  const expiryChecker = options.config.features.expiryAlerts ? options.expiryChecker : undefined;
  const watching = options.watchers;

  await app.register(cookie);

  app.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.url === "/auth/login" || request.routeOptions.url === "/wall/pair" || request.routeOptions.url === "/wall/logout") return;

    const token = tokenFromHeader(request.headers.authorization) ?? request.cookies.hub_token ?? "";
    if (isAuthorized(token, options.config.apiToken)) return;
    const shown = tokenFromHeader(request.headers.authorization) ?? request.cookies[wallCookie] ?? "";
    if (options.config.features.wall && wallReads.has(`${request.method} ${request.routeOptions.url}`) && isAuthorized(shown, options.config.wall.token)) return;
    if (request.headers.authorization !== undefined || request.cookies.hub_token !== undefined || request.cookies[wallCookie] !== undefined) tally.add("token", new Date());
    return reply.code(401).send({ error: "Unauthorized" });
  });

  app.register(health);
      app.register(media, {
      prefix: "/media",
      qbitApiKey: options.config.qbitApiKey,
      jellyfinApiKey: options.config.jellyfinApiKey,
    });
  app.register(auth, { prefix: "/auth", apiToken: options.config.apiToken, guard: options.config.login.guard, tally });
  const asked: DoctorSources = {
    heartbeat: options.tries?.heartbeat,
    alerts: options.tries?.alerts,
    downloads: (signal) => downloading(options.config.qbitApiKey, signal),
    library: (signal) => libraryCounts(options.config.jellyfinApiKey, signal),
    inbox: () => countWaiting(),
    trains: boardFor(options.config.trains),
    expiries: expiryChecker === undefined ? undefined : (now) => expiryChecker.list(now),
    watchers: watching === undefined ? undefined : () => watching.list(),
    ...options.doctor,
  };
  const doctor: DoctorSources = { ...asked, downloads: kept(asked.downloads), library: kept(asked.library), trains: kept(() => asked.trains()) };
  const moreProblems = () => [...(dealWatcher?.problems() ?? []), ...(expiryChecker?.problems() ?? [])];
  app.register(system, { prefix: "/system", features: options.config.features, moreProblems, doctor });
  const features = options.config.features;
  const catchingUp = createCatchUp({
    repos: options.config.catchUp.repos,
    token: options.config.catchUp.token,
    hub: {
      server: () => runDoctor(features, { ...doctor, waitMs: catchUpDoctorMs }, doctorReads(undefined, moreProblems), new Date()),
      problems: () => doctorReads(undefined, moreProblems).problems(),
      backup: () => doctorReads().backup(),
      inbox: features.memoryInbox ? doctor.inbox : undefined,
      expiries: doctor.expiries,
      watchers: features.watchers ? doctor.watchers : undefined,
    },
  });
  app.register(catchUp, { prefix: "/catch-up", features, catchUp: catchingUp });
  app.register(memory, { prefix: "/memory", features: options.config.features });
  const feed = options.config.features.events ? options.events : undefined;
  app.register(phone, { prefix: "/phone", features: options.config.features, ntfyTopic: options.config.ntfyTopic, ring: options.config.phone, events: feed });
  app.register(trains, { prefix: "/trains", features: options.config.features, settings: options.config.trains, changes: options.config.features.trainAlerts ? options.trainChanges : undefined });
  app.register(expiry, { prefix: "/expiry", features: options.config.features, checker: expiryChecker });
  app.register(watchers, { prefix: "/watchers", features: options.config.features, watchers: watching });
  app.register(modes, { prefix: "/mode", features: options.config.features, modes: options.config.features.modes ? options.modes : undefined });
  app.register(reminders, { prefix: "/reminders", features: options.config.features, reminders: options.config.features.reminders ? options.reminders : undefined });
  app.register(morning, { prefix: "/morning", features: options.config.features, morning: options.config.features.morning ? options.morning : undefined });
  app.register(projector, { prefix: "/projector", features: options.config.features, projector: options.config.features.projector ? options.projector : undefined });
  app.register(chores, { prefix: "/chores", features: options.config.features, chores: options.config.features.chores ? options.chores : undefined });
  app.register(sessions, { prefix: "/sessions", features: options.config.features, sessions: options.config.features.sessions ? options.sessions : undefined });
  const spotifyParts = options.config.features.spotify ? (options.spotify ?? spotifyFor(options.config.spotify, (line) => app.log.info(line))) : undefined;
  app.register(spotify, { prefix: "/spotify", features: options.config.features, spotify: spotifyParts });
  app.register(talk, { prefix: "/talk", features: options.config.features });
  const shown: WallSources = {
    mode: features.modes && options.modes !== undefined ? () => (options.modes as Modes).view() : undefined,
    doctor: kept(() => runDoctor(features, doctor, doctorReads(undefined, moreProblems), new Date()), wallDoctorMs),
    problems: () => doctorReads(undefined, moreProblems).problems(),
    backup: () => doctorReads().backup(),
    trains: features.trains ? kept(() => doctor.trains(), wallTrainsMs) : undefined,
    reminders: features.reminders && options.reminders !== undefined ? () => (options.reminders as Reminders).list() : undefined,
    deals: dealWatcher === undefined ? undefined : (now) => dealWatcher.status(now),
    playing: spotifyParts === undefined ? undefined : () => spotifyParts.client.playing(),
    morning: features.morning && options.morning !== undefined ? (now) => (options.morning as Morning).view(now) : undefined,
    ...options.wallSources,
  };
  const picture = keptPicture(() => buildPicture(shown, { speaking: options.config.wall.speaking, remote: options.config.wall.remote, trainAlerts: features.trainAlerts ? options.config.trainAlerts : null }, new Date()));
  const trainsShown = shown.trains;
  const doctorShown = shown.doctor;
  const jarvisSwitches = createJarvisSwitches();
  const byHand = { dealsAi: options.config.deals.ai, loginGuard: options.config.login.guard };
  const pageDetails = {
    train: trainsShown === undefined ? undefined : async () => trainPage(await trainsShown()),
    server: doctorShown === undefined ? undefined : async () => serverMapPage(await doctorShown().catch(() => null)),
    switches: async () => switchboardPage(features, byHand, jarvisSwitches.view(Date.now())),
    health: doctorShown === undefined ? undefined : async () => {
      const [report, status] = await Promise.all([doctorShown().catch(() => null), (options.status ?? readStatus)().catch(() => null)]);
      return healthPage(report, status);
    },
    security: async () => {
      const now = new Date();
      const [backup, bootAt] = await Promise.all([shown.backup().catch(() => null), (options.bootTime ?? readBootTime)(now).catch(() => null)]);
      return securityPage({ guard: options.config.login.guard, wallOn: features.wall, tally: tally.view(now), backup, bootAt, apiAt: startedAt, now });
    },
  };
  app.register(wall, { prefix: "/wall", features: options.config.features, settings: options.config.wall, guard: options.config.login.guard, desk: options.jarvisDesk, picture, events: feed, pageDetails, jarvisSwitches, tally, mode: features.modes && options.modes !== undefined ? () => (options.modes as Modes).view().mode : undefined });
  app.register(events, { prefix: "/events", features: options.config.features, feed, apiToken: options.config.apiToken, mode: features.modes && options.modes !== undefined ? () => (options.modes as Modes).view().mode : undefined });
  app.register(deals, {
    prefix: "/deals",
    features: options.config.features,
    watcher: dealWatcher,
    seen: options.config.deals.seen,
    environment: options.config.deals.ebayEnvironment,
    ai: options.config.deals.ai,
  });
  return app;
}