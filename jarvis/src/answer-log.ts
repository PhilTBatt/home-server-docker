import { fileURLToPath } from "node:url";
import type { ChatMode, Engine, HubActionsMode, HubToolsMode, LengthHints, SessionNotesMode, SpeechStart, SpeechStop, ThinkingHistory, VoiceMode } from "./config.js";
import type { SpeechReport } from "./speech-queue.js";
import type { Answer } from "./timing.js";

export const answerLogFile = fileURLToPath(new URL("../data/answers.jsonl", import.meta.url));
export const loggingNote = "Logging: each answer's numbers, never its words, go to data/answers.jsonl. Type + or - after an answer to rate it.";
export const logVersion = 1;

export type Outcome = { answer: Answer } | { error: string };

export type Rating = "good" | "bad";
export type RateResult = "saved" | "nothing to rate" | "last failed" | "log broken";

export type RatingLine = {
  v: number;
  kind: "rating";
  at: string;
  chat: string;
  question: number;
  rating: Rating;
};

export type NewChatLine = {
  v: number;
  kind: "new chat";
  at: string;
  chat: string;
  questions: number;
  lastRequestTokens: number | null;
};

export type SpeechLine = {
  v: number;
  kind: "speech";
  at: string;
  chat: string;
  question: number;
  firstSentenceMs: number | null;
  firstSoundMadeMs: number | null;
  firstSoundMs: number | null;
  longestSilenceMs: number | null;
  spoken: number;
  failed: number;
  left: number;
  stopped: boolean;
  gaveUp: boolean;
  tooLong: boolean;
};

export type AnswerLog = {
  record: (outcome: Outcome) => Promise<void>;
  rate: (rating: Rating) => Promise<RateResult>;
  newChat: (lastRequestTokens: number | null) => Promise<void>;
  speech: (report: Promise<SpeechReport>) => Promise<void>;
};

export type LogContext = {
  engine: Engine;
  thinking: ThinkingHistory | null;
  model: string;
  chats: ChatMode;
  lengthHints: LengthHints;
  hubTools: HubToolsMode;
  hubActions: HubActionsMode;
  sessionNotes: SessionNotesMode;
  voice: VoiceMode;
  speechStart: SpeechStart;
  speechStop: SpeechStop;
};

export type LogLine = {
  v: number;
  at: string;
  chat: string;
  question: number;
  engine: Engine;
  thinking: ThinkingHistory | null;
  model: string;
  chats?: ChatMode;
  lengthHints?: LengthHints;
  hubTools?: HubToolsMode;
  hubActions?: HubActionsMode;
  sessionNotes?: SessionNotesMode;
  voice?: VoiceMode;
  speechStart?: SpeechStart;
  speechStop?: SpeechStop;
  ok: boolean;
  error: string | null;
  firstWordsMs: number | null;
  totalMs: number | null;
  rounds: number | null;
  toolUses: number | null;
  inputTokens: number | null;
  cacheWriteTokens?: number | null;
  cacheReadTokens?: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  earlierThinkingBlocks: number | null;
  recovered: boolean | null;
  largestRequestTokens?: number | null;
  refusedTools?: number | null;
  spokeFirst?: boolean | null;
  retried?: boolean | null;
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
    chats: context.chats,
    lengthHints: context.lengthHints,
    hubTools: context.hubTools,
    hubActions: context.hubActions,
    sessionNotes: context.sessionNotes,
    voice: context.voice,
    ...(context.voice === "off" ? {} : { speechStart: context.speechStart, speechStop: context.speechStop }),
    ok: answer !== null,
    error: "error" in outcome ? errorKind(outcome.error) : null,
    firstWordsMs: wholeMs(answer?.firstWordsMs ?? null),
    totalMs: wholeMs(answer?.totalMs ?? null),
    rounds: stats?.rounds ?? null,
    toolUses: stats?.toolUses ?? null,
    inputTokens: stats?.inputTokens ?? null,
    cacheWriteTokens: stats?.cacheWriteTokens ?? null,
    cacheReadTokens: stats?.cacheReadTokens ?? null,
    outputTokens: stats?.outputTokens ?? null,
    costUsd: tidyCost(answer === null ? failedCostUsd : (stats?.costUsd ?? null)),
    earlierThinkingBlocks: stats?.earlierThinkingBlocks ?? null,
    recovered: stats?.recovered ?? null,
    largestRequestTokens: stats?.largestRequestTokens ?? null,
    refusedTools: stats === null ? null : stats.refusedTools.length,
    spokeFirst: stats?.spokeFirst ?? null,
    retried: stats?.retried ?? null,
  };
}

export function speechLine(chat: string, question: number, at: Date, report: SpeechReport): SpeechLine {
  return {
    v: logVersion,
    kind: "speech",
    at: at.toISOString(),
    chat,
    question,
    firstSentenceMs: wholeMs(report.firstSentenceMs),
    firstSoundMadeMs: wholeMs(report.firstSoundMadeMs),
    firstSoundMs: wholeMs(report.firstSoundMs),
    longestSilenceMs: wholeMs(report.longestSilenceMs),
    spoken: report.spoken,
    failed: report.failed,
    left: report.left,
    stopped: report.stopped,
    gaveUp: report.gaveUp,
    tooLong: report.tooLong,
  };
}

export function startAnswerLog(context: LogContext, deps: AnswerLogDeps): AnswerLog {
  let questions = 0;
  let lastAnswered: number | null = null;
  let broken = false;
  let costBefore = deps.costSoFar();

  async function write(line: LogLine | RatingLine | NewChatLine | SpeechLine): Promise<boolean> {
    try {
      await deps.append(`${JSON.stringify(line)}\n`);
      return true;
    } catch (error) {
      if (!broken) deps.warn(`Couldn't write to the answer log, so the rest of this chat won't be logged: ${error instanceof Error ? error.message : String(error)}`);
      broken = true;
      return false;
    }
  }

  return {
    async record(outcome) {
      questions++;
      lastAnswered = "answer" in outcome ? questions : null;
      const costNow = deps.costSoFar();
      const spent = costNow === null ? null : Math.max(0, costNow - (costBefore ?? 0));
      costBefore = costNow;
      if (broken) return;
      await write(logLine(context, deps.chat, questions, deps.now(), outcome, spent));
    },
    async rate(rating) {
      if (broken) return "log broken";
      if (questions === 0) return "nothing to rate";
      if (lastAnswered === null) return "last failed";
      const saved = await write({ v: logVersion, kind: "rating", at: deps.now().toISOString(), chat: deps.chat, question: lastAnswered, rating });
      return saved ? "saved" : "log broken";
    },
    async newChat(lastRequestTokens) {
      if (broken || questions === 0) return;
      await write({ v: logVersion, kind: "new chat", at: deps.now().toISOString(), chat: deps.chat, questions, lastRequestTokens });
    },
    async speech(report) {
      const question = lastAnswered;
      const said = await report;
      if (broken || question === null) return;
      await write(speechLine(deps.chat, question, deps.now(), said));
    },
  };
}
