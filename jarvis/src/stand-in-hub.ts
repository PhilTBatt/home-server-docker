import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hubActionTools, hubReadTools, hubWallTools } from "./hub-tools.js";

export const standInHubFile = fileURLToPath(new URL("./stand-in-hub.js", import.meta.url));
export const hubReadToolNames = hubReadTools;
export const hubActionToolNames = hubActionTools;
export const hubAnswer = "stand-in hub answer";

export type HubCall = { tool: string; input: unknown; token: string | null; actions: string | null; anthropicKey: boolean };

type Request = { id?: unknown; method?: unknown; params?: unknown };

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

export function hubToolNames(env: Record<string, string | undefined>): string[] {
  const wall = env.MCP_WALL_PAGES === "on" ? hubWallTools : [];
  return env.MCP_ACTIONS === "on" ? [...hubReadToolNames, ...wall, ...hubActionToolNames] : [...hubReadToolNames, ...wall];
}

export function hubReply(request: Request, env: Record<string, string | undefined>, record: (call: HubCall) => void): Record<string, unknown> | null {
  if (request.id === undefined || request.id === null) return null;
  const result = (value: unknown) => ({ jsonrpc: "2.0", id: request.id, result: value });
  const names = hubToolNames(env);
  switch (request.method) {
    case "initialize": {
      const version = field(request.params, "protocolVersion");
      return result({ protocolVersion: typeof version === "string" ? version : "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "stand-in-hub", version: "1.0.0" } });
    }
    case "ping":
      return result({});
    case "tools/list":
      return result({ tools: names.map((name) => ({ name, description: `Stand-in ${name}.`, inputSchema: { type: "object", properties: {} } })) });
    case "tools/call": {
      const name = field(request.params, "name");
      if (typeof name !== "string" || !names.includes(name)) return result({ content: [{ type: "text", text: `No tool called ${String(name)}` }], isError: true });
      record({ tool: name, input: field(request.params, "arguments") ?? null, token: env.API_TOKEN ?? null, actions: env.MCP_ACTIONS ?? null, anthropicKey: Boolean(env.ANTHROPIC_API_KEY) });
      return result({ content: [{ type: "text", text: JSON.stringify({ tool: name, answer: hubAnswer }) }] });
    }
    default:
      return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } };
  }
}

function serve(logFile: string) {
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    let request: Request;
    try {
      request = JSON.parse(line) as Request;
    } catch {
      return;
    }
    const reply = hubReply(request, process.env, (call) => appendFileSync(logFile, `${JSON.stringify(call)}\n`));
    if (reply !== null) process.stdout.write(`${JSON.stringify(reply)}\n`);
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) serve(process.argv[2] ?? "/dev/null");
