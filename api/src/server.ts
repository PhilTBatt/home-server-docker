import { buildApp } from "./app.js";
import { createNotifier } from "./modules/notify/notifier.js";
import { currentProblems } from "./modules/system/routes.js";
import { sendHeartbeat } from "./modules/notify/heartbeat.js";

const ntfyTopic = process.env.NTFY_TOPIC;
if (!ntfyTopic) {
  throw new Error("NTFY_TOPIC is not set");
}

const healthcheckUrl = process.env.HEALTHCHECK_URL ?? "";
if (!healthcheckUrl) {
  throw new Error("HEALTHCHECK_URL is not set");
}

const app = await buildApp({ logger: true });

await app.listen({ port: 3000, host: "0.0.0.0" });


const checkAndNotify = createNotifier(ntfyTopic, currentProblems);

function runCheck() {
  checkAndNotify().catch((error: unknown) => {
    app.log.error(error, "notification check failed");
    app.log.error(error, "notification check failed");
  });

  sendHeartbeat(healthcheckUrl).catch((error: unknown) => {
    app.log.error(error, "heartbeat failed");
  });
}

runCheck();
setInterval(runCheck, 5 * 60 * 1000);