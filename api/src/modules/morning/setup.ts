import { join } from "node:path";
import type { Config } from "../../config.js";
import type { EventSink } from "../events/feed.js";
import { dataDir } from "../modes/setup.js";
import { createMorning, createMorningStore, type Morning, type MorningLog } from "./morning.js";

export function morningFor(config: Pick<Config, "morning">, mode: (() => string | null) | undefined, log: MorningLog = {}, events?: EventSink, dir = dataDir): Morning {
  return createMorning({ settings: config.morning, store: createMorningStore(join(dir, "morning.json")), mode, log, events });
}
