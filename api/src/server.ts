import { buildApp } from "./app.js";
import { createNotifier, sendToNtfy } from "./modules/notify/notifier.js";
import { currentProblems, readStatus } from "./modules/system/routes.js";
import { sendHeartbeat } from "./modules/notify/heartbeat.js";
import { createDailySummary } from "./modules/notify/daily.js";
import { readConfig } from "./config.js";
import { countWaiting } from "./modules/memory/routes.js";
import { readBackupState } from "./modules/system/backup.js";
import { dealWatcherFor } from "./modules/deals/setup.js";
import { boardForAlerts, createTrainAlerts, tickMs } from "./modules/trains/alerts.js";

const config = readConfig(process.env);
const dealWatcher = config.features.deals ? dealWatcherFor(config) : undefined;

const app = await buildApp({ logger: true, config, dealWatcher });
app.log.info({ features: config.features }, "feature switches");

await app.listen({ port: 3000, host: "0.0.0.0" });


const allProblems = () => currentProblems(undefined, dealWatcher?.problems());
const checkAndNotify = createNotifier(config.ntfyTopic, allProblems);
const countDeals = () => {
  const searches = dealWatcher?.searches() ?? [];
  return { on: searches.filter((search) => search.on).length, off: searches.filter((search) => !search.on).length };
};
const sendDailySummary = createDailySummary(config.ntfyTopic, readStatus, allProblems, 8, config.features, countWaiting, readBackupState, dealWatcher === undefined ? undefined : countDeals);

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
}

runCheck();
setInterval(runCheck, 5 * 60 * 1000);

if (config.features.trainAlerts) {
  const checkTrains = createTrainAlerts({
    settings: config.trainAlerts,
    board: boardForAlerts(config.trains),
    send: (notification) => sendToNtfy(config.ntfyTopic, notification),
    warn: (message) => app.log.warn(message),
    info: (message) => app.log.info(message),
  });
  const runTrainCheck = () => {
    checkTrains(new Date()).catch((error: unknown) => {
      app.log.error(error, "train check failed");
    });
  };
  runTrainCheck();
  setInterval(runTrainCheck, tickMs);
}