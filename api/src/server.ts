import { buildApp } from "./app.js";
import { createNotifier } from "./modules/notify/notifier.js";
import { currentProblems } from "./modules/system/routes.js";

const ntfyTopic = process.env.NTFY_TOPIC;
if (!ntfyTopic) {
  throw new Error("NTFY_TOPIC is not set");
}

const app = await buildApp({ logger: true });

await app.listen({ port: 3000, host: "0.0.0.0" });


const checkAndNotify = createNotifier(ntfyTopic, currentProblems);

function runCheck() {
  checkAndNotify().catch((error: unknown) => {
    app.log.error(error, "notification check failed");
  });
}

runCheck();
setInterval(runCheck, 5 * 60 * 1000);