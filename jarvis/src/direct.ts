import type { Answer } from "./timing.js";

export const messagesUrl = "https://api.anthropic.com/v1/messages";

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ThinkingBlock = { type: "thinking"; thinking: string; signature: string };
export type RedactedThinkingBlock = { type: "redacted_thinking"; data: string };
export type OtherBlock = { type: string; [field: string]: unknown };
export type AssistantBlock = TextBlock | ToolUseBlock | ThinkingBlock | RedactedThinkingBlock | OtherBlock;

export type Turn = { role: "user"; content: string | ToolResultBlock[] } | { role: "assistant"; content: string | AssistantBlock[] };

export type ToolDefinition = { name: string; description: string; input_schema: Record<string, unknown> };

export type DirectRequest = {
  apiKey: string;
  model: string;
  system: string;
  question: string | ToolResultBlock[];
  history?: Turn[];
  tools?: ToolDefinition[];
  maxTokens: number;
  thinkingOff: boolean;
  now: () => number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
};

export type DirectAnswer = Answer & {
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  content: AssistantBlock[];
  stopReason: string | null;
};

type Usage = { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };

export type StreamEvent = {
  type?: string;
  index?: number;
  content_block?: Record<string, unknown>;
  delta?: { type?: string; text?: string; thinking?: string; signature?: string; partial_json?: string; stop_reason?: string };
  message?: { usage?: Usage };
  usage?: Usage;
  error?: { message?: string };
};

export function createEventReader(onEvent: (event: StreamEvent) => void): (chunk: string) => void {
  let buffer = "";
  return (chunk: string) => {
    buffer = (buffer + chunk).replaceAll("\r\n", "\n");
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
      }
      end = buffer.indexOf("\n\n");
    }
  };
}

async function errorDetails(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? "no details";
  } catch {
    return "no details";
  }
}

function readingError(error: unknown): string {
  if (error instanceof SyntaxError) return "The API sent something unreadable";
  if (error instanceof Error && error.name === "TimeoutError") return "The API didn't answer in time";
  return "The connection dropped mid-answer";
}

function requestBody(request: DirectRequest): string {
  const body: Record<string, unknown> = {
    model: request.model,
    max_tokens: request.maxTokens,
    system: request.system,
    stream: true,
    messages: [...(request.history ?? []), { role: "user", content: request.question }],
  };
  if (request.tools !== undefined && request.tools.length > 0) body.tools = request.tools;
  if (request.thinkingOff) body.thinking = { type: "disabled" };
  return JSON.stringify(body);
}

type BlockInProgress = { block: OtherBlock; json: string | null };

function appended(block: OtherBlock, field: string, more: string | undefined) {
  block[field] = `${typeof block[field] === "string" ? block[field] : ""}${more ?? ""}`;
}

function createBlockCollector() {
  const open = new Map<number, BlockInProgress>();
  const done = new Map<number, AssistantBlock>();
  return {
    take(event: StreamEvent) {
      const index = event.index ?? 0;
      if (event.type === "content_block_start" && event.content_block !== undefined) {
        const block = structuredClone(event.content_block) as OtherBlock;
        open.set(index, { block, json: block.type === "tool_use" ? "" : null });
      }
      const current = open.get(index);
      if (current === undefined) return;
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") appended(current.block, "text", event.delta.text);
      if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") appended(current.block, "thinking", event.delta.thinking);
      if (event.type === "content_block_delta" && event.delta?.type === "signature_delta") appended(current.block, "signature", event.delta.signature);
      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && current.json !== null) current.json += event.delta.partial_json ?? "";
      if (event.type !== "content_block_stop") return;
      open.delete(index);
      if (current.json !== null) current.block.input = current.json === "" ? {} : JSON.parse(current.json);
      done.set(index, current.block);
    },
    blocks(): AssistantBlock[] {
      return [...done.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
    },
  };
}

function abortSignal(request: DirectRequest): AbortSignal {
  const timeout = AbortSignal.timeout(request.timeoutMs ?? 60_000);
  return request.signal === undefined ? timeout : AbortSignal.any([timeout, request.signal]);
}

export async function askDirect(request: DirectRequest): Promise<DirectAnswer> {
  const started = request.now();
  const response = await fetch(messagesUrl, {
    method: "POST",
    headers: {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: requestBody(request),
    signal: abortSignal(request),
  }).catch((error: Error) => {
    throw new Error(error.name === "TimeoutError" ? "The API didn't answer in time" : "Couldn't reach the API");
  });
  if (!response.ok) throw new Error(`The API replied ${response.status}: ${await errorDetails(response)}`);
  if (response.body === null) throw new Error("The API sent no answer");

  let text = "";
  let firstWordsMs: number | null = null;
  let failure: string | null = null;
  let finished = false;
  let inputTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  const collector = createBlockCollector();
  const read = createEventReader((event) => {
    collector.take(event);
    if (event.type === "error") failure = event.error?.message ?? "no details";
    if (event.type === "message_stop") finished = true;
    if (event.type === "message_start") {
      inputTokens = event.message?.usage?.input_tokens ?? 0;
      cacheWriteTokens = event.message?.usage?.cache_creation_input_tokens ?? 0;
      cacheReadTokens = event.message?.usage?.cache_read_input_tokens ?? 0;
    }
    if (event.type === "message_delta") {
      inputTokens = event.usage?.input_tokens ?? inputTokens;
      cacheWriteTokens = event.usage?.cache_creation_input_tokens ?? cacheWriteTokens;
      cacheReadTokens = event.usage?.cache_read_input_tokens ?? cacheReadTokens;
      outputTokens = event.usage?.output_tokens ?? outputTokens;
    }
    if (event.type === "message_delta") stopReason = event.delta?.stop_reason ?? stopReason;
    if (event.type !== "content_block_delta" || event.delta?.type !== "text_delta") return;
    if (firstWordsMs === null) firstWordsMs = request.now() - started;
    const delta = event.delta.text ?? "";
    text += delta;
    request.onText?.(delta);
  });
  const decoder = new TextDecoder();
  try {
    for await (const chunk of response.body) read(decoder.decode(chunk, { stream: true }));
    read(decoder.decode());
  } catch (error) {
    throw new Error(readingError(error));
  }
  if (failure !== null) throw new Error(`The API stopped with an error: ${failure}`);
  if (!finished) throw new Error("The answer was cut off");
  return { text, firstWordsMs, totalMs: request.now() - started, inputTokens, cacheWriteTokens, cacheReadTokens, outputTokens, content: collector.blocks(), stopReason };
}