import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import type { BrainTools } from "./brain-tools.js";
import { askDirect, type AssistantBlock, type DirectAnswer, type DirectRequest, type ToolResultBlock, type ToolUseBlock, type Turn } from "./direct.js";
import type { Answer } from "./timing.js";

export type Prices = { input: number; output: number; longPromptOver: number; longInput: number; longOutput: number };

export const pricesPerMTok: Record<string, Prices> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longPromptOver: 100_000, longInput: 0.5, longOutput: 2.5 },
};

export function answerCost(prices: Prices, inputTokens: number, outputTokens: number): number {
  const long = inputTokens > prices.longPromptOver;
  return (inputTokens * (long ? prices.longInput : prices.input) + outputTokens * (long ? prices.longOutput : prices.output)) / 1_000_000;
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
};

export type SendRequest = (request: DirectRequest) => Promise<DirectAnswer>;

function toolCalls(content: AssistantBlock[]): ToolUseBlock[] {
  return content.filter((block): block is ToolUseBlock => block.type === "tool_use");
}

export function startApiSession(settings: ApiSettings, send: SendRequest = askDirect): AgentSession {
  const history: Turn[] = [];
  const prices = pricesPerMTok[settings.model];
  const stopping = new AbortController();
  let busy = false;
  let closed = false;
  let cost: number | null = null;

  async function ask(question: string, listener: AnswerListener = {}): Promise<Answer> {
    if (closed) throw new Error(closedMessage);
    if (busy) throw new Error("One question at a time");
    busy = true;
    const started = settings.now();
    const turns: Turn[] = [];
    let next: string | ToolResultBlock[] = question;
    let firstWordsMs: number | null = null;
    try {
      for (let step = 1; step <= maxToolSteps; step++) {
        if (closed) throw new Error(closedMessage);
        const stepStarted = settings.now();
        const answer = await send({
          apiKey: settings.apiKey,
          model: settings.model,
          system: settings.system,
          question: next,
          history: [...history, ...turns],
          tools: settings.tools?.definitions,
          maxTokens: settings.maxTokens,
          timeoutMs: settings.timeoutMs,
          thinkingOff: settings.tools !== undefined,
          now: settings.now,
          signal: stopping.signal,
          onText: (delta) => listener.text?.(delta),
        });
        if (prices !== undefined) cost = (cost ?? 0) + answerCost(prices, answer.inputTokens, answer.outputTokens);
        if (firstWordsMs === null && answer.firstWordsMs !== null) firstWordsMs = stepStarted - started + answer.firstWordsMs;
        turns.push({ role: "user", content: next }, { role: "assistant", content: answer.content });
        const calls = toolCalls(answer.content);
        if (calls.length === 0) {
          if (answer.content.length > 0) history.push(...turns);
          return { text: answer.text, firstWordsMs, totalMs: settings.now() - started };
        }
        if (settings.tools === undefined || answer.stopReason !== "tool_use") throw new Error("The answer was cut off part-way through using a tool");
        const results: ToolResultBlock[] = [];
        for (const call of calls) {
          if (closed) throw new Error(closedMessage);
          listener.tool?.(call.name, call.input);
          const outcome = await settings.tools.run(call.name, call.input);
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