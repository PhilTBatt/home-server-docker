export const brainDir = "/brain";

export const engines = ["sdk", "api"] as const;
export type Engine = (typeof engines)[number];

export const thinkingHistories = ["keep", "drop"] as const;
export type ThinkingHistory = (typeof thinkingHistories)[number];

export const chatModes = ["fresh", "resume"] as const;
export type ChatMode = (typeof chatModes)[number];

export const lengthHintModes = ["note", "jarvis"] as const;
export type LengthHints = (typeof lengthHintModes)[number];

export const hubToolsModes = ["off", "on"] as const;
export type HubToolsMode = (typeof hubToolsModes)[number];

export type Config = {
  apiKey: string;
  engine: Engine;
  thinkingHistory: ThinkingHistory;
  chats: ChatMode;
  lengthHints: LengthHints;
  lengthWarn: number;
  lengthCap: number | null;
  hubToken: string | null;
  log: boolean;
};

export const defaultLengthWarn = 80_000;

function tokenCount(value: string): number | null {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
}

function isEngine(value: string): value is Engine {
  return (engines as readonly string[]).includes(value);
}

function isThinkingHistory(value: string): value is ThinkingHistory {
  return (thinkingHistories as readonly string[]).includes(value);
}

function isChatMode(value: string): value is ChatMode {
  return (chatModes as readonly string[]).includes(value);
}

function isLengthHints(value: string): value is LengthHints {
  return (lengthHintModes as readonly string[]).includes(value);
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  if (apiKey === "") throw new Error("Missing setting: ANTHROPIC_API_KEY");
  const engine = env.JARVIS_ENGINE?.trim() || "sdk";
  if (!isEngine(engine)) throw new Error(`JARVIS_ENGINE must be sdk or api, not "${engine}"`);
  const thinkingHistory = env.JARVIS_THINKING_HISTORY?.trim() || "keep";
  if (!isThinkingHistory(thinkingHistory)) throw new Error(`JARVIS_THINKING_HISTORY must be keep or drop, not "${thinkingHistory}"`);
  const chats = env.JARVIS_CHATS?.trim() || "fresh";
  if (!isChatMode(chats)) throw new Error(`JARVIS_CHATS must be fresh or resume, not "${chats}"`);
  const lengthHints = env.JARVIS_LENGTH_HINTS?.trim() || "note";
  if (!isLengthHints(lengthHints)) throw new Error(`JARVIS_LENGTH_HINTS must be note or jarvis, not "${lengthHints}"`);
  const warnText = env.JARVIS_LENGTH_WARN?.trim() || String(defaultLengthWarn);
  const lengthWarn = tokenCount(warnText);
  if (lengthWarn === null) throw new Error(`JARVIS_LENGTH_WARN must be a whole number of tokens above 0, like 80000, not "${warnText}"`);
  const capText = env.JARVIS_LENGTH_CAP?.trim() || "off";
  const lengthCap = capText === "off" ? null : tokenCount(capText);
  if (capText !== "off" && lengthCap === null) throw new Error(`JARVIS_LENGTH_CAP must be a whole number of tokens above 0, like 150000, or off, not "${capText}"`);
  const warnSource = env.JARVIS_LENGTH_WARN?.trim() ? "" : ", the default";
  if (lengthCap !== null && lengthCap <= lengthWarn) throw new Error(`JARVIS_LENGTH_CAP (${lengthCap}) must be above JARVIS_LENGTH_WARN (${lengthWarn}${warnSource})`);
  const hubTools = env.JARVIS_HUB_TOOLS?.trim() || "off";
  if (hubTools !== "on" && hubTools !== "off") throw new Error(`JARVIS_HUB_TOOLS must be on or off, not "${hubTools}"`);
  const token = env.API_TOKEN?.trim() ?? "";
  if (hubTools === "on" && token === "") throw new Error("JARVIS_HUB_TOOLS is on, but there's no API_TOKEN. Start Jarvis with bash host/jarvis.sh, which passes it in");
  const log = env.JARVIS_LOG ?? "";
  if (log === "") throw new Error("Missing setting: JARVIS_LOG (on or off)");
  if (log !== "on" && log !== "off") throw new Error(`JARVIS_LOG must be on or off, not "${log}"`);
  return { apiKey, engine, thinkingHistory, chats, lengthHints, lengthWarn, lengthCap, hubToken: hubTools === "on" ? token : null, log: log === "on" };
}