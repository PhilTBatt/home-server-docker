import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { askDirect, type DirectAnswer, type DirectRequest, type Turn } from "./direct.js";
import type { Answer } from "./timing.js";

export type Prices = { input: number; output: number; longPromptOver: number; longInput: number; longOutput: number };

export const pricesPerMTok: Record<string, Prices> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longPromptOver: 100_000, longInput: 0.5, longOutput: 2.5 },
};

export function answerCost(prices: Prices, inputTokens: number, outputTokens: number): number {
  const long = inputTokens > prices.longPromptOver;
  return (inputTokens * (long ? prices.longInput : prices.input) + outputTokens * (long ? prices.longOutput : prices.output)) / 1_000_000;
}

export type ApiSettings = {
  apiKey: string;
  model: string;
  system: string;
  maxTokens: number;
  timeoutMs: number;
  now: () => number;
};

export type SendRequest = (request: DirectRequest) => Promise<DirectAnswer>;

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
    try {
      const answer = await send({
        apiKey: settings.apiKey,
        model: settings.model,
        system: settings.system,
        question,
        history: [...history],
        maxTokens: settings.maxTokens,
        timeoutMs: settings.timeoutMs,
        thinkingOff: false,
        now: settings.now,
        signal: stopping.signal,
        onText: (delta) => listener.text?.(delta),
      });
      if (answer.text.trim() !== "") history.push({ role: "user", content: question }, { role: "assistant", content: answer.text });
      if (prices !== undefined) cost = (cost ?? 0) + answerCost(prices, answer.inputTokens, answer.outputTokens);
      return { text: answer.text, firstWordsMs: answer.firstWordsMs, totalMs: answer.totalMs };
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