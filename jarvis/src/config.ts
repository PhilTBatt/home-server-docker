export const brainDir = "/brain";

export const engines = ["sdk", "api"] as const;
export type Engine = (typeof engines)[number];

export const thinkingHistories = ["keep", "drop"] as const;
export type ThinkingHistory = (typeof thinkingHistories)[number];

export type Config = {
  apiKey: string;
  engine: Engine;
  thinkingHistory: ThinkingHistory;
  log: boolean;
};

function isEngine(value: string): value is Engine {
  return (engines as readonly string[]).includes(value);
}

function isThinkingHistory(value: string): value is ThinkingHistory {
  return (thinkingHistories as readonly string[]).includes(value);
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  if (apiKey === "") throw new Error("Missing setting: ANTHROPIC_API_KEY");
  const engine = env.JARVIS_ENGINE?.trim() || "sdk";
  if (!isEngine(engine)) throw new Error(`JARVIS_ENGINE must be sdk or api, not "${engine}"`);
  const thinkingHistory = env.JARVIS_THINKING_HISTORY?.trim() || "keep";
  if (!isThinkingHistory(thinkingHistory)) throw new Error(`JARVIS_THINKING_HISTORY must be keep or drop, not "${thinkingHistory}"`);
  const log = env.JARVIS_LOG ?? "";
  if (log === "") throw new Error("Missing setting: JARVIS_LOG (on or off)");
  if (log !== "on" && log !== "off") throw new Error(`JARVIS_LOG must be on or off, not "${log}"`);
  return { apiKey, engine, thinkingHistory, log: log === "on" };
}