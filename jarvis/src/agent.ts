import type { HookCallback, McpSdkServerConfigWithInstance, Options, SDKMessage, SDKResultMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { actionsEnv, hubNoYesTools, hubProblemNote, hubReadTools, hubServerName, hubToolPrefix, isHubAction, notDoneNote, withHubToken, type HubServer } from "./hub-tools.js";
import { answerCost, pricesPerMTok, type Prices, type TokenUse } from "./prices.js";
import type { Answer } from "./timing.js";
import { sdkLookUpTool, webServerName } from "./look-up-tool.js";

export const closedMessage = "The agent was closed";

export type AgentStream = AsyncIterable<SDKMessage> & { close(): void };
export type Confirm = (tool: string, input: unknown) => Promise<boolean>;
export const actionHookSeconds = 300;
export type StartAgent = (prompt: AsyncIterable<SDKUserMessage>, options: Options) => AgentStream;

export type AgentSettings = {
  model: string;
  system: string;
  cwd: string;
  now: () => number;
  env?: Record<string, string | undefined>;
  savedChats?: string;
  hub?: HubServer;
  web?: McpSdkServerConfigWithInstance;
  brain?: boolean;
};

export const privacyEnv = { DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" };

export type AnswerListener = {
  text?: (delta: string) => void;
  tool?: (name: string, input: unknown) => void;
  restart?: () => void;
  retry?: () => void;
  note?: (text: string) => void;
  confirm?: Confirm;
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
  largestRequestTokens: number | null;
  lastRequestTokens: number | null;
  requests: TokenUse[] | null;
  spoke: boolean;
  spokeFirst: boolean | null;
};

export function actionHook(confirm: Confirm): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse" || !input.tool_name.startsWith(hubToolPrefix)) return {};
    const tool = input.tool_name.slice(hubToolPrefix.length);
    if (!isHubAction(tool)) return {};
    const yes = await confirm(tool, input.tool_input).catch(() => false);
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: yes ? "allow" : "deny", permissionDecisionReason: yes ? "Phil said yes" : notDoneNote } };
  };
}

