import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { BrainTools } from "./brain-tools.js";
import { askDirect, type AssistantBlock, type DirectAnswer, type DirectRequest, type ToolResultBlock, type ToolUseBlock, type Turn } from "./direct.js";
import type { ThinkingHistory } from "./config.js";
import type { Answer, AnswerStats } from "./timing.js";

export type Prices = {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  longPromptOver: number;
  longInput: number;
  longCacheWrite: number;
  longCacheRead: number;
  longOutput: number;
};

export const pricesPerMTok: Record<string, Prices> = {
  "claude-haiku-5-5": { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5, longPromptOver: 100_000, longInput: 0.5, longCacheWrite: 0.625, longCacheRead: 0.05, longOutput: 2.5 },
};

export type TokenUse = { input: number; cacheWrite: number; cacheRead: number; output: number };

export function answerCost(prices: Prices, used: TokenUse): number {
  const long = used.input + used.cacheWrite + used.cacheRead > prices.longPromptOver;
  const spent = long
    ? used.input * prices.longInput + used.cacheWrite * prices.longCacheWrite + used.cacheRead * prices.longCacheRead + used.output * prices.longOutput
    : used.input * prices.input + used.cacheWrite * prices.cacheWrite + used.cacheRead * prices.cacheRead + used.output * prices.output;
  return spent / 1_000_000;
}

export const maxToolSteps = 10;

export type ApiSettings = {
  apiKey: string;
  model: string;
  system: string;
  maxTokens: number;
  timeoutMs: number;
  now: () => number;
  tools?: BrainTools;
  thinkingHistory?: ThinkingHistory;
};

export type SendRequest = (request: DirectRequest) => Promise<DirectAnswer>;

function toolCalls(content: AssistantBlock[]): ToolUseBlock[] {
  return content.filter((block): block is ToolUseBlock => block.type === "tool_use");
}

export function spokeBeforeTools(content: AssistantBlock[]): boolean {
  const firstTool = content.findIndex((block) => block.type === "tool_use");
  return content.slice(0, firstTool === -1 ? content.length : firstTool).some((block) => block.type === "text" && typeof block.text === "string" && block.text.trim() !== "");
}

function hasThinking(content: AssistantBlock[]): boolean {
  return content.some((block) => block.type === "thinking" || block.type === "redacted_thinking");
}

function isBlankText(block: AssistantBlock): boolean {
  return block.type === "text" && typeof block.text === "string" && block.text.trim() === "";
}

export function echoed(content: AssistantBlock[]): AssistantBlock[] {
  return hasThinking(content) ? content : content.filter((block) => !isBlankText(block));
}

function isThinking(block: AssistantBlock): boolean {
  return block.type === "thinking" || block.type === "redacted_thinking";
}

export function hasVisibleContent(content: AssistantBlock[]): boolean {
  return content.some((block) => !isThinking(block) && !isBlankText(block));
}

export function thinkingBlocksIn(turns: Turn[]): number {
  return turns.reduce((count, turn) => (turn.role === "assistant" && typeof turn.content !== "string" ? count + turn.content.filter(isThinking).length : count), 0);
}

export function withoutThinking(turns: Turn[]): Turn[] {
  return turns.map((turn) => (turn.role === "assistant" && typeof turn.content !== "string" ? { role: "assistant", content: turn.content.filter((block) => !isThinking(block) && !isBlankText(block)) } : turn));
}

function rejectedByApi(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("The API replied 400:");
}

