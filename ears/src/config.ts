export const microphones = ["pretend", "card"] as const;
export type Microphone = (typeof microphones)[number];

export type MicLevel = number | "keep";

export type Config = { token: string; microphone: Microphone | null; micLevel: MicLevel; micControl: string; wake: boolean };

export const shortestToken = 32;
export const defaultMicLevel = 80;
export const defaultMicControl = "Capture";

function readMicLevel(value: string | undefined): MicLevel {
  const level = value?.trim() ?? "";
  if (level === "") return defaultMicLevel;
  if (level === "keep") return "keep";
  if (/^\d{1,3}$/.test(level) && Number(level) <= 100) return Number(level);
  throw new Error(`EARS_MIC_LEVEL must be a whole number from 0 to 100, or keep to leave the card's own level, not "${level}"`);
}

function readMicControl(value: string | undefined): string {
  const control = value?.trim() ?? "";
  if (control === "") return defaultMicControl;
  if (/^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(control)) return control;
  throw new Error(`EARS_MIC_CONTROL must be a mixer control's name, like Capture or Mic, as amixer scontrols lists them, not "${control}"`);
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
  return { token, microphone: mic, micLevel: readMicLevel(env.EARS_MIC_LEVEL), micControl: readMicControl(env.EARS_MIC_CONTROL), wake: readWake(env.EARS_WAKE, mic) };
}
