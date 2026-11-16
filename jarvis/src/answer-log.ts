import { fileURLToPath } from "node:url";
import type { Engine, ThinkingHistory } from "./config.js";
import type { Answer } from "./timing.js";

export const answerLogFile = fileURLToPath(new URL("../data/answers.jsonl", import.meta.url));
export const loggingNote = "Logging: each answer's numbers, never its words, go to data/answers.jsonl";
export const logVersion = 1;

export type Outcome = { answer: Answer } | { error: string };

export type LogContext = {
  engine: Engine;
  thinking: ThinkingHistory | null;
  model: string;
};

export type LogLine = {
  v: number;
  at: string;
  chat: string;
  question: number;
  engine: Engine;
  thinking: ThinkingHistory | null;
  model: string;
  ok: boolean;
  error: string | null;
  firstWordsMs: number | null;
  totalMs: number | null;
  rounds: number | null;
  toolUses: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  earlierThinkingBlocks: number | null;
  recovered: boolean | null;
};

export type AnswerLogDeps = {
  append: (text: string) => Promise<void>;
  now: () => Date;
  chat: string;
  warn: (message: string) => void;
  costSoFar: () => number | null;
};

const errorKinds: [RegExp, string][] = [
  [/^The API didn't answer in time$/, "api timeout"],
  [/^Couldn't reach the API$/, "api unreachable"],
  [/^The API stopped with an error:/, "api stream error"],
  [/^The API sent no answer$/, "api empty"],
  [/^No answer within \d+ seconds$/, "timeout"],
  [/^The answer was cut off/, "cut off"],
  [/^Gave up after \d+ rounds of tool use$/, "too many tool rounds"],
  [/^Refused:/, "refused"],
  [/^error_[a-z_]+$/, "engine error"],
  [/^The agent stopped$/, "engine stopped"],
];

export function errorKind(message: string): string {
  const status = /^The API replied (\d{3}):/.exec(message);
  if (status !== null) return `api ${status[1]}`;
  return errorKinds.find(([pattern]) => pattern.test(message))?.[1] ?? "other";
}

function wholeMs(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function tidyCost(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(8));
}

export function logLine(context: LogContext, chat: string, question: number, at: Date, outcome: Outcome, failedCostUsd: number | null = null): LogLine {
  const answer = "answer" in outcome ? outcome.answer : null;
  const stats = answer?.stats ?? null;
  return {
    v: logVersion,
    at: at.toISOString(),
    chat,
    question,
    engine: context.engine,
    thinking: context.engine === "api" ? context.thinking : null,
    model: context.model,
    ok: answer !== null,
    error: "error" in outcome ? errorKind(outcome.error) : null,
    firstWordsMs: wholeMs(answer?.firstWordsMs ?? null),
    totalMs: wholeMs(answer?.totalMs ?? null),
    rounds: stats?.rounds ?? null,
    toolUses: stats?.toolUses ?? null,
    inputTokens: stats?.inputTokens ?? null,
    outputTokens: stats?.outputTokens ?? null,
    costUsd: tidyCost(answer === null ? failedCostUsd : (stats?.costUsd ?? null)),
    earlierThinkingBlocks: stats?.earlierThinkingBlocks ?? null,
    recovered: stats?.recovered ?? null,
  };
}

export function startAnswerLog(context: LogContext, deps: AnswerLogDeps): (outcome: Outcome) => Promise<void> {
  let questions = 0;
  let broken = false;
  let costBefore = deps.costSoFar();
  return async (outcome) => {
    questions++;
    const costNow = deps.costSoFar();
    const spent = costNow === null ? null : Math.max(0, costNow - (costBefore ?? 0));
    costBefore = costNow;
    if (broken) return;
    try {
      await deps.append(`${JSON.stringify(logLine(context, deps.chat, questions, deps.now(), outcome, spent))}\n`);
    } catch (error) {
      broken = true;
      deps.warn(`Couldn't write to the answer log, so the rest of this chat won't be logged: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
