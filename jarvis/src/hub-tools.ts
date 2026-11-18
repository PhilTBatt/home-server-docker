import { existsSync } from "node:fs";

export const hubServerFile = "/mcp/dist/server.js";
export const hubServerName = "hub";
export const hubToolPrefix = `mcp__${hubServerName}__`;

export const hubReadTools = ["get_status", "get_alerts", "get_features", "get_downloads", "get_library", "get_wifi_reconnects", "get_backup"];
export const hubActionTools = ["scan_library", "stop_download", "start_download"];
export const notDoneNote = "Phil didn't say yes, so it wasn't done";

export type HubServer = { command: string; args: string[]; token: string; actions?: boolean };

export function hubServerFor(token: string, actions = false, file = hubServerFile): HubServer {
  return { command: process.execPath, args: [file], token, actions };
}

export function actionsEnv(server: HubServer): Record<string, string> {
  return { MCP_ACTIONS: server.actions === true ? "on" : "off" };
}

export function hubServerEnv(server: HubServer): Record<string, string> {
  return { API_TOKEN: server.token, ...actionsEnv(server) };
}

export function allowedHubTools(server: HubServer): string[] {
  return server.actions === true ? [...hubReadTools, ...hubActionTools] : hubReadTools;
}

export function isHubAction(name: string): boolean {
  return hubActionTools.includes(name);
}

function download(input: unknown): string {
  const hash = typeof input === "object" && input !== null ? (input as Record<string, unknown>).hash : undefined;
  if (typeof hash !== "string" || !/^[0-9a-f]+$/i.test(hash)) return "a download";
  return hash.length > 8 ? `the download whose hash starts ${hash.slice(0, 8)}` : `the download ${hash}`;
}

export function actionQuestion(name: string, input: unknown): string {
  const what: Record<string, string> = { scan_library: "scan the library", stop_download: `stop ${download(input)}`, start_download: `start ${download(input)} again` };
  return `Jarvis wants to ${what[name] ?? `use ${name}`}. Type yes to let him, or anything else to stop it`;
}

export function withHubToken(env: Record<string, string | undefined>, hub: HubServer | undefined): Record<string, string | undefined> {
  const { API_TOKEN: _, ...rest } = env;
  return hub === undefined ? rest : { ...rest, API_TOKEN: hub.token };
}

export function hubNotBuilt(file: string): string {
  return `JARVIS_HUB_TOOLS is on, but the MCP server isn't built: there's no ${file}. Build it with npm ci and npm test in mcp/, as the README says`;
}

export function checkHubServer(file: string, exists: (path: string) => boolean = existsSync): void {
  if (!exists(file)) throw new Error(hubNotBuilt(file));
}

export function hubProblemNote(status: string): string {
  return `The hub's tools didn't load (${status}), so in this chat Jarvis can only read the brain`;
}
