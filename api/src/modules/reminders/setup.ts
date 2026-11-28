import { join } from "node:path";
import type { Config } from "../../config.js";
import { dataDir } from "../modes/setup.js";
import type { Modes } from "../modes/modes.js";
import { clearOnNtfy, sendToNtfy } from "../notify/notifier.js";
import { createReminders, createReminderStore, type ReminderLog, type Reminders } from "./reminders.js";

export function remindersFor(config: Pick<Config, "ntfyTopic">, modes: Modes | undefined, log: ReminderLog = {}, dir = dataDir): Reminders {
  return createReminders({
    store: createReminderStore(join(dir, "reminders.json")),
    send: (notification) => sendToNtfy(config.ntfyTopic, notification),
    clear: (sequence) => clearOnNtfy(config.ntfyTopic, sequence),
    modes,
    log,
  });
}
