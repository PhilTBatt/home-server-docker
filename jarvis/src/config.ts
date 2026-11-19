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

export const hubActionsModes = ["off", "on"] as const;
export type HubActionsMode = (typeof hubActionsModes)[number];

export const sessionNotesModes = ["off", "on"] as const;
export type SessionNotesMode = (typeof sessionNotesModes)[number];

export const voiceModes = ["off", "kokoro"] as const;
export type VoiceMode = (typeof voiceModes)[number];

export const speechStarts = ["sentence", "clause"] as const;
export type SpeechStart = (typeof speechStarts)[number];

export const speechStops = ["now", "sentence"] as const;
export type SpeechStop = (typeof speechStops)[number];

export const spokenStyleModes = ["off", "on"] as const;
export type SpokenStyleMode = (typeof spokenStyleModes)[number];

export type Config = {
  apiKey: string;
  engine: Engine;
  thinkingHistory: ThinkingHistory;
  chats: ChatMode;
  lengthHints: LengthHints;
  lengthWarn: number;
  lengthCap: number | null;
  hubToken: string | null;
  hubActions: boolean;
  sessionNotes: boolean;
  voice: VoiceMode;
  kokoroVoice: string;
  volume: number;
  speechStart: SpeechStart;
  speechStop: SpeechStop;
  spokenStyle: boolean;
  log: boolean;
};

export const defaultLengthWarn = 80_000;

export const defaultVolume = 80;

export const defaultKokoroVoice = "bm_george";

export function readVolume(env: Record<string, string | undefined>): number {
  const text = env.JARVIS_VOLUME?.trim() || String(defaultVolume);
  if (!/^\d{1,3}$/.test(text) || Number(text) > 100) throw new Error(`JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "${text}"`);
  return Number(text);
}

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

function isVoiceMode(value: string): value is VoiceMode {
  return (voiceModes as readonly string[]).includes(value);
}

function isSpeechStart(value: string): value is SpeechStart {
  return (speechStarts as readonly string[]).includes(value);
}

function isSpeechStop(value: string): value is SpeechStop {
  return (speechStops as readonly string[]).includes(value);
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
  const hubActions = env.JARVIS_HUB_ACTIONS?.trim() || "off";
  if (hubActions !== "on" && hubActions !== "off") throw new Error(`JARVIS_HUB_ACTIONS must be on or off, not "${hubActions}"`);
  if (hubActions === "on" && hubTools !== "on") throw new Error("JARVIS_HUB_ACTIONS is on, but JARVIS_HUB_TOOLS is off. The actions come with the hub's tools, so turn both on");
  const sessionNotes = env.JARVIS_SESSION_NOTES?.trim() || "off";
  if (sessionNotes !== "on" && sessionNotes !== "off") throw new Error(`JARVIS_SESSION_NOTES must be on or off, not "${sessionNotes}"`);
  const voice = env.JARVIS_VOICE?.trim() || "off";
  if (!isVoiceMode(voice)) throw new Error(`JARVIS_VOICE must be off or kokoro, not "${voice}"`);
  const kokoroVoice = env.JARVIS_KOKORO_VOICE?.trim() || defaultKokoroVoice;
  if (!/^[A-Za-z0-9_]+(\([0-9.]+\))?([+-][A-Za-z0-9_]+(\([0-9.]+\))?)*$/.test(kokoroVoice) || kokoroVoice.length > 200) throw new Error(`JARVIS_KOKORO_VOICE must be one of Kokoro's voice names, like bm_george, or a blend like bm_george(2)+bm_fable(1), not "${kokoroVoice}"`);
  const volume = readVolume(env);
  const speechStart = env.JARVIS_SPEECH_START?.trim() || "sentence";
  if (!isSpeechStart(speechStart)) throw new Error(`JARVIS_SPEECH_START must be sentence or clause, not "${speechStart}"`);
  const speechStop = env.JARVIS_SPEECH_STOP?.trim() || "now";
  if (!isSpeechStop(speechStop)) throw new Error(`JARVIS_SPEECH_STOP must be now or sentence, not "${speechStop}"`);
  const spokenStyle = env.JARVIS_SPOKEN_STYLE?.trim() || "off";
  if (spokenStyle !== "on" && spokenStyle !== "off") throw new Error(`JARVIS_SPOKEN_STYLE must be on or off, not "${spokenStyle}"`);
  const log = env.JARVIS_LOG ?? "";
  if (log === "") throw new Error("Missing setting: JARVIS_LOG (on or off)");
  if (log !== "on" && log !== "off") throw new Error(`JARVIS_LOG must be on or off, not "${log}"`);
  return { apiKey, engine, thinkingHistory, chats, lengthHints, lengthWarn, lengthCap, hubToken: hubTools === "on" ? token : null, hubActions: hubActions === "on", sessionNotes: sessionNotes === "on", voice, kokoroVoice, volume, speechStart, speechStop, spokenStyle: spokenStyle === "on", log: log === "on" };
}