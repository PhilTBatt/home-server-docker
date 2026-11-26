import { webHelpers, webModes, type WebBy, type WebMode } from "./look-up.js";

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

export const voiceModes = ["off", "kokoro", "piper"] as const;
export type VoiceMode = (typeof voiceModes)[number];

export const speechStarts = ["sentence", "clause"] as const;
export type SpeechStart = (typeof speechStarts)[number];

export const speechStops = ["now", "sentence"] as const;
export type SpeechStop = (typeof speechStops)[number];

export const speechBundleModes = ["off", "on"] as const;
export type SpeechBundleMode = (typeof speechBundleModes)[number];

export const spokenStyleModes = ["off", "on"] as const;
export type SpokenStyleMode = (typeof spokenStyleModes)[number];
export const liveFactsModes = ["off", "on"] as const;
export type LiveFactsMode = (typeof liveFactsModes)[number];
export const personaNamePattern = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const earsModes = ["off", "push", "wake"] as const;
export type EarsMode = (typeof earsModes)[number];

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
  kokoroSpeed: number;
  piperVoice: string;
  volume: number;
  speechStart: SpeechStart;
  speechStop: SpeechStop;
  speechBundle: boolean;
  spokenStyle: boolean;
  persona: string | null;
  liveFacts: boolean;
  filler: boolean;
  ears: EarsMode;
  earsToken: string | null;
  followUp: number | null;
  turnCheck: boolean;
  trainAlerts: boolean;
  brainQuestions: boolean;
  clock: boolean;
  web: WebMode;
  webBy: WebBy;
  webToken: string | null;
  webLog: boolean;
  log: boolean;
};

export const followUpSeconds = { least: 2, most: 15 };

export const defaultLengthWarn = 80_000;

export const defaultVolume = 80;

export const defaultKokoroVoice = "bm_george";

export const defaultKokoroSpeed = 1;

export const kokoroSpeeds = { min: 0.25, max: 4 };

export const defaultPiperVoice = "en_GB-alan-medium";

export const piperVoicePattern = /^[a-z]{2,3}_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$/;

export function readVolume(env: Record<string, string | undefined>): number {
  const text = env.JARVIS_VOLUME?.trim() || String(defaultVolume);
  if (!/^\d{1,3}$/.test(text) || Number(text) > 100) throw new Error(`JARVIS_VOLUME must be a whole number from 0 to 100, like 80, not "${text}"`);
  return Number(text);
}

function tokenCount(value: string): number | null {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
}

function isWebBy(value: string): value is WebBy {
  return (webHelpers as readonly string[]).includes(value);
}

