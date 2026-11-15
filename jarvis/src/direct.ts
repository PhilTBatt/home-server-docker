import type { Answer } from "./timing.js";

export const messagesUrl = "https://api.anthropic.com/v1/messages";

export type DirectRequest = {
  apiKey: string;
  model: string;
  system: string;
  question: string;
  maxTokens: number;
  thinkingOff: boolean;
  now: () => number;
  timeoutMs?: number;
};

export type StreamEvent = {
  type?: string;
  delta?: { type?: string; text?: string };
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
    messages: [{ role: "user", content: request.question }],
  };
  if (request.thinkingOff) body.thinking = { type: "disabled" };
  return JSON.stringify(body);
}

export async function askDirect(request: DirectRequest): Promise<Answer> {
  const started = request.now();
  const response = await fetch(messagesUrl, {
    method: "POST",
    headers: {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: requestBody(request),
    signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
  }).catch((error: Error) => {
    throw new Error(error.name === "TimeoutError" ? "The API didn't answer in time" : "Couldn't reach the API");
  });
  if (!response.ok) throw new Error(`The API replied ${response.status}: ${await errorDetails(response)}`);
  if (response.body === null) throw new Error("The API sent no answer");

  let text = "";
  let firstWordsMs: number | null = null;
  let failure: string | null = null;
  let finished = false;
  const read = createEventReader((event) => {
    if (event.type === "error") failure = event.error?.message ?? "no details";
    if (event.type === "message_stop") finished = true;
    if (event.type !== "content_block_delta" || event.delta?.type !== "text_delta") return;
    if (firstWordsMs === null) firstWordsMs = request.now() - started;
    text += event.delta.text ?? "";
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
  return { text, firstWordsMs, totalMs: request.now() - started };
}