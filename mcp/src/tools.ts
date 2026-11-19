import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { ApiGet, ApiPost } from "./api.js";

type ReadTool = {
  name: string;
  description: string;
  path: string;
};

export const readTools: ReadTool[] = [
  {
    name: "get_status",
    description: "Uptime, memory and disk space on the home server.",
    path: "/system/status",
  },
  {
    name: "get_alerts",
    description: "Problems on the home server right now: low disk, low memory, Wi-Fi reconnects in the last 24 hours, a failed last backup, or the deal watcher being unable to check. ok is true when there are none.",
    path: "/system/alerts",
  },
  {
    name: "get_features",
    description: "Which Home Hub features are switched on: alerts, the heartbeat, the daily summary, the brain inbox, note uploads and the deal watcher.",
    path: "/system/features",
  },
  {
    name: "get_downloads",
    description: "Torrents downloading in qBittorrent right now, with progress, speed and time left.",
    path: "/media/downloads",
  },
  {
    name: "get_library",
    description: "How many movies, series and episodes are in the Jellyfin library.",
    path: "/media/library",
  },
  {
    name: "get_wifi_reconnects",
    description: "How many times the Wi-Fi watchdog has reconnected the server, with the 20 most recent, newest first.",
    path: "/system/wifi-reconnects",
  },
  {
    name: "get_backup",
    description: "When the last backup ran and whether it worked (problem is null when it did), and when the last good backup was. lastRun is null if backups have never run.",
    path: "/system/backup",
  },
  {
    name: "get_deal_status",
    description: "How the deal watcher is doing: when it last ran, today's counts of calls and alerts against their limits, where it keeps seen listings, and any problems. Fails with a 404 while the deal watcher is switched off.",
    path: "/deals/status",
  },
  {
    name: "get_deal_searches",
    description: "The searches the deal watcher is set up with: each one's name, query, whether it's switched on, when it was last checked, how many listings match now, and any problem. It never includes the listings themselves. Fails with a 404 while the deal watcher is switched off.",
    path: "/deals/searches",
  },
];

const hashInput = z.object({
  hash: z.string().regex(/^[0-9a-f]{40}$/).describe("The torrent's hash, from get_downloads"),
});

function asText(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function buildServer(get: ApiGet, post: ApiPost, actions: boolean): McpServer {
  const server = new McpServer({ name: "home-hub", version: "1.0.0" });
  for (const tool of readTools) {
    server.registerTool(tool.name, { description: tool.description }, async () => asText(await get(tool.path)));
  }
  if (!actions) return server;

  server.registerTool(
    "scan_library",
    { description: "Asks Jellyfin to scan the library for new and changed files, for example after a download finishes." },
    async () => asText(await post("/media/library/scan")),
  );

  server.registerTool(
    "stop_download",
    {
      description: "Stops a torrent in qBittorrent. A stopped torrent no longer shows in get_downloads, so keep its hash to start it again.",
      inputSchema: hashInput,
    },
    async ({ hash }) => asText(await post(`/media/downloads/${hash}/stop`)),
  );

  server.registerTool(
    "start_download",
    { description: "Starts a stopped torrent in qBittorrent again.", inputSchema: hashInput },
    async ({ hash }) => asText(await post(`/media/downloads/${hash}/start`)),
  );
  return server;
}