function isWebMode(value: string): value is WebMode {
  return (webModes as readonly string[]).includes(value);
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
  if (!isVoiceMode(voice)) throw new Error(`JARVIS_VOICE must be off, kokoro or piper, not "${voice}"`);
  const kokoroVoice = env.JARVIS_KOKORO_VOICE?.trim() || defaultKokoroVoice;
  if (!/^[A-Za-z0-9_]+(\([0-9.]+\))?([+-][A-Za-z0-9_]+(\([0-9.]+\))?)*$/.test(kokoroVoice) || kokoroVoice.length > 200) throw new Error(`JARVIS_KOKORO_VOICE must be one of Kokoro's voice names, like bm_george, or a blend like bm_george(2)+bm_fable(1), not "${kokoroVoice}"`);
  const speedText = env.JARVIS_KOKORO_SPEED?.trim() || String(defaultKokoroSpeed);
  const kokoroSpeed = Number(speedText);
  if (!/^[0-9]+(\.[0-9]+)?$/.test(speedText) || kokoroSpeed < kokoroSpeeds.min || kokoroSpeed > kokoroSpeeds.max) throw new Error(`JARVIS_KOKORO_SPEED must be a number from ${kokoroSpeeds.min} to ${kokoroSpeeds.max}, like 1 or 0.9, not "${speedText}"`);
  const piperVoice = env.JARVIS_PIPER_VOICE?.trim() || defaultPiperVoice;
  if (!piperVoicePattern.test(piperVoice)) throw new Error(`JARVIS_PIPER_VOICE must be a Piper voice name, its language, speaker and quality, like ${defaultPiperVoice}, not "${piperVoice}"`);
  const volume = readVolume(env);
  const speechStart = env.JARVIS_SPEECH_START?.trim() || "sentence";
  if (!isSpeechStart(speechStart)) throw new Error(`JARVIS_SPEECH_START must be sentence or clause, not "${speechStart}"`);
  const speechStop = env.JARVIS_SPEECH_STOP?.trim() || "now";
  if (!isSpeechStop(speechStop)) throw new Error(`JARVIS_SPEECH_STOP must be now or sentence, not "${speechStop}"`);
  const speechBundle = env.JARVIS_SPEECH_BUNDLE?.trim() || "off";
  if (speechBundle !== "on" && speechBundle !== "off") throw new Error(`JARVIS_SPEECH_BUNDLE must be on or off, not "${speechBundle}"`);
  const spokenStyle = env.JARVIS_SPOKEN_STYLE?.trim() || "off";
  if (spokenStyle !== "on" && spokenStyle !== "off") throw new Error(`JARVIS_SPOKEN_STYLE must be on or off, not "${spokenStyle}"`);
  const persona = env.JARVIS_PERSONA?.trim() || "off";
  if (persona !== "off" && !personaNamePattern.test(persona)) throw new Error(`JARVIS_PERSONA must be off or the name of a file in jarvis/persona/ without the .md, in lowercase letters, numbers and dashes, like butler, not "${persona}"`);
  const liveFacts = env.JARVIS_LIVE_FACTS?.trim() || "off";
  if (liveFacts !== "on" && liveFacts !== "off") throw new Error(`JARVIS_LIVE_FACTS must be on or off, not "${liveFacts}"`);
  const filler = env.JARVIS_FILLER?.trim() || "off";
  if (filler !== "on" && filler !== "off") throw new Error(`JARVIS_FILLER must be on or off, not "${filler}"`);
  const ears = env.JARVIS_EARS?.trim() || "off";
  if (ears !== "off" && ears !== "push" && ears !== "wake") throw new Error(`JARVIS_EARS must be off, push or wake, not "${ears}"`);
  const earsToken = env.EARS_TOKEN?.trim() ?? "";
  if (ears !== "off" && earsToken === "") throw new Error(`JARVIS_EARS is ${ears}, but there's no EARS_TOKEN. Start Jarvis with bash host/jarvis.sh, which passes it in from ears/.env`);
  const followText = env.JARVIS_FOLLOW_UP?.trim() || "off";
  const followUp = followText === "off" ? null : Number(followText);
  if (followUp !== null && (!/^[0-9]+$/.test(followText) || followUp < followUpSeconds.least || followUp > followUpSeconds.most)) throw new Error(`JARVIS_FOLLOW_UP must be off or a whole number of seconds from ${followUpSeconds.least} to ${followUpSeconds.most}, like 5, not "${followText}"`);
  if (followUp !== null && ears !== "wake") throw new Error(`JARVIS_FOLLOW_UP is ${followUp}, but follow-ups come after questions asked with the wake word, so they need JARVIS_EARS=wake. Set that, or set JARVIS_FOLLOW_UP=off`);
  const turnCheck = env.JARVIS_TURN_CHECK?.trim() || "off";
  if (turnCheck !== "on" && turnCheck !== "off") throw new Error(`JARVIS_TURN_CHECK must be on or off, not "${turnCheck}"`);
  if (turnCheck === "on" && ears !== "wake") throw new Error("JARVIS_TURN_CHECK is on, but it judges recordings made after the wake word, so it needs JARVIS_EARS=wake. Set that, or set JARVIS_TURN_CHECK=off");
  const trainAlerts = env.JARVIS_TRAIN_ALERTS?.trim() || "off";
  if (trainAlerts !== "on" && trainAlerts !== "off") throw new Error(`JARVIS_TRAIN_ALERTS must be on or off, not "${trainAlerts}"`);
  if (trainAlerts === "on" && hubTools !== "on") throw new Error("JARVIS_TRAIN_ALERTS is on, but train changes come from the hub, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_TRAIN_ALERTS=off");
  const brainQuestions = env.JARVIS_BRAIN_QUESTIONS?.trim() || "off";
  if (brainQuestions !== "on" && brainQuestions !== "off") throw new Error(`JARVIS_BRAIN_QUESTIONS must be on or off, not "${brainQuestions}"`);
  if (brainQuestions === "on" && hubTools !== "on") throw new Error("JARVIS_BRAIN_QUESTIONS is on, but your answers go to the brain's inbox through the hub, so it needs JARVIS_HUB_TOOLS=on too. Set that, or set JARVIS_BRAIN_QUESTIONS=off");
  const log = env.JARVIS_LOG ?? "";
  if (log === "") throw new Error("Missing setting: JARVIS_LOG (on or off)");
  if (log !== "on" && log !== "off") throw new Error(`JARVIS_LOG must be on or off, not "${log}"`);
  const clock = env.JARVIS_CLOCK?.trim() || "off";
  if (clock !== "on" && clock !== "off") throw new Error(`JARVIS_CLOCK must be on or off, not "${clock}"`);
  const web = env.JARVIS_WEB?.trim() || "off";
  if (!isWebMode(web)) throw new Error(`JARVIS_WEB must be ${webModes.join(" or ")}, not "${web}"`);
  const webBy = env.JARVIS_WEB_BY?.trim() || "claude";
  if (!isWebBy(webBy)) throw new Error(`JARVIS_WEB_BY must be ${webHelpers.join(" or ")}, not "${webBy}"`);
  const needsToken = web !== "off" && webBy === "claude";
  const webToken = env.JARVIS_WEB_TOKEN?.trim() || null;
  if (needsToken && webToken === null) throw new Error("Missing setting: JARVIS_WEB_TOKEN (the token claude setup-token prints), which look-ups by Claude Code need");
  if (needsToken && webToken !== null && /\s/.test(webToken)) throw new Error("JARVIS_WEB_TOKEN must be the token alone on one line, with no spaces in it");
  const webLog = env.JARVIS_WEB_LOG?.trim() || "off";
  if (webLog !== "on" && webLog !== "off") throw new Error(`JARVIS_WEB_LOG must be on or off, not "${webLog}"`);
  return { apiKey, engine, thinkingHistory, chats, lengthHints, lengthWarn, lengthCap, hubToken: hubTools === "on" ? token : null, hubActions: hubActions === "on", sessionNotes: sessionNotes === "on", voice, kokoroVoice, kokoroSpeed, piperVoice, volume, speechStart, speechStop, speechBundle: speechBundle === "on", spokenStyle: spokenStyle === "on", persona: persona === "off" ? null : persona, liveFacts: liveFacts === "on", filler: filler === "on", ears, earsToken: ears === "off" ? null : earsToken, followUp, turnCheck: turnCheck === "on", trainAlerts: trainAlerts === "on", brainQuestions: brainQuestions === "on", clock: clock === "on", web, webBy, webToken: needsToken ? webToken : null, webLog: webLog === "on", log: log === "on" };
}