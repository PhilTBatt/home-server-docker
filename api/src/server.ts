import { buildApp } from "./app.js";
import { createNotifier } from "./modules/notify/notifier.js";
import { currentProblems, readStatus } from "./modules/system/routes.js";
import { sendHeartbeat } from "./modules/notify/heartbeat.js";
import { createDailySummary } from "./modules/notify/daily.js";
import { readConfig } from "./config.js";

const config = readConfig(process.env);

const app = await buildApp({ logger: true, config });
app.log.info({ features: config.features }, "feature switches");

await app.listen({ port: 3000, host: "0.0.0.0" });


const checkAndNotify = createNotifier(config.ntfyTopic, currentProblems);
const sendDailySummary = createDailySummary(config.ntfyTopic, readStatus, currentProblems, 8, config.features);

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
}

runCheck();
setInterval(runCheck, 5 * 60 * 1000);