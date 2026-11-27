import { enders, type Ender } from "./levels.js";

export const microphones = ["pretend", "card"] as const;
export type Microphone = (typeof microphones)[number];

export type MicLevel = number | "keep";

export type MicSettings = { micLevel: MicLevel; micControl: string; micBoost: MicLevel; micBoostControl: string };

export const voiceIdModes = ["off", "observe", "require"] as const;
export type VoiceIdMode = (typeof voiceIdModes)[number];

export type VoiceIdSettings = { mode: VoiceIdMode; threshold: number; owner?: string };

export const defaultVoiceOwner = "voiceprint";
export const voiceNamePattern = /^[a-z0-9-]{1,20}$/;

export const defaultVoiceIdThreshold = 0.5;

export type Config = { token: string; microphone: Microphone | null; wake: boolean; wakeEnd: Ender; wakePauseMs: number; turnWords: boolean; interrupt: Interrupt; voiceId: VoiceIdSettings } & MicSettings;

export const wakePauses = { least: 1, most: 5, usual: 1.5 };

export const shortestToken = 32;
export const defaultMicLevel = 80;
export const defaultMicControl = "Capture";
export const defaultMicBoostControl = "Internal Mic Boost";
export const mostBoostSteps = 10;

function readMicLevel(value: string | undefined): MicLevel {
  const level = value?.trim() ?? "";
  if (level === "") return defaultMicLevel;
  if (level === "keep") return "keep";
  if (/^\d{1,3}$/.test(level) && Number(level) <= 100) return Number(level);
  throw new Error(`EARS_MIC_LEVEL must be a whole number from 0 to 100, or keep to leave the card's own level, not "${level}"`);
}

function readMicBoost(value: string | undefined): MicLevel {
  const boost = value?.trim() ?? "";
  if (boost === "" || boost === "keep") return "keep";
  if (/^\d{1,2}$/.test(boost) && Number(boost) <= mostBoostSteps) return Number(boost);
  throw new Error(`EARS_MIC_BOOST must be a whole number of steps from 0 to ${mostBoostSteps}, or keep to leave the card's own boost, not "${boost}"`);
}

function readControl(name: string, value: string | undefined, fallback: string, like: string): string {
  const control = value?.trim() ?? "";
  if (control === "") return fallback;
  if (/^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(control)) return control;
  throw new Error(`${name} must be a mixer control's name, like ${like}, as amixer scontrols lists them, not "${control}"`);
}

export function readMicSettings(env: Record<string, string | undefined>): MicSettings {
  return {
    micLevel: readMicLevel(env.EARS_MIC_LEVEL),
    micControl: readControl("EARS_MIC_CONTROL", env.EARS_MIC_CONTROL, defaultMicControl, "Capture or Mic"),
    micBoost: readMicBoost(env.EARS_MIC_BOOST),
    micBoostControl: readControl("EARS_MIC_BOOST_CONTROL", env.EARS_MIC_BOOST_CONTROL, defaultMicBoostControl, "Internal Mic Boost or Mic Boost"),
  };
}

export function readWakeEnd(value: string | undefined): Ender {
  const end = value?.trim() ?? "";
  if (end === "") return "loudness";
  if ((enders as readonly string[]).includes(end)) return end as Ender;
  throw new Error(`EARS_WAKE_END must be loudness or silero, not "${end}"`);
}

export function readWakePause(value: string | undefined): number {
  const pause = value?.trim() ?? "";
  if (pause === "") return wakePauses.usual * 1000;
  const seconds = Number(pause);
  if (!/^[0-9](\.[0-9])?$/.test(pause) || seconds < wakePauses.least || seconds > wakePauses.most) throw new Error(`EARS_WAKE_PAUSE must be a number of seconds from ${wakePauses.least} to ${wakePauses.most}, with at most one decimal place, like 1.5 or 2.5, not "${pause}"`);
  return Math.round(seconds * 1000);
}

export const interrupts = ["off", "wake", "speech"] as const;
export type Interrupt = (typeof interrupts)[number];

