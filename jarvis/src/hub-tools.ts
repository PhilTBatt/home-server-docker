import { existsSync } from "node:fs";

export const hubServerFile = "/mcp/dist/server.js";
export const hubServerName = "hub";
export const hubToolPrefix = `mcp__${hubServerName}__`;

export type HubServer = { command: string; args: string[]; token: string };

export function hubServerFor(token: string, file = hubServerFile): HubServer {
  return { command: process.execPath, args: [file], token };
}

export const readOnlyEnv = { MCP_ACTIONS: "off" };

export function hubServerEnv(server: HubServer): Record<string, string> {
  return { API_TOKEN: server.token, ...readOnlyEnv };
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
