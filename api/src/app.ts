import Fastify from "fastify";
import { health } from "./modules/health/routes.js";
import { downloading, libraryCounts, media } from "./modules/media/routes.js";
import cookie from "@fastify/cookie";
import { isAuthorized, tokenFromHeader } from "./token.js";
import { auth } from "./modules/auth/routes.js";
import { doctorReads, system } from "./modules/system/routes.js";
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
import type { Reminders } from "./modules/reminders/reminders.js";

export async function buildApp(options: { logger: boolean; config: Config; dealWatcher?: DealWatcher; trainChanges?: ChangeFeed; expiryChecker?: ExpiryChecker; tries?: { heartbeat: Tries; alerts: Tries }; watchers?: Watchers; doctor?: Partial<DoctorSources>; modes?: Modes; reminders?: Reminders }) {
  const app = Fastify({ logger: options.logger, trustProxy: true });
  const dealWatcher = options.config.features.deals ? options.dealWatcher : undefined;
  const expiryChecker = options.config.features.expiryAlerts ? options.expiryChecker : undefined;
  const watching = options.watchers;

  await app.register(cookie);

  app.addHook("onRequest", async (request, reply) => {
    if (request.routeOptions.url === "/auth/login") return;

    const token = tokenFromHeader(request.headers.authorization) ?? request.cookies.hub_token ?? "";
    if (!isAuthorized(token, options.config.apiToken)) return reply.code(401).send({ error: "Unauthorized" }); 
  });

  app.register(health);
      app.register(media, {
      prefix: "/media",
      qbitApiKey: options.config.qbitApiKey,
      jellyfinApiKey: options.config.jellyfinApiKey,
    });
  app.register(auth, { prefix: "/auth", apiToken: options.config.apiToken });
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
  app.register(phone, { prefix: "/phone", features: options.config.features, ntfyTopic: options.config.ntfyTopic });
  app.register(trains, { prefix: "/trains", features: options.config.features, settings: options.config.trains, changes: options.config.features.trainAlerts ? options.trainChanges : undefined });
  app.register(expiry, { prefix: "/expiry", features: options.config.features, checker: expiryChecker });
  app.register(watchers, { prefix: "/watchers", features: options.config.features, watchers: watching });
  app.register(modes, { prefix: "/mode", features: options.config.features, modes: options.config.features.modes ? options.modes : undefined });
  app.register(reminders, { prefix: "/reminders", features: options.config.features, reminders: options.config.features.reminders ? options.reminders : undefined });
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