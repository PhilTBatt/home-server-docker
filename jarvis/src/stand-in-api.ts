import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, relative } from "node:path";
import type { Engine } from "./config.js";

export type SeenToolResult = { text: string; isError: boolean };

export type SeenRequest = {
  path: string;
  streamed: boolean;
  model: string | null;
  system: string;
  tools: string[];
  lastUserText: string;
  toolResults: SeenToolResult[];
  asked: string | null;
  body: string;
};

export type StandInScript = {
  insidePath: string;
  outsidePath: string;
  gitPath: string;
  linkedPath: string;
};

export type StandInApi = {
  url: string;
  requests: SeenRequest[];
  close(): Promise<void>;
};

export type ToolCall = { name: string; input: Record<string, unknown> };

export const plainAnswer = "Stand-in answer.";
export const readInsideWord = "READ_INSIDE";
export const readOutsideWord = "READ_OUTSIDE";
export const searchInsideWord = "SEARCH_INSIDE";
export const searchOutsideWord = "SEARCH_OUTSIDE";
export const findInsideWord = "FIND_INSIDE";
export const findOutsideWord = "FIND_OUTSIDE";
export const readGitWord = "READ_GIT";
export const readLinkedWord = "READ_LINKED";
export const searchHiddenWord = "SEARCH_HIDDEN";
export const searchIgnoredWord = "SEARCH_IGNORED";
export const findIgnoredWord = "FIND_IGNORED";
export const searchCaseWord = "SEARCH_CASE";
export const searchLongWord = "SEARCH_LONG";
export const insideText = "stand-in brain";
export const outsideText = "outside the brain";
export const hiddenText = "hidden note";
export const ignoredText = "ignored note";
export const ignoredName = "ignored-note.md";
export const caseText = "mixed case note";
export const longText = "long line";
export const longName = "long-line.md";

type Message = { role?: unknown; content?: unknown };
type Block = { type?: unknown; text?: unknown; content?: unknown; is_error?: unknown };

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: Block) => block.type === "text" && typeof block.text === "string")
    .map((block: Block) => block.text)
    .join("\n");
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: Block) => {
      if (block.type === "text" && typeof block.text === "string") return block.text;
      if (block.type === "tool_result") return `[tool result] ${contentText(block.content)}`;
      return "";
    })
    .join("\n");
}

function lastUser(messages: Message[]): Message | undefined {
  return [...messages].reverse().find((message) => message.role === "user");
}

function toolResultsOf(message: Message | undefined): SeenToolResult[] {
  if (message === undefined || !Array.isArray(message.content)) return [];
  return message.content.filter((block: Block) => block.type === "tool_result").map((block: Block) => ({ text: contentText(block.content), isError: block.is_error === true }));
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

function toolBlock(index: number, id: number, call: ToolCall): string {
  return [
    event("content_block_start", { index, content_block: { type: "tool_use", id: `toolu_stand_in_${id}`, name: call.name, input: {} } }),
    event("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(call.input) } }),
    event("content_block_stop", { index }),
  ].join("");
}

function finish(reason: string): string {
  return event("message_delta", { delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 5 } }) + event("message_stop", {});
}

function calls(script: StandInScript): [string, Record<Engine, ToolCall>][] {
  const brain = dirname(script.insidePath);
  const outside = dirname(script.outsidePath);
  const fromBrain = (path: string) => relative(brain, path) || ".";
  const read = (path: string): Record<Engine, ToolCall> => ({ sdk: { name: "Read", input: { file_path: path } }, api: { name: "read_file", input: { path: fromBrain(path) } } });
  const search = (text: string, path: string, mode = "content"): Record<Engine, ToolCall> => ({ sdk: { name: "Grep", input: { pattern: text, path, output_mode: mode } }, api: { name: "search_files", input: { text, path: fromBrain(path) } } });
  const find = (pattern: string, name: string, path: string): Record<Engine, ToolCall> => ({ sdk: { name: "Glob", input: { pattern, path } }, api: { name: "find_files", input: { name, path: fromBrain(path) } } });
  return [
    [readInsideWord, read(script.insidePath)],
    [readOutsideWord, read(script.outsidePath)],
    [readGitWord, read(script.gitPath)],
    [readLinkedWord, read(script.linkedPath)],
    [searchInsideWord, search("brain", brain)],
    [searchOutsideWord, search(outsideText, outside, "files_with_matches")],
    [findInsideWord, find("**/*", ".", brain)],
    [findOutsideWord, find("**/*", ".", outside)],
    [searchHiddenWord, search(hiddenText, brain)],
    [searchIgnoredWord, search(ignoredText, brain)],
    [findIgnoredWord, find("**/*ignored*", "ignored", brain)],
    [searchCaseWord, search(caseText.toUpperCase(), brain)],
    [searchLongWord, search(longText, brain)],
  ];
}

export function toolCallFor(script: StandInScript, engine: Engine, userText: string): ToolCall | null {
  const found = calls(script).find(([word]) => userText.includes(word));
  return found === undefined ? null : found[1][engine];
}

export function echoFor(userText: string): string {
  return `I read it. ${Array.from(userText.replace(/\s+/g, " ")).slice(0, 200).join("")}`;
}

export function standInReply(script: StandInScript, engine: Engine, id: number, userText: string): string {
  if (userText.includes("[tool result]")) return start(id) + textBlock(0, echoFor(userText)) + finish("end_turn");
  const call = toolCallFor(script, engine, userText);
  if (call !== null) return start(id) + textBlock(0, "Let me look.") + toolBlock(1, id, call) + finish("tool_use");
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

export async function startStandInApi(script: StandInScript, engine: Engine = "sdk"): Promise<StandInApi> {
  const requests: SeenRequest[] = [];
  let count = 0;
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const raw = await readBody(request);
    const body = parsed(raw);
    const path = (request.url ?? "").split("?")[0];
    const messages = Array.isArray(body.messages) ? (body.messages as Message[]) : [];
    const last = lastUser(messages);
    const seen: SeenRequest = {
      path,
      streamed: body.stream === true,
      model: typeof body.model === "string" ? body.model : null,
      system: typeof body.system === "string" ? body.system : JSON.stringify(body.system ?? ""),
      tools: Array.isArray(body.tools) ? body.tools.map((tool: { name?: unknown }) => String(tool.name)) : [],
      lastUserText: last === undefined ? "" : textOf(last.content),
      toolResults: toolResultsOf(last),
      asked: null,
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
    if (!seen.lastUserText.includes("[tool result]")) seen.asked = toolCallFor(script, engine, seen.lastUserText)?.name ?? null;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(standInReply(script, engine, count, seen.lastUserText));
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
