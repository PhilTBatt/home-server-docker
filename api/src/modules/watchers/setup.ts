import type { Config } from "../../config.js";
import { downloading, finishedDownloads, libraryCounts } from "../media/routes.js";
import { sendToNtfy } from "../notify/notifier.js";
import { readStatus } from "../system/routes.js";
import { createWatchers, type Watchers } from "./watchers.js";

export function watchersFor(config: Pick<Config, "ntfyTopic" | "qbitApiKey" | "jellyfinApiKey">): Watchers {
  return createWatchers({
    sources: {
      finished: (signal) => finishedDownloads(config.qbitApiKey, signal),
      disk: async () => {
        const status = await readStatus();
        return { freeGB: status.diskAvailableGB, totalGB: status.diskTotalGB };
      },
      answering: {
        qbittorrent: (signal) => downloading(config.qbitApiKey, signal),
        jellyfin: (signal) => libraryCounts(config.jellyfinApiKey, signal),
      },
    },
    send: (notification) => sendToNtfy(config.ntfyTopic, notification),
  });
}
