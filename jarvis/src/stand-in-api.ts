import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type SeenRequest = {
  path: string;
  streamed: boolean;
  model: string | null;
  system: string;
  tools: string[];
  lastUserText: string;
  body: string;
};

export type StandInScript = {
  insidePath: string;
  outsidePath: string;
};

export type StandInApi = {
  url: string;
  requests: SeenRequest[];
  close(): Promise<void>;
};

export const plainAnswer = "Stand-in answer.";
export const readInsideWord = "READ_INSIDE";
export const readOutsideWord = "READ_OUTSIDE";

type Message = { role?: unknown; content?: unknown };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: { type?: unknown; text?: unknown; content?: unknown }) => {
      if (block.type === "text" && typeof block.text === "string") return block.text;
      if (block.type === "tool_result") return `[tool result] ${textOf(block.content)}`;
      return "";
    })
    .join("\n");
}

function lastUserText(messages: Message[]): string {
  const last = [...messages].reverse().find((message) => message.role === "user");
  return last === undefined ? "" : textOf(last.content);
}

function event(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

function start(id: number): string {
  return event("message_start", {
    message: { id: `msg_stand_in_${id}`, type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } },
  });
}

function textBlock(index: number, text: string): string {
  return [
    event("content_block_start", { index, content_block: { type: "text", text: "" } }),
    event("content_block_delta", { index, delta: { type: "text_delta", text } }),
    event("content_block_stop", { index }),
  ].join("");
}

function readBlock(index: number, id: number, path: string): string {
  return [
    event("content_block_start", { index, content_block: { type: "tool_use", id: `toolu_stand_in_${id}`, name: "Read", input: {} } }),
    event("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify({ file_path: path }) } }),
    event("content_block_stop", { index }),
  ].join("");
}

function finish(reason: string): string {
  return event("message_delta", { delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 5 } }) + event("message_stop", {});
}

export function standInReply(script: StandInScript, id: number, userText: string): string {
  if (userText.includes("[tool result]")) return start(id) + textBlock(0, `I read it. ${userText.replace(/\s+/g, " ").slice(0, 200)}`) + finish("end_turn");
  if (userText.includes(readInsideWord)) return start(id) + textBlock(0, "Let me check.") + readBlock(1, id, script.insidePath) + finish("tool_use");
  if (userText.includes(readOutsideWord)) return start(id) + textBlock(0, "Let me check.") + readBlock(1, id, script.outsidePath) + finish("tool_use");
  return start(id) + textBlock(0, plainAnswer) + finish("end_turn");
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => (body += chunk));
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parsed(body: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function startStandInApi(script: StandInScript): Promise<StandInApi> {
  const requests: SeenRequest[] = [];
  let count = 0;
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const raw = await readBody(request);
    const body = parsed(raw);
    const path = (request.url ?? "").split("?")[0];
    const messages = Array.isArray(body.messages) ? (body.messages as Message[]) : [];
    const seen: SeenRequest = {
      path,
      streamed: body.stream === true,
      model: typeof body.model === "string" ? body.model : null,
      system: typeof body.system === "string" ? body.system : JSON.stringify(body.system ?? ""),
      tools: Array.isArray(body.tools) ? body.tools.map((tool: { name?: unknown }) => String(tool.name)) : [],
      lastUserText: lastUserText(messages),
      body: raw,
    };
    requests.push(seen);
    if (path !== "/v1/messages") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end("{}");
      return;
    }
    count++;
    if (!seen.streamed) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: `msg_stand_in_${count}`, type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: plainAnswer }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }));
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(standInReply(script, count, seen.lastUserText));
  }
  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
