import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { BrainTools } from "./brain-tools.js";
import type { ToolDefinition } from "./direct.js";
import { allowedHubTools, hubProblemNote, hubServerEnv, needsHubYes, type HubServer } from "./hub-tools.js";
import { withTimeout } from "./run.js";

export const hubStartMs = 10_000;

export type HubTools = BrainTools & { close(): Promise<void> };

export type HubConnection = {
  listTools(): Promise<{ tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[] }>;
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<{ content?: unknown; isError?: boolean }>;
  close(): Promise<void>;
};

export type ConnectHub = (server: HubServer, timeoutMs: number) => Promise<HubConnection>;

export const connectOverStdio: ConnectHub = async (server, timeoutMs) => {
  const transport = new StdioClientTransport({ command: server.command, args: server.args, env: { ...getDefaultEnvironment(), ...hubServerEnv(server) }, stderr: "ignore" });
  const client = new Client({ name: "jarvis", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: timeoutMs });
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  return client as unknown as HubConnection;
};

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: { type?: unknown; text?: unknown }) => block.type === "text" && typeof block.text === "string")
    .map((block: { text: string }) => block.text)
    .join("\n");
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startHubTools(server: HubServer, warn: (note: string) => void, connect: ConnectHub = connectOverStdio, timeoutMs = hubStartMs): Promise<HubTools | undefined> {
  let connection: HubConnection | undefined;
  let problem = "failed";
  try {
    const connecting = connect(server, timeoutMs);
    connection = await withTimeout(connecting, timeoutMs, () => {
      void connecting.then((late) => late.close()).catch(() => {});
    });
    const open = connection;
    const allowed = allowedHubTools(server);
    const tools = (await withTimeout(open.listTools(), timeoutMs)).tools.filter((tool) => allowed.includes(tool.name));
    if (tools.length === 0) {
      problem = "no tools listed";
      throw new Error(problem);
    }
    const definitions: ToolDefinition[] = tools.map((tool) => ({ name: tool.name, description: tool.description ?? "", input_schema: tool.inputSchema }));
    return {
      definitions,
      async run(name, input) {
        try {
          const args = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
          const result = await open.callTool({ name, arguments: args });
          return { content: textOf(result.content), isError: result.isError === true };
        } catch (error) {
          return { content: `The hub's tool didn't work: ${reason(error)}`, isError: true };
        }
      },
      needsYes: (name) => needsHubYes(server, name),
      close: () => open.close(),
    };
  } catch {
    await connection?.close().catch(() => {});
    warn(hubProblemNote(problem));
    return undefined;
  }
}

export function withHubTools(brain: BrainTools, hub: HubTools | undefined): BrainTools {
  if (hub === undefined) return brain;
  const brainNames = new Set(brain.definitions.map((tool) => tool.name));
  const hubDefinitions = hub.definitions.filter((tool) => !brainNames.has(tool.name));
  const hubNames = new Set(hubDefinitions.map((tool) => tool.name));
  return {
    definitions: [...brain.definitions, ...hubDefinitions],
    run: (name, input) => (hubNames.has(name) ? hub.run(name, input) : brain.run(name, input)),
    needsYes: (name) => hubNames.has(name) && hub.needsYes?.(name) === true,
  };
}
