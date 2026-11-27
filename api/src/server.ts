import { buildApp } from "./app.js";
import { createNotifier, holdWith, sendToNtfy } from "./modules/notify/notifier.js";
import { currentProblems, readStatus } from "./modules/system/routes.js";
import { sendHeartbeat } from "./modules/notify/heartbeat.js";
import { createDailySummary } from "./modules/notify/daily.js";
import { readConfig } from "./config.js";
import { countWaiting } from "./modules/memory/routes.js";
import { readBackupState } from "./modules/system/backup.js";
import { dealWatcherFor } from "./modules/deals/setup.js";
import { boardForAlerts, createTrainAlerts, tickMs, type AlertHooks } from "./modules/trains/alerts.js";
import { createJourneyAlerts, journeysForAlerts } from "./modules/trains/journey-alerts.js";
import { createChangeFeed } from "./modules/trains/changes.js";
import { expiryCheckerFor } from "./modules/expiry/setup.js";
import { expiringLine } from "./modules/expiry/checker.js";
import { createTries } from "./modules/system/doctor.js";
import { watchersFor } from "./modules/watchers/setup.js";
import { checkEveryMs } from "./modules/watchers/watchers.js";
import { modesFor } from "./modules/modes/setup.js";
import { tickMs as modeTickMs } from "./modules/modes/modes.js";
import { remindersFor } from "./modules/reminders/setup.js";
import { tickMs as reminderTickMs } from "./modules/reminders/reminders.js";
import { choresFor } from "./modules/chores/setup.js";

const config = readConfig(process.env);
const dealWatcher = config.features.deals ? dealWatcherFor(config) : undefined;

const trainChanges = config.features.trainAlerts ? createChangeFeed() : undefined;

const expiryChecker = config.features.expiryAlerts
  ? expiryCheckerFor(config, {
      listProblem: (message) => (message === null ? app.log.info("the expiry list can be read again") : app.log.error(message)),
      warn: (message) => app.log.warn(message),
    })
  : undefined;

const tries = { heartbeat: createTries(), alerts: createTries() };

const watchers = config.features.watchers ? watchersFor(config) : undefined;

const modes = config.features.modes
  ? modesFor(config, {
      info: (fields, message) => app.log.info({ modes: fields }, message),
      warn: (fields, message) => app.log.warn({ modes: fields }, message),
    })
  : undefined;

const reminders = config.features.reminders
  ? remindersFor(config, modes, {
      info: (fields, message) => app.log.info({ reminders: fields }, message),
      warn: (fields, message) => app.log.warn({ reminders: fields }, message),
    })
  : undefined;

const chores = config.features.chores
  ? choresFor({
      info: (fields, message) => app.log.info({ chores: fields }, message),
      warn: (fields, message) => app.log.warn({ chores: fields }, message),
    })
  : undefined;

const app = await buildApp({ logger: true, config, dealWatcher, trainChanges, expiryChecker, tries, watchers, modes, reminders, chores });
app.log.info({ features: config.features }, "feature switches");

if (modes !== undefined) {
  await modes.load(new Date());
  holdWith((topic, notification) => modes.take(topic, notification, new Date()));
  app.log.info({ modes: { bedtimeFrom: config.modes.bedtimeFrom, bedtimeUntil: config.modes.bedtimeUntil, tickMs: modeTickMs } }, "modes are on: bedtime holds phone alerts that aren't urgent");
  setInterval(() => {
    modes.tick(new Date()).catch((error: unknown) => {
      app.log.error(error, "mode check failed");
    });
  }, modeTickMs);
}

if (reminders !== undefined) {
  await reminders.load(new Date());
  setInterval(() => {
    reminders.tick(new Date()).catch((error: unknown) => {
      app.log.error(error, "reminder check failed");
    });
  }, reminderTickMs);
}

await app.listen({ port: 3000, host: "0.0.0.0" });


const allProblems = () => currentProblems(undefined, [...(dealWatcher?.problems() ?? []), ...(expiryChecker?.problems() ?? [])]);
const checkAndNotify = createNotifier(config.ntfyTopic, allProblems);
const countDeals = () => {
  const searches = dealWatcher?.searches() ?? [];
  return { on: searches.filter((search) => search.on).length, off: searches.filter((search) => !search.on).length };
};
const sendDailySummary = createDailySummary(config.ntfyTopic, readStatus, allProblems, 8, config.features, countWaiting, readBackupState, dealWatcher === undefined ? undefined : countDeals, expiryChecker === undefined ? undefined : (now) => expiryChecker.list(now).then(expiringLine));

function runCheck() {
  if (config.features.alerts) {
    checkAndNotify()
      .then(() => tries.alerts.ok(new Date()))
      .catch((error: unknown) => {
        tries.alerts.failed(new Date());
        app.log.error(error, "notification check failed");
      });
  }

  if (config.features.heartbeat) {
    sendHeartbeat(config.healthcheckUrl)
      .then(() => tries.heartbeat.ok(new Date()))
      .catch((error: unknown) => {
        tries.heartbeat.failed(new Date());
        app.log.error(error, "heartbeat failed");
      });
  }

  if (config.features.dailySummary) {
    sendDailySummary(new Date()).catch((error: unknown) => {
      app.log.error(error, "daily summary failed");
    });
  }

  if (dealWatcher !== undefined) {
    dealWatcher
      .run(new Date())
      .then((summary) => {
        if (summary.unsent) app.log.warn("some deal alerts couldn't be sent and will be tried again");
      })
      .catch((error: unknown) => {
        app.log.error(error, "deal check failed");
      });
  }

  if (expiryChecker !== undefined) {
    expiryChecker
      .run(new Date())
      .then((result) => {
        if (result === "unsent") app.log.warn("the expiry warnings couldn't be sent and will be tried again");
      })
      .catch((error: unknown) => {
        app.log.error(error, "expiry check failed");
      });
  }
}

runCheck();
setInterval(runCheck, 5 * 60 * 1000);

if (config.features.trainAlerts) {
  const hooks: AlertHooks = {
    settings: config.trainAlerts,
    send: (notification) => sendToNtfy(config.ntfyTopic, notification),
    changed: (lines, at) => trainChanges?.add(lines, at),
    warn: (message) => app.log.warn(message),
    info: (message) => app.log.info(message),
  };
  const journey = config.trains.journey;
  const checkTrains = journey === undefined ? createTrainAlerts({ ...hooks, board: boardForAlerts(config.trains) }) : createJourneyAlerts({ ...hooks, boards: journeysForAlerts(config.trains), walk: journey.walk });
  const runTrainCheck = () => {
    checkTrains(new Date()).catch((error: unknown) => {
      app.log.error(error, "train check failed");
    });
  };
  runTrainCheck();
  setInterval(runTrainCheck, tickMs);
}

if (watchers !== undefined) {
  const runWatchers = () => {
    watchers
      .run(new Date())
      .then((summary) => {
        if (typeof summary === "string") return;
        if (summary.fired > 0) app.log.info(`${summary.fired} watcher${summary.fired === 1 ? "" : "s"} fired`);
        if (summary.expired > 0) app.log.info(`${summary.expired} watcher${summary.expired === 1 ? "" : "s"} expired`);
        if (summary.unsent > 0) app.log.warn("a watcher's notification couldn't be sent");
        if (summary.dropped > 0) app.log.warn("a watcher expired before its notification could be sent");
      })
      .catch((error: unknown) => {
        app.log.error(error, "watcher check failed");
      });
  };
  setInterval(runWatchers, checkEveryMs);
}