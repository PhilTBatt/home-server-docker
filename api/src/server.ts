import { buildApp } from "./app.js";
import { createNotifier, sendToNtfy } from "./modules/notify/notifier.js";
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

const config = readConfig(process.env);
const dealWatcher = config.features.deals ? dealWatcherFor(config) : undefined;

const trainChanges = config.features.trainAlerts ? createChangeFeed() : undefined;

const expiryChecker = config.features.expiryAlerts
  ? expiryCheckerFor(config, {
      listProblem: (message) => (message === null ? app.log.info("the expiry list can be read again") : app.log.error(message)),
      warn: (message) => app.log.warn(message),
    })
  : undefined;

const app = await buildApp({ logger: true, config, dealWatcher, trainChanges, expiryChecker });
app.log.info({ features: config.features }, "feature switches");

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
    checkAndNotify().catch((error: unknown) => {
      app.log.error(error, "notification check failed");
    });
  }

  if (config.features.heartbeat) {
    sendHeartbeat(config.healthcheckUrl).catch((error: unknown) => {
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