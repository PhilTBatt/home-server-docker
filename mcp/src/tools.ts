import { McpServer } from "@modelcontextprotocol/server";
import type { ApiGet } from "./api.js";

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
    description: "Problems on the home server right now: low disk, low memory or Wi-Fi reconnects in the last 24 hours. ok is true when there are none.",
    path: "/system/alerts",
  },
  {
    name: "get_features",
    description: "Which Home Hub features are switched on: alerts, the heartbeat and the daily summary.",
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
];

export function buildServer(get: ApiGet): McpServer {
  const server = new McpServer({ name: "home-hub", version: "1.0.0" });
  for (const tool of readTools) {
    server.registerTool(tool.name, { description: tool.description }, async () => {
      const data = await get(tool.path);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    });
  }
  return server;
}