export function readInterrupt(value: string | undefined): Interrupt {
  const mode = value?.trim() || "off";
  if (mode !== "off" && mode !== "wake" && mode !== "speech") throw new Error(`EARS_INTERRUPT must be off, wake or speech, not "${mode}"`);
  return mode;
}

export function readTurnWords(value: string | undefined): boolean {
  const words = value?.trim() ?? "";
  if (words === "" || words === "off") return false;
  if (words !== "on") throw new Error(`EARS_TURN_WORDS must be on or off, not "${words}"`);
  return true;
}

export function readVoiceIdMode(value: string | undefined): VoiceIdMode {
  const mode = value?.trim() ?? "";
  if (mode === "") return "off";
  if ((voiceIdModes as readonly string[]).includes(mode)) return mode as VoiceIdMode;
  throw new Error(`EARS_VOICE_ID must be off, observe or require, not "${mode}"`);
}

export function readVoiceIdThreshold(value: string | undefined): number {
  const threshold = value?.trim() ?? "";
  if (threshold === "") return defaultVoiceIdThreshold;
  if (!/^0\.[0-9]{1,2}$/.test(threshold) || Number(threshold) === 0) throw new Error(`EARS_VOICE_ID_THRESHOLD must be a number above 0 and below 1, with up to 2 decimal places, like 0.5 or 0.45, not "${threshold}"`);
  return Number(threshold);
}

export function readVoiceOwner(value: string | undefined): string {
  const owner = value?.trim() ?? "";
  if (owner === "") return defaultVoiceOwner;
  if (!voiceNamePattern.test(owner)) throw new Error(`EARS_VOICE_OWNER must be the name of a voiceprint in ears/voice, 1 to 20 of a to z, 0 to 9 and -, like ${defaultVoiceOwner}, not "${owner}"`);
  return owner;
}

export function readVoiceIdSettings(env: Record<string, string | undefined>): VoiceIdSettings {
  return { mode: readVoiceIdMode(env.EARS_VOICE_ID), threshold: readVoiceIdThreshold(env.EARS_VOICE_ID_THRESHOLD), owner: readVoiceOwner(env.EARS_VOICE_OWNER) };
}

function readWake(value: string | undefined, microphone: Microphone | null): boolean {
  const wake = value?.trim() ?? "";
  if (wake === "" || wake === "off") return false;
  if (wake !== "on") throw new Error(`EARS_WAKE must be on or off, not "${wake}"`);
  if (microphone === null) throw new Error("EARS_WAKE is on, but EARS_MICROPHONE isn't set, so there's nothing to listen with. Set EARS_MICROPHONE=card, or pretend to try it out");
  return true;
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const token = env.EARS_TOKEN?.trim() ?? "";
  if (token === "") throw new Error("Missing setting: EARS_TOKEN. Make one with: openssl rand -hex 32");
  if (token.length < shortestToken) throw new Error(`EARS_TOKEN must be at least ${shortestToken} characters, like the 64 that openssl rand -hex 32 makes`);
  const microphone = env.EARS_MICROPHONE?.trim() || "";
  if (microphone !== "" && !(microphones as readonly string[]).includes(microphone)) throw new Error(`EARS_MICROPHONE must be pretend or card, or left out until a microphone is set up, not "${microphone}"`);
  const mic = microphone === "" ? null : (microphone as Microphone);
  const settings = readMicSettings(env);
  return { token, microphone: mic, micLevel: settings.micLevel, micControl: settings.micControl, micBoost: settings.micBoost, micBoostControl: settings.micBoostControl, wake: readWake(env.EARS_WAKE, mic), wakeEnd: readWakeEnd(env.EARS_WAKE_END), wakePauseMs: readWakePause(env.EARS_WAKE_PAUSE), turnWords: readTurnWords(env.EARS_TURN_WORDS), interrupt: readInterrupt(env.EARS_INTERRUPT), voiceId: readVoiceIdSettings(env) };
}
