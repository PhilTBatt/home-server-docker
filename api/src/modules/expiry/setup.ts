import { join } from "node:path";
import type { Config } from "../../config.js";
import { sendToNtfy } from "../notify/notifier.js";
import { createExpiryChecker, createSentStore, type ExpiryChecker } from "./checker.js";
import { loadList } from "./list.js";

const expiryDir = "/expiry";

export function expiryCheckerFor(config: Pick<Config, "ntfyTopic">, log: { listProblem?: (message: string | null) => void; warn?: (message: string) => void } = {}, dir = expiryDir): ExpiryChecker {
  return createExpiryChecker({
    load: () => loadList(join(dir, "items.json")),
    store: createSentStore(join(dir, "sent.json")),
    send: (notification) => sendToNtfy(config.ntfyTopic, notification),
    ...log,
  });
}