export function agentOptions(settings: AgentSettings, confirm: Confirm = async () => false): Options {
  return {
    model: settings.model,
    cwd: settings.cwd,
    systemPrompt: settings.system,
    tools: settings.brain === false ? [] : ["Read", "Grep", "Glob"],
    disallowedTools: settings.brain === false ? [] : ["Read(./.git/**)"],
    permissionMode: "dontAsk",
    settingSources: [],
    persistSession: settings.savedChats !== undefined,
    continue: settings.savedChats !== undefined,
    strictMcpConfig: true,
    title: "Jarvis",
    includePartialMessages: true,
    env: withHubToken({ ...(settings.env ?? process.env), ...privacyEnv, ...(settings.savedChats === undefined ? {} : { CLAUDE_CONFIG_DIR: settings.savedChats }) }, settings.hub),
    ...(settings.hub === undefined && settings.web === undefined
      ? {}
      : {
          mcpServers: {
            ...(settings.hub === undefined ? {} : { [hubServerName]: { type: "stdio" as const, command: settings.hub.command, args: settings.hub.args, env: actionsEnv(settings.hub), alwaysLoad: true } }),
            ...(settings.web === undefined ? {} : { [webServerName]: settings.web }),
          },
          allowedTools: [...(settings.hub === undefined ? [] : [...hubReadTools, ...(settings.hub.actions === true ? hubNoYesTools : [])].map((tool) => `${hubToolPrefix}${tool}`)), ...(settings.web === undefined ? [] : [sdkLookUpTool])],
        }),
    ...(settings.hub?.actions === true ? { hooks: { PreToolUse: [{ hooks: [actionHook(confirm)], timeout: actionHookSeconds, onFailure: "block" as const }] } } : {}),
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

function roundStart(message: SDKMessage): { tokens: number | null; used: TokenUse | null } | null {
  if (message.type !== "stream_event" || message.parent_tool_use_id !== null || message.event.type !== "message_start") return null;
  const usage = message.event.message?.usage;
  if (usage === undefined || usage === null) return { tokens: null, used: null };
  const used = { input: usage.input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, output: usage.output_tokens ?? 0 };
  return { tokens: used.input + used.cacheWrite + used.cacheRead, used };
}

function roundEnd(message: SDKMessage): Partial<TokenUse> | null {
  if (message.type !== "stream_event" || message.parent_tool_use_id !== null || message.event.type !== "message_delta") return null;
  const usage = message.event.usage;
  if (usage === undefined || usage === null) return null;
  const counted = (value: number | null | undefined) => (typeof value === "number" && value > 0 ? value : undefined);
  return { input: counted(usage.input_tokens), cacheWrite: counted(usage.cache_creation_input_tokens), cacheRead: counted(usage.cache_read_input_tokens), output: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined };
}

function sameTokens(requests: TokenUse[], whole: TokenUse): boolean {
  return (["input", "cacheWrite", "cacheRead", "output"] as const).every((key) => requests.reduce((sum, request) => sum + request[key], 0) === whole[key]);
}

function priceByRequest(prices: Prices, requests: TokenUse[] | null, whole: TokenUse): number {
  if (requests === null || !sameTokens(requests, whole)) return answerCost(prices, whole);
  return requests.reduce((sum, request) => sum + answerCost(prices, request), 0);
}

function toolCalls(message: SDKMessage): { name: string; input: unknown }[] {
  if (message.type !== "assistant" || message.parent_tool_use_id !== null) return [];
  return message.message.content.flatMap((block) => (block.type === "tool_use" ? [{ name: block.name, input: block.input }] : []));
}

function denials(message: SDKResultMessage): string[] {
  return (message.permission_denials ?? []).map((denial) => denial.tool_name);
}

function resultError(message: SDKResultMessage): string {
  if (message.subtype === "success") return message.result || "The agent reported an error";
  return message.errors.length > 0 ? message.errors.join("; ") : message.subtype;
}

export function startAgentSession(start: StartAgent, settings: AgentSettings): AgentSession {
  const began = settings.now();
  const input = createInputQueue();
  const stream = start(
    input.messages,
    agentOptions(settings, async (tool, toolInput) => (pending === null ? false : ((await pending.listener.confirm?.(tool, toolInput)) ?? false))),
  );
  let pending: Pending | null = null;
  let ready: number | null = null;
  const prices = pricesPerMTok[settings.model];
  let lastTotal: number | null = settings.savedChats === undefined ? 0 : null;
  let cost: number | null = null;
  let stopped: Error | null = null;
  let closed = false;
  let hubChecked = settings.hub === undefined;
  let hubNote: string | null = null;

  function stop(error: Error) {
    if (stopped === null) stopped = error;
    const waiting = pending;
    pending = null;
    waiting?.reject(error);
  }

  function handle(message: SDKMessage) {
    if (message.type === "system" && message.subtype === "init") {
      if (ready === null) ready = settings.now() - began;
      const status = (message.mcp_servers ?? []).find((server) => server.name === hubServerName)?.status ?? "missing";
      if (!hubChecked && status !== "pending") {
        hubChecked = true;
        if (status !== "connected") hubNote = hubProblemNote(status);
        else if (!(message.tools ?? []).some((tool) => tool.startsWith(hubToolPrefix))) hubNote = hubProblemNote("no tools listed");
      }
    }
    if (pending === null) return;
    if (hubNote !== null) {
      pending.listener.note?.(hubNote);
      hubNote = null;
    }
    const text = textDelta(message);
    if (text !== null) {
      if (pending.firstWordsMs === null) pending.firstWordsMs = settings.now() - pending.started;
      if (text.trim() !== "") pending.spoke = true;
      pending.listener.text?.(text);
    }
    const round = roundStart(message);
    if (round !== null) {
      pending.rounds++;
      if (round.tokens !== null) pending.largestRequestTokens = Math.max(pending.largestRequestTokens ?? 0, round.tokens);
      pending.lastRequestTokens = round.tokens;
      pending.requests = round.used === null || pending.requests === null ? null : [...pending.requests, round.used];
    }
    const ended = roundEnd(message);
    const last = pending.requests?.at(-1);
    if (ended !== null && last !== undefined) {
      for (const key of ["input", "cacheWrite", "cacheRead", "output"] as const) last[key] = ended[key] ?? last[key];
    }
    for (const call of toolCalls(message)) {
      if (pending.spokeFirst === null) pending.spokeFirst = pending.spoke;
      pending.toolUses++;
      pending.listener.tool?.(call.name, call.input);
    }
    if (message.type !== "result") return;
    const usage = message.usage;
    const used = { input: usage?.input_tokens ?? 0, cacheWrite: usage?.cache_creation_input_tokens ?? 0, cacheRead: usage?.cache_read_input_tokens ?? 0, output: usage?.output_tokens ?? 0 };
    const total = message.total_cost_usd;
    let spent: number | null = null;
    if (lastTotal !== null) spent = total >= lastTotal ? total - lastTotal : total;
    else if (prices !== undefined) spent = priceByRequest(prices, pending.requests, used);
    if (spent !== null) {
      if (!(message.is_error && total === 0)) lastTotal = total;
      cost = (cost ?? 0) + spent;
    }
    const answered = pending;
    pending = null;
    if (message.subtype === "success" && !message.is_error) {
      answered.resolve({
        text: message.result,
        firstWordsMs: answered.firstWordsMs,
        totalMs: settings.now() - answered.started,
        stats: {
          rounds: answered.rounds,
          toolUses: answered.toolUses,
          inputTokens: used.input + used.cacheWrite + used.cacheRead,
          cacheWriteTokens: used.cacheWrite,
          cacheReadTokens: used.cacheRead,
          outputTokens: used.output,
          costUsd: spent,
          earlierThinkingBlocks: null,
          recovered: false,
          largestRequestTokens: answered.largestRequestTokens,
          lastRequestTokens: answered.lastRequestTokens,
          refusedTools: denials(message),
          spokeFirst: answered.spokeFirst,
          retried: null,
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
        pending = { started: settings.now(), firstWordsMs: null, resolve, reject, listener, rounds: 0, toolUses: 0, largestRequestTokens: null, lastRequestTokens: null, requests: [], spoke: false, spokeFirst: null };
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