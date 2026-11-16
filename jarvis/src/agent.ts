import type { Options, SDKMessage, SDKResultMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Answer } from "./timing.js";

export const closedMessage = "The agent was closed";

export type AgentStream = AsyncIterable<SDKMessage> & { close(): void };
export type StartAgent = (prompt: AsyncIterable<SDKUserMessage>, options: Options) => AgentStream;

export type AgentSettings = {
  model: string;
  system: string;
  cwd: string;
  now: () => number;
};

export type AnswerListener = {
  text?: (delta: string) => void;
  tool?: (name: string, input: unknown) => void;
  restart?: () => void;
};

export type AgentSession = {
  ask(question: string, listener?: AnswerListener): Promise<Answer>;
  readyMs(): number | null;
  costUsd(): number | null;
  stoppedReason(): string | null;
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
  listener: AnswerListener;
  rounds: number;
  toolUses: number;
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
    title: "Jarvis",
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

function textDelta(message: SDKMessage): string | null {
  if (message.type !== "stream_event" || message.parent_tool_use_id !== null) return null;
  if (message.event.type !== "content_block_delta" || message.event.delta.type !== "text_delta") return null;
  return message.event.delta.text;
}

function startsRound(message: SDKMessage): boolean {
  return message.type === "stream_event" && message.parent_tool_use_id === null && message.event.type === "message_start";
}

function toolCalls(message: SDKMessage): { name: string; input: unknown }[] {
  if (message.type !== "assistant" || message.parent_tool_use_id !== null) return [];
  return message.message.content.flatMap((block) => (block.type === "tool_use" ? [{ name: block.name, input: block.input }] : []));
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
    const text = textDelta(message);
    if (text !== null) {
      if (pending.firstWordsMs === null) pending.firstWordsMs = settings.now() - pending.started;
      pending.listener.text?.(text);
    }
    if (startsRound(message)) pending.rounds++;
    for (const call of toolCalls(message)) {
      pending.toolUses++;
      pending.listener.tool?.(call.name, call.input);
    }
    if (message.type !== "result") return;
    const costBefore = cost ?? 0;
    cost = message.total_cost_usd;
    const answered = pending;
    pending = null;
    if (message.subtype === "success" && !message.is_error && denials(message).length === 0) {
      const usage = message.usage;
      answered.resolve({
        text: message.result,
        firstWordsMs: answered.firstWordsMs,
        totalMs: settings.now() - answered.started,
        stats: {
          rounds: answered.rounds,
          toolUses: answered.toolUses,
          inputTokens: (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
          cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          costUsd: Math.max(0, message.total_cost_usd - costBefore),
          earlierThinkingBlocks: null,
          recovered: false,
        },
      });
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
    ask(question: string, listener: AnswerListener = {}) {
      if (stopped !== null) return Promise.reject(stopped);
      if (pending !== null) return Promise.reject(new Error("One question at a time"));
      return new Promise<Answer>((resolve, reject) => {
        pending = { started: settings.now(), firstWordsMs: null, resolve, reject, listener, rounds: 0, toolUses: 0 };
        input.push(question);
      });
    },
    readyMs: () => ready,
    costUsd: () => cost,
    stoppedReason: () => stopped?.message ?? null,
    close() {
      if (closed) return;
      closed = true;
      input.end();
      stream.close();
      stop(new Error(closedMessage));
    },
  };
}