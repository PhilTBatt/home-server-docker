import { join } from "node:path";
import type { Config } from "../../config.js";
import { postToNtfy } from "../notify/notifier.js";
import type { EventSink } from "../events/feed.js";
import { createModes, createModeStore, type ModeLog, type Modes } from "./modes.js";

export const dataDir = "/data";

export function modesFor(config: Pick<Config, "ntfyTopic" | "modes">, log: ModeLog = {}, dir = dataDir, events?: EventSink): Modes {
  return createModes({
    store: createModeStore(join(dir, "mode.json")),
    settings: config.modes,
    send: (topic, notification) => postToNtfy(topic, notification),
    topic: config.ntfyTopic,
    log,
    events,
  });
}
