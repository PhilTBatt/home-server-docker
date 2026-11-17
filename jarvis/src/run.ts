import type { AgentSession } from "./agent.js";
import { describe, type Answer } from "./timing.js";

export const model = "claude-haiku-5-5";
export const rounds = 3;
export const system = "You are Jarvis, a voice assistant on Phil's home server. Answer in one or two short sentences that sound natural spoken aloud.";
export const coldQuestion = "Give me a one-sentence pep talk before I start coding.";
export const warmQuestions = [
  "What's one tip for staying awake on a morning train?",
  "What's a good five-minute break between coding sessions?",
];
export const brainQuestion = "Read index.md in your working folder and tell me in one sentence what it covers.";
export const outsideQuestion = "Read /app/package.json and tell me the package's name.";

export type SpeedTestDeps = {
  askDirect: (question: string, thinkingOff: boolean) => Promise<Answer>;
  startSession: () => AgentSession;
  readMemoryMb: () => number | null;
  questionTimeoutMs: number;
  log: (line: string) => void;
};

export type Timings = {
  firstWords: number[];
  total: number[];
};

export type Results = {
  direct: Timings;
  directThinkingOff: Timings;
  ready: number[];
  cold: Timings;
  warm: Timings;
  brain: Timings;
  memoryMb: number | null;
  costUsd: number | null;
  confinement: string;
  examples: string[];
};

function emptyTimings(): Timings {
  return { firstWords: [], total: [] };
}

function record(timings: Timings, answer: Answer) {
  if (answer.firstWordsMs !== null) timings.firstWords.push(answer.firstWordsMs);
  timings.total.push(answer.totalMs);
}

function larger(current: number | null, next: number | null): number | null {
  if (next === null) return current;
  return current === null ? next : Math.max(current, next);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void = () => {}): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`No answer within ${ms / 1000} seconds`));
      onTimeout();
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function checkConfinement(ask: (question: string) => Promise<Answer>): Promise<string> {
  try {
    const answer = await ask(outsideQuestion);
    if (answer.stats?.refusedTools.includes("Read")) return "refused, as it should be";
    return `NOT refused, or Jarvis didn't try. Check before going further. Jarvis said: ${answer.text}`;
  } catch (error) {
    return `couldn't check: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runSpeedTest(deps: SpeedTestDeps): Promise<Results> {
  const results: Results = {
    direct: emptyTimings(),
    directThinkingOff: emptyTimings(),
    ready: [],
    cold: emptyTimings(),
    warm: emptyTimings(),
    brain: emptyTimings(),
    memoryMb: null,
    costUsd: null,
    confinement: "not checked",
    examples: [],
  };

  for (let round = 1; round <= rounds; round++) {
    deps.log(`Plain API call, round ${round} of ${rounds}`);
    for (const question of [coldQuestion, ...warmQuestions]) {
      const answer = await deps.askDirect(question, false);
      record(results.direct, answer);
      if (round === 1 && question === coldQuestion) results.examples.push(`Plain API call: ${answer.text}`);
      record(results.directThinkingOff, await deps.askDirect(question, true));
    }
  }

  for (let round = 1; round <= rounds; round++) {
    deps.log(`Agent SDK, round ${round} of ${rounds}`);
    const session = deps.startSession();
    const ask = (question: string) => withTimeout(session.ask(question), deps.questionTimeoutMs, () => session.close());
    try {
      const cold = await ask(coldQuestion);
      record(results.cold, cold);
      const ready = session.readyMs();
      if (ready !== null) results.ready.push(ready);
      for (const question of warmQuestions) record(results.warm, await ask(question));
      const brain = await ask(brainQuestion);
      record(results.brain, brain);
      if (round === 1) {
        results.examples.push(`Agent SDK: ${cold.text}`, `Agent SDK, brain: ${brain.text}`);
        results.confinement = await checkConfinement(ask);
      }
      results.memoryMb = larger(results.memoryMb, deps.readMemoryMb());
      const cost = session.costUsd();
      if (cost !== null) results.costUsd = (results.costUsd ?? 0) + cost;
    } finally {
      session.close();
    }
  }

  return results;
}

export function formatReport(results: Results): string[] {
  return [
    "",
    `Jarvis speed test: ${model}, ${rounds} rounds`,
    "",
    "Plain API call, thinking left at Haiku's default (the Agent SDK sends the same):",
    `  first words: ${describe(results.direct.firstWords)}`,
    `  full answer: ${describe(results.direct.total)}`,
    "",
    "Plain API call, thinking off (the Agent SDK ignored this setting in testing):",
    `  first words: ${describe(results.directThinkingOff.firstWords)}`,
    `  full answer: ${describe(results.directThinkingOff.total)}`,
    "",
    "Agent SDK:",
    `  engine ready after starting: ${describe(results.ready)}`,
    `  new conversation, first words: ${describe(results.cold.firstWords)}`,
    `  new conversation, full answer: ${describe(results.cold.total)}`,
    `  warm conversation, first words: ${describe(results.warm.firstWords)}`,
    `  warm conversation, full answer: ${describe(results.warm.total)}`,
    `  reading the brain, first words (can come before the file is read): ${describe(results.brain.firstWords)}`,
    `  reading the brain, full answer: ${describe(results.brain.total)}`,
    `  memory while running (highest reading): ${results.memoryMb === null ? "unknown" : `${results.memoryMb} MB`}`,
    `  cost of the Agent SDK's runs: ${results.costUsd === null ? "unknown" : `about $${results.costUsd.toFixed(4)}`}`,
    `  reading outside /brain: ${results.confinement}`,
    "",
    "Example answers:",
    ...results.examples.map((example) => `  ${example}`),
  ];
}