export function startApiSession(settings: ApiSettings, send: SendRequest = askDirect): AgentSession {
  const history: Turn[] = [];
  const prices = pricesPerMTok[settings.model];
  const stopping = new AbortController();
  let busy = false;
  let closed = false;
  let cost: number | null = null;
  const thinkingHistory = settings.thinkingHistory ?? "keep";

  async function ask(question: string, listener: AnswerListener = {}): Promise<Answer> {
    if (closed) throw new Error(closedMessage);
    if (busy) throw new Error("One question at a time");
    busy = true;
    const started = settings.now();
    const turns: Turn[] = [];
    let next: string | ToolResultBlock[] = question;
    let firstWordsMs: number | null = null;
    const stats: AnswerStats = {
      rounds: 0,
      toolUses: 0,
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      costUsd: prices === undefined ? null : 0,
      earlierThinkingBlocks: thinkingBlocksIn(history),
      recovered: false,
      largestRequestTokens: 0,
      refusedTools: [],
      spokeFirst: null,
    };
    const sendRound = async () => {
      const answer = await send({
        apiKey: settings.apiKey,
        model: settings.model,
        system: settings.system,
        question: next,
        history: [...history, ...turns],
        tools: settings.tools?.definitions,
        maxTokens: settings.maxTokens,
        timeoutMs: settings.timeoutMs,
        thinkingOff: false,
        cache: true,
        now: settings.now,
        signal: stopping.signal,
        onText: (delta) => listener.text?.(delta),
      });
      stats.rounds++;
      return answer;
    };
    const sendRoundOrRecover = async () => {
      try {
        return await sendRound();
      } catch (error) {
        if (closed || stats.recovered || !rejectedByApi(error) || thinkingBlocksIn([...history, ...turns]) === 0) throw error;
        stats.recovered = true;
        history.splice(0, history.length, ...withoutThinking(history));
        if (turns.length > 0) {
          turns.length = 0;
          next = question;
          listener.restart?.();
        }
        return await sendRound();
      }
    };
    try {
      for (let step = 1; step <= maxToolSteps; step++) {
        if (closed) throw new Error(closedMessage);
        const stepStarted = settings.now();
        const answer = await sendRoundOrRecover();
        const requestTokens = answer.inputTokens + answer.cacheWriteTokens + answer.cacheReadTokens;
        stats.inputTokens += requestTokens;
        stats.largestRequestTokens = Math.max(stats.largestRequestTokens ?? 0, requestTokens);
        stats.cacheWriteTokens += answer.cacheWriteTokens;
        stats.cacheReadTokens += answer.cacheReadTokens;
        stats.outputTokens += answer.outputTokens;
        if (prices !== undefined) {
          const spent = answerCost(prices, { input: answer.inputTokens, cacheWrite: answer.cacheWriteTokens, cacheRead: answer.cacheReadTokens, output: answer.outputTokens });
          cost = (cost ?? 0) + spent;
          stats.costUsd = (stats.costUsd ?? 0) + spent;
        }
        if (firstWordsMs === null && answer.firstWordsMs !== null) firstWordsMs = stepStarted - started + answer.firstWordsMs;
        turns.push({ role: "user", content: next }, { role: "assistant", content: echoed(answer.content) });
        const calls = toolCalls(answer.content);
        if (calls.length > 0 && stats.spokeFirst === null) stats.spokeFirst = spokeBeforeTools(answer.content);
        if (calls.length === 0) {
          if (hasVisibleContent(answer.content)) history.push(...(thinkingHistory === "keep" ? turns : withoutThinking(turns)));
          return { text: answer.text, firstWordsMs, totalMs: settings.now() - started, stats };
        }
        if (settings.tools === undefined || answer.stopReason !== "tool_use") throw new Error("The answer was cut off part-way through using a tool");
        const results: ToolResultBlock[] = [];
        for (const call of calls) {
          if (closed) throw new Error(closedMessage);
          stats.toolUses++;
          listener.tool?.(call.name, call.input);
          const outcome = await settings.tools.run(call.name, call.input);
          if (outcome.refused) stats.refusedTools.push(call.name);
          results.push(outcome.isError ? { type: "tool_result", tool_use_id: call.id, content: outcome.content, is_error: true } : { type: "tool_result", tool_use_id: call.id, content: outcome.content });
        }
        next = results;
      }
      throw new Error(`Gave up after ${maxToolSteps} rounds of tool use`);
    } catch (error) {
      if (closed) throw new Error(closedMessage);
      throw error;
    } finally {
      busy = false;
    }
  }

  return {
    ask,
    readyMs: () => null,
    costUsd: () => cost,
    stoppedReason: () => (closed ? closedMessage : null),
    close() {
      if (closed) return;
      closed = true;
      stopping.abort();
    },
  };
}