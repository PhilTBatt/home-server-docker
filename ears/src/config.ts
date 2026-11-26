import { enders, type Ender } from "./levels.js";

export const microphones = ["pretend", "card"] as const;
export type Microphone = (typeof microphones)[number];

export type MicLevel = number | "keep";

export type MicSettings = { micLevel: MicLevel; micControl: string; micBoost: MicLevel; micBoostControl: string };

export type Config = { token: string; microphone: Microphone | null; wake: boolean; wakeEnd: Ender; wakePauseMs: number; turnWords: boolean } & MicSettings;

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

export function readTurnWords(value: string | undefined): boolean {
  const words = value?.trim() ?? "";
  if (words === "" || words === "off") return false;
  if (words !== "on") throw new Error(`EARS_TURN_WORDS must be on or off, not "${words}"`);
  return true;
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
  return { token, microphone: mic, micLevel: settings.micLevel, micControl: settings.micControl, micBoost: settings.micBoost, micBoostControl: settings.micBoostControl, wake: readWake(env.EARS_WAKE, mic), wakeEnd: readWakeEnd(env.EARS_WAKE_END), wakePauseMs: readWakePause(env.EARS_WAKE_PAUSE), turnWords: readTurnWords(env.EARS_TURN_WORDS) };
}
