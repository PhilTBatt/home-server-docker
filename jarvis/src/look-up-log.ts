import { fileURLToPath } from "node:url";
import type { Ended, LookedUp, WebBy } from "./look-up.js";

export const lookUpLogFile = fileURLToPath(new URL("../data/look-ups.jsonl", import.meta.url));
export const lookUpLoggingNote = "Look-up log: each look-up's numbers, the question that was sent, the sites it used and what went wrong if it failed go to data/look-ups.jsonl, never the answer. Delete the file to clear it.";
export const lookUpLogVersion = 1;

export type LookUpMode = "ask" | "auto";

export type LookUpNumbers = {
  mode: LookUpMode;
  by: WebBy;
  ended: Ended;
  ms: number;
  questionChars: number;
  answerChars: number;
  searches: number;
  opened: number;
  refused: number;
  steps: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costEstimateUsd: number | null;
  helperMs: number | null;
  startMs: number | null;
  credential: string | null;
  version: string | null;
  error: string | null;
};

export type LookUpLine = LookUpNumbers & { v: number; at: string; question: string; found: string[]; openedSites: string[]; refusedSites: string[]; errorDetail: string | null };

export type LookUpLog = (mode: LookUpMode, by: WebBy, looked: LookedUp) => Promise<void>;

export type LookUpLogDeps = { append: (text: string) => Promise<void>; now: () => Date; warn: (text: string) => void };

const errorKinds: [RegExp, string][] = [
  [/^stopped$/, "stopped"],
  [/^The Claude Code program that comes with the Agent SDK wasn't found\.$/, "no program"],
  [/^The address guard is missing, so nothing was looked up\.$/, "no guard"],
  [/^Claude Code couldn't start:/, "couldn't start"],
  [/^Claude Code ended without a result\./, "no result"],
  [/^Claude Code started with tools it shouldn't have/, "other tools"],
  [/^Claude Code said: error_max_turns/, "too many steps"],
  [/^Claude Code said: /, "claude code error"],
  [/^The API's answer couldn't be read\.$/, "api unreadable"],
  [/^The API paused twice without answering\.$/, "api paused"],
  [/^The API couldn't be reached:/, "api unreachable"],
];

export function lookUpErrorKind(message: string): string {
  const status = /^The API said (\d{3})(?::|$)/.exec(message);
  if (status !== null) return `api ${status[1]}`;
  return errorKinds.find(([pattern]) => pattern.test(message))?.[1] ?? "other";
}

export function lookUpNumbers(mode: LookUpMode, by: WebBy, looked: LookedUp): LookUpNumbers {
  const numbers = looked.helped?.numbers;
  return {
    mode,
    by,
    ended: looked.ended,
    ms: looked.ms,
    questionChars: looked.question.length,
    answerChars: looked.ended === "answered" ? (looked.say ?? "").length : 0,
    searches: numbers?.searches ?? 0,
    opened: numbers?.opened ?? 0,
    refused: numbers?.refused ?? 0,
    steps: numbers?.steps ?? null,
    inputTokens: numbers?.inputTokens ?? null,
    outputTokens: numbers?.outputTokens ?? null,
    costEstimateUsd: numbers?.costEstimateUsd ?? null,
    helperMs: numbers?.helperMs ?? null,
    startMs: numbers?.startMs ?? null,
    credential: numbers?.credential ?? null,
    version: numbers?.version ?? null,
    error: typeof looked.helped?.error === "string" ? lookUpErrorKind(looked.helped.error) : null,
  };
}

export function lookUpLine(mode: LookUpMode, by: WebBy, looked: LookedUp, at: Date): LookUpLine {
  return { v: lookUpLogVersion, at: at.toISOString(), ...lookUpNumbers(mode, by, looked), question: looked.question, found: looked.helped?.found ?? [], openedSites: looked.helped?.opened ?? [], refusedSites: looked.helped?.refused ?? [], errorDetail: looked.helped?.error ?? null };
}

export function startLookUpLog(deps: LookUpLogDeps): LookUpLog {
  let broken = false;
  return async (mode, by, looked) => {
    if (broken) return;
    try {
      await deps.append(`${JSON.stringify(lookUpLine(mode, by, looked, deps.now()))}\n`);
    } catch (error) {
      broken = true;
      deps.warn(`Couldn't write to the look-up log, so the rest of this chat's look-ups won't be logged there: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
