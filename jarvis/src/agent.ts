import type { Options, SDKMessage, SDKResultMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Answer } from "./timing.js";

export type AgentStream = AsyncIterable<SDKMessage> & { close(): void };
export type StartAgent = (prompt: AsyncIterable<SDKUserMessage>, options: Options) => AgentStream;

export type AgentSettings = {
  model: string;
  system: string;
  cwd: string;
  now: () => number;
};

export type AgentSession = {
  ask(question: string): Promise<Answer>;
  readyMs(): number | null;
  costUsd(): number | null;
  close(): void;
};

export type InputQueue = {
  messages: AsyncGenerator<SDKUserMessage>;
  push(text: string): void;
  end(): void;
};

type Pending = {
  started: number;
  firstWordsMs: number | null;
  resolve: (answer: Answer) => void;
  reject: (error: Error) => void;
};

export function agentOptions(settings: AgentSettings): Options {
  return {
    model: settings.model,
    cwd: settings.cwd,
    systemPrompt: settings.system,
    tools: ["Read"],
    permissionMode: "dontAsk",
    settingSources: [],
    persistSession: false,
    strictMcpConfig: true,
    includePartialMessages: true,
  };
}

export function userMessage(text: string): SDKUserMessage {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
}

export function createInputQueue(): InputQueue {
  const waiting: SDKUserMessage[] = [];
  let wake: (() => void) | null = null;
  let ended = false;

  function wakeUp() {
    const waiter = wake;
    wake = null;
    waiter?.();
  }

  async function* messages(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const next = waiting.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (ended) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }

  return {
    messages: messages(),
    push(text: string) {
      if (ended) return;
      waiting.push(userMessage(text));
      wakeUp();
    },
    end() {
      ended = true;
      wakeUp();
    },
  };
}

function isTextDelta(message: SDKMessage): boolean {
  if (message.type !== "stream_event" || message.parent_tool_use_id !== null) return false;
  return message.event.type === "content_block_delta" && message.event.delta.type === "text_delta";
}

function denials(message: SDKResultMessage): string[] {
  return (message.permission_denials ?? []).map((denial) => denial.tool_name);
}

function resultError(message: SDKResultMessage): string {
  if (denials(message).length > 0) return `Refused: ${denials(message).join(", ")}`;
  if (message.subtype === "success") return message.result || "The agent reported an error";
  return message.errors.length > 0 ? message.errors.join("; ") : message.subtype;
}

export function startAgentSession(start: StartAgent, settings: AgentSettings): AgentSession {
  const began = settings.now();
  const input = createInputQueue();
  const stream = start(input.messages, agentOptions(settings));
  let pending: Pending | null = null;
  let ready: number | null = null;
  let cost: number | null = null;
  let stopped: Error | null = null;
  let closed = false;

  function stop(error: Error) {
    if (stopped === null) stopped = error;
    const waiting = pending;
    pending = null;
    waiting?.reject(error);
  }

  function handle(message: SDKMessage) {
    if (message.type === "system" && message.subtype === "init" && ready === null) ready = settings.now() - began;
    if (pending === null) return;
    if (pending.firstWordsMs === null && isTextDelta(message)) pending.firstWordsMs = settings.now() - pending.started;
    if (message.type !== "result") return;
    cost = message.total_cost_usd;
    const answered = pending;
    pending = null;
    if (message.subtype === "success" && !message.is_error && denials(message).length === 0) {
      answered.resolve({ text: message.result, firstWordsMs: answered.firstWordsMs, totalMs: settings.now() - answered.started });
    } else {
      answered.reject(new Error(resultError(message)));
    }
  }

  async function listen() {
    try {
      for await (const message of stream) handle(message);
      stop(new Error("The agent stopped"));
    } catch (error) {
      stop(error instanceof Error ? error : new Error(String(error)));
    }
  }

  void listen();

  return {
    ask(question: string) {
      if (stopped !== null) return Promise.reject(stopped);
      if (pending !== null) return Promise.reject(new Error("One question at a time"));
      return new Promise<Answer>((resolve, reject) => {
        pending = { started: settings.now(), firstWordsMs: null, resolve, reject };
        input.push(question);
      });
    },
    readyMs: () => ready,
    costUsd: () => cost,
    close() {
      if (closed) return;
      closed = true;
      input.end();
      stream.close();
      stop(new Error("The agent was closed"));
    },
  